import { pool } from '../db/client';
import { randomUUID } from 'crypto';

export type CreateTrajetInput = {
  departureCity: string;
  destinationCity: string;
  departureDateTime: string; // ISO
  seatsTotal: number;
  pricePerSeat: string | number;
  description?: string | null;
};

export async function createTrajet(driverId: string, input: CreateTrajetInput) {
  const id = randomUUID();
  const createdAt = new Date();
  const updatedAt = createdAt;

  await pool.query(
    `INSERT INTO trajet (id, driver_id, departure_city, arrival_city, departure_at, seats_total, seats_available, price_per_seat, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      driverId,
      input.departureCity,
      input.destinationCity,
      input.departureDateTime,
      input.seatsTotal,
      input.seatsTotal,
      String(input.pricePerSeat),
      input.description ?? null,
      createdAt.toISOString(),
      updatedAt.toISOString(),
    ],
  );

  return { id };
}

export async function getTrajetById(id: string) {
  const res = await pool.query('SELECT * FROM trajet WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function searchTrajets(opts: {
  departureCity?: string;
  destinationCity?: string;
  date?: string; // ISO date
  limit?: number;
  offset?: number;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (opts.departureCity) {
    clauses.push(`departure_city ILIKE $${idx}`);
    params.push(`%${opts.departureCity}%`);
    idx++;
  }
  if (opts.destinationCity) {
    clauses.push(`arrival_city ILIKE $${idx}`);
    params.push(`%${opts.destinationCity}%`);
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
    if (opts.limit || opts.offset) {
      idx += 2;
    }
  }

  let sql = 'SELECT * FROM trajet';
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY departure_at ASC';
  if (opts.limit) {
    sql += ` LIMIT $${idx}`;
    params.push(opts.limit);
    if (opts.offset) idx++;
  }
  if (opts.offset) {
    sql += ` OFFSET $${idx}`;
    params.push(opts.offset);
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
  } catch (err: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
