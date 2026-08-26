/**
 * End-to-end smoke for messaging: sign-up → verify → trajet → book →
 * REST messages → inbox → WebSocket fan-out.
 *
 * Usage (stack up on :3001): node apps/api/scripts/e2e-messaging.mjs
 */
import pg from 'pg';
import WebSocket from 'ws';

const API = process.env.API_URL ?? 'http://localhost:3001';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://carpool:carpool@localhost:5433/carpool';

const stamp = Date.now();
const driverEmail = `driver.msg.${stamp}@example.com`;
const passengerEmail = `passenger.msg.${stamp}@example.com`;
const password = 'TestPass123!';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const ORIGIN = 'http://localhost:3000';

async function signUp(name, email) {
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ name, email, password }),
  });
  const body = await json(res);
  assert(res.ok || res.status === 422, `sign-up ${email}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function verifyEmail(pool, email) {
  await pool.query('update "user" set email_verified = true where email = $1', [email]);
}

async function signIn(email) {
  const res = await fetch(`${API}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const body = await json(res);
  assert(res.ok, `sign-in ${email}: ${res.status} ${JSON.stringify(body)}`);
  const token = res.headers.get('set-auth-token');
  assert(token, `missing set-auth-token for ${email}`);
  return { token, user: body.user ?? body };
}

async function authed(token, path, init = {}) {
  const headers = {
    ...(init.headers ?? {}),
    Authorization: `Bearer ${token}`,
  };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const body = await json(res);
  return { res, body };
}

function waitForWsMessage(ws, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS timeout waiting for frame')), timeoutMs);
    const onMessage = (data) => {
      let parsed;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(parsed);
      }
    };
    ws.on('message', onMessage);
  });
}

async function main() {
  console.log('[e2e] health…');
  const health = await fetch(`${API}/health`);
  assert(health.ok, `health ${health.status}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  console.log('[e2e] sign-up driver + passenger…');
  await signUp('Driver Msg', driverEmail);
  await signUp('Passenger Msg', passengerEmail);
  await verifyEmail(pool, driverEmail);
  await verifyEmail(pool, passengerEmail);

  console.log('[e2e] sign-in…');
  const driver = await signIn(driverEmail);
  const passenger = await signIn(passengerEmail);

  const departureAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  console.log('[e2e] create trajet…');
  const created = await authed(driver.token, '/trajets', {
    method: 'POST',
    body: JSON.stringify({
      departureCity: 'Montreal',
      destinationCity: 'Quebec',
      departureDateTime: departureAt,
      seatsTotal: 3,
      pricePerSeat: 25,
    }),
  });
  assert(created.res.status === 201, `create trajet ${created.res.status} ${JSON.stringify(created.body)}`);
  const trajetId = created.body.id;

  console.log('[e2e] book seats…');
  const booked = await authed(passenger.token, `/trajets/${trajetId}/book`, {
    method: 'POST',
    body: JSON.stringify({ seats: 1 }),
  });
  assert(booked.res.status === 201, `book ${booked.res.status} ${JSON.stringify(booked.body)}`);
  const bookingId = booked.body.id;

  console.log('[e2e] open WS as driver and subscribe…');
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/ws/messages?token=${encodeURIComponent(driver.token)}`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'subscribe', bookingId }));
  const subscribed = await waitForWsMessage(ws, (f) => f.type === 'subscribed' && f.bookingId === bookingId);
  assert(subscribed.type === 'subscribed', 'expected subscribed frame');

  console.log('[e2e] passenger posts message…');
  const livePromise = waitForWsMessage(
    ws,
    (f) => f.type === 'message.created' && f.message?.body === 'Pickup at Gare Centrale?',
  );
  const posted = await authed(passenger.token, `/bookings/${bookingId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: 'Pickup at Gare Centrale?' }),
  });
  assert(posted.res.status === 201, `post message ${posted.res.status} ${JSON.stringify(posted.body)}`);

  const live = await livePromise;
  assert(live.message.id === posted.body.id, 'WS payload id mismatch');
  console.log('[e2e] WS fan-out OK');

  console.log('[e2e] list messages + inbox…');
  const list = await authed(driver.token, `/bookings/${bookingId}/messages?limit=20`);
  assert(list.res.status === 200, `list messages ${list.res.status}`);
  assert(list.body.items.some((m) => m.id === posted.body.id), 'message missing from list');

  const inbox = await authed(driver.token, '/messages/conversations?limit=20');
  assert(inbox.res.status === 200, `inbox ${inbox.res.status}`);
  assert(
    inbox.body.items.some((c) => c.bookingId === bookingId && c.lastMessage?.body?.includes('Gare')),
    'inbox missing conversation',
  );

  ws.close();
  await pool.end();

  console.log('[e2e] web pages…');
  for (const path of ['/', '/messages', '/en/messages']) {
    const res = await fetch(`http://localhost:3000${path}`);
    assert(res.ok, `web ${path} → ${res.status}`);
  }

  console.log('[e2e] ALL PASSED');
}

main().catch((err) => {
  console.error('[e2e] FAILED', err);
  process.exit(1);
});
