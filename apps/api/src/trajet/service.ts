import { pool } from '../db/client';
import { db } from '../db/client';
import { trajet as trajetTable, booking as bookingTable } from '../db/trajet-schema';
import { randomUUID } from 'crypto';

export type CreateTrajetInput = {
  departureCity: string;
  arrivalCity: string;
  departureAt: string; // ISO
  seatsTotal: number;
  pricePerSeat: string | number;
  description?: string | null;
};

export async function createTrajet(driverId: string, input: CreateTrajetInput) {
  const id = randomUUID();
  const now = new Date();
  await db.insert(trajetTable).values({
    id,
    driverId,
    departureCity: input.departureCity,
    arrivalCity: input.arrivalCity,
    departureAt: new Date(input.departureAt),
    seatsTotal: input.seatsTotal,
    seatsAvailable: input.seatsTotal,
    pricePerSeat: input.pricePerSeat as any,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function getTrajetById(id: string) {
  const res = await pool.query('SELECT * FROM trajet WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function searchTrajets(opts: {
  departureCity?: string;
  arrivalCity?: string;
  date?: string; // ISO date
  limit?: number;
  offset?: number;
}) {
  const clauses: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (opts.departureCity) {
    clauses.push(`departure_city ILIKE $${idx}`);
    params.push(`%${opts.departureCity}%`);
    idx++;
  }
  if (opts.arrivalCity) {
    clauses.push(`arrival_city ILIKE $${idx}`);
    params.push(`%${opts.arrivalCity}%`);
    idx++;
  }
  if (opts.date) {
    const d = new Date(opts.date);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    clauses.push(`departure_at BETWEEN $${idx} AND $${idx + 1}`);
    params.push(start.toISOString(), end.toISOString());
    idx += 2;
  }

  let sql = 'SELECT * FROM trajet';
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY departure_at ASC';
  if (opts.limit) {
    sql += ` LIMIT $${idx}`;
    params.push(opts.limit);
    idx++;
  }
  if (opts.offset) {
    sql += ` OFFSET $${idx}`;
    params.push(opts.offset);
    idx++;
  }

  const res = await pool.query(sql, params);
  return res.rows;
}

export async function bookSeats(trajetId: string, passengerId: string, seats: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT seats_available FROM trajet WHERE id = $1 FOR UPDATE', [trajetId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Trajet not found');
    }
    const available = rows[0].seats_available;
    if (available < seats) {
      await client.query('ROLLBACK');
      throw new Error('Not enough seats available');
    }
    const bookingId = randomUUID();
    await client.query(
      'INSERT INTO booking(id, trajet_id, passenger_id, seats, status, created_at, updated_at) VALUES($1,$2,$3,$4,$5,now(),now())',
      [bookingId, trajetId, passengerId, seats, 'confirmed'],
    );
    await client.query('UPDATE trajet SET seats_available = seats_available - $1, updated_at = now() WHERE id = $2', [seats, trajetId]);
    await client.query('COMMIT');
    return { id: bookingId };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
