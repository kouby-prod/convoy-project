# Geolocation System Architecture

Research notes on how production live-location-tracking systems are typically built, followed by
a concrete recommendation for this repo's stack (Hono + Drizzle/Postgres + ioredis + BullMQ + `ws`
on the API side, Next.js + TanStack Query on the web side). Written as a companion to
[notification-system-architecture.md](./notification-system-architecture.md) — same method, same
repo, mirrored infrastructure where it makes sense.

## 1. General architecture (industry pattern)

Ride-sharing/ride-hailing location tracking converges on a shape that looks like the notification
pipeline but optimized for a very different traffic profile: high-frequency, ephemeral,
loss-tolerant writes instead of durable, low-frequency events.

```
Driver device ──▶ Ingestion (HTTP/WS) ──▶ Location cache ──▶ Pub/sub ──▶ Real-time channel ──▶ Rider client
 (GPS ping,          (validate, auth,       (Redis GEO/hash,   (fan-out    (WebSocket/SSE)      (map marker,
  every 3-10s)         rate-limit)           short TTL,         across      per active trip)      ETA update)
                                              ephemeral)         instances)
                                                   │
                                                   ▼ (optional, async)
                                        Breadcrumb history store
                                        (time-series/append log,
                                         for ETA analytics/disputes)
```

**Core components:**

- **Ingestion** — the driver app sends GPS pings over HTTP POST or an already-open WebSocket.
  Unlike domain events (booking confirmed), a dropped location ping is fine to lose — no queue/DLQ
  is needed on this path, just validation and a per-trip rate limit to protect the write path and
  the driver's battery.
- **Location cache** — the current position is ephemeral: only the *latest* value per active trip
  matters, not a full history. Redis is the standard choice — either a plain hash keyed by trip id
  with a short TTL (10-60s, doubling as staleness detection), or Redis's native geospatial type
  (`GEOADD`/`GEOSEARCH`, a wrapper around a sorted set that interleaves lat/lng into a geohash) when
  "who's nearby" queries are also needed. A relational database is the wrong tool for this: at
  ride-hailing scale (millions of drivers pinging every few seconds) the write volume would
  overwhelm Postgres; at any scale it's wasted durability for data that's stale in seconds.
- **Pub/sub fan-out** — same problem the chat/notification system already solves: a location
  update written on one API instance must reach a rider's socket held by another instance. Redis
  Pub/Sub (or a dedicated channel per trip) is the standard low-latency answer at this scale.
- **Real-time channel** — WebSocket (or SSE) holds the connection open for the duration of the
  trip; one connection per rider/driver pair (or per trip), not a general-purpose firehose.
- **Breadcrumb history (optional)** — if trip replay, ETA-accuracy analytics, or dispute
  resolution ("the driver says they arrived, the rider says they didn't") is needed, periodic
  samples (not every ping) are written asynchronously to a time-series/append-only store, off the
  request path.

**Reliability & scale patterns worth knowing even if unused at current scale:**

- *Downsampling on the client*: send on a distance/time filter (e.g. only if moved >20m or >4s
  elapsed) rather than on every GPS event, to save battery and bandwidth.
- *TTL as liveness signal*: letting the cached location expire (rather than requiring an explicit
  "driver went offline" event) is a simple, robust way to detect a dead connection or a killed app.
- *Geospatial index only when proximity queries are needed*: `GEOADD`/`GEOSEARCH` earns its keep
  when you need "drivers within 2km," not for a 1:1 trip-tracking view, which only ever needs the
  single latest point for that trip.
- *Trip-scoped sharing window*: location must only be broadcast while a trip is actually active,
  and access must be restricted to the specific rider(s)/driver on that trip — never a public feed.
- *Push-pull hybrid*: the socket frame can carry the full `{lat, lng, heading, speed}` payload
  (simple, fine at this scale) or just a "refetch" signal for clients that poll a REST endpoint —
  the former is the right default here, same reasoning as the notification doc.

## 2. What this repo already has

Static geocoding only — no live tracking of any kind:

- `apps/api/src/db/trajet-schema.ts` — `trajet` has `departureLat`/`departureLng`/`arrivalLat`/
  `arrivalLng` (nullable `numeric`), populated once, best-effort, at trip create/update time.
- `apps/api/src/modules/trajet/geocoding.ts` — `geocodeCity()` calls OSM Nominatim (rate-limited to
  ~1 req/sec) and `geocodeAndStoreTrajetLocation()` writes the endpoint coordinates back
  fire-and-forget after create/update. This geocodes the *route's endpoints*, not a moving driver.
- `apps/api/src/modules/trajet/index.ts` — `nearLat`/`nearLng`/`radiusKm` search params, with
  Haversine distance computed in raw SQL for filter/sort and in JS for display. No PostGIS, no
  Redis `GEO*` commands — plain SQL is adequate at current search volume.
- **No trip-lifecycle state machine exists.** `booking.status` covers
  `pending | confirmed | rejected | cancelled | expired` (the *reservation* lifecycle), and
  `trajet.cancelledAt` is a soft-delete flag. Nothing models "driver started the trip" or "trip is
  currently in progress" — which live location sharing needs a hook into, since it must turn on and
  off around an active trip window, not run continuously.
- No map library in `apps/web/package.json` (no Leaflet, Mapbox GL, react-map-gl, Google Maps) —
  today's UI only ever renders static addresses/city names, never a map.
- `ioredis` and `ws` are already dependencies (`apps/api/package.json`), and the exact real-time
  plumbing this feature needs already exists in miniature for chat and notifications — see below.

The realtime infrastructure to mirror (built for chat, reused for notifications):

- `apps/api/src/queue/redis.ts` — `createRedisConnection(label)` factory.
- `apps/api/src/realtime/hub.ts` — `MessageHub`: in-memory `Map<socketId, …>` +
  `Map<bookingId, Set<socketId>>`, `register`/`unregister`/`subscribe`/`unsubscribe`, `start()`
  opens a dedicated Redis subscriber and `psubscribe('messages:booking:*')`, fans out parsed
  frames to matching sockets.
- `apps/api/src/realtime/notification-hub.ts` — `NotificationHub`: same shape, keyed by `userId`
  directly (no subscribe step — one channel per user), `psubscribe('notifications:user:*')`.
- `apps/api/src/realtime/messages-ws.ts` / `notifications-ws.ts` — `upgradeWebSocket` handlers.
  Auth via `auth.api.getSession()` (cookie or `Authorization: Bearer`, with `?token=` as a
  WS-upgrade fallback); unauthenticated connections are accepted then closed with
  `WS_CLOSE_UNAUTHORIZED = 4001`. Mounted directly on `app` (`app.get('/ws/…', handler)`) — outside
  the OpenAPI `routes` chain, so the typed RPC client stays clean.
- `apps/api/src/server.ts` — hubs/workers are started once at boot (`messageHub.start()`,
  `notificationHub.start()`, `startMessageWorker()`).
- Redis channel naming convention: `"{domain}:{entity}:{id}"` (`messages:booking:<id>`,
  `notifications:user:<id>`).

## 3. Recommended architecture for this repo

Given current scale (single Postgres, single Redis, no dedicated map/geo infra, no plans for
fleet-wide proximity search), the right target is **1:1 trip tracking** — mirroring the
`MessageHub`/`NotificationHub` shape for the real-time half, but deliberately *not* mirroring the
BullMQ queue used for messages, since location pings are loss-tolerant and don't need a
persisted/retryable job.

```
Driver client (watchPosition, throttled)
        │
        ▼
POST /trajets/{id}/location  (driver-only, only while trip is in_progress)
        │
        ├──▶ SETEX location:trajet:{id}  ttl=30s  {lat,lng,heading,speed,recordedAt} ──▶ Redis
        │
        └──▶ PUBLISH location:trajet:{id}  {type:'location.updated', …}
                        │
                        ▼
              LocationHub.psubscribe('location:trajet:*')
                        │
                        ▼
              GET /ws/location — client sends {type:'subscribe', trajetId}
              after connect; access-checked (must be the driver or a
              passenger with a confirmed booking on that trajet)
                        │
                        ▼
              Web client: WS listener updates a live map marker
              (Leaflet + OSM tiles, no existing map lib to reuse)
```

Concretely:

1. **Trip lifecycle (new, required prerequisite)**: add nullable `startedAt`/`completedAt`
   timestamps to `trajet` — same pattern already used for `cancelledAt`, rather than introducing a
   parallel status enum. Location ingestion and broadcast are only accepted while
   `startedAt IS NOT NULL AND completedAt IS NULL`. This also gives the product a "trip in
   progress" concept it currently lacks entirely.
2. **Ingestion**: `POST /trajets/{id}/location`, driver-only (must be `trajet.driverId`), body
   validated via a new `@carpool/schemas` `location.ts` contract (`lat`, `lng`, optional `heading`/
   `speed`/`accuracy`, `recordedAt`). Rate-limit to roughly one accepted update per few seconds per
   trip; reject or silently drop the rest rather than queuing them.
3. **Storage**: write only to Redis — a hash at `location:trajet:{id}` with a short TTL (e.g. 30s),
   not a new Postgres table. The TTL doubles as "driver's connection died" detection. No breadcrumb
   history table for this pass — if trip replay or ETA analytics is ever requested, add an async,
   downsampled write to a separate table then; don't build it speculatively now.
4. **Real-time**: add `LocationHub` (same shape as `MessageHub`: keyed by `trajetId`, explicit
   subscribe/unsubscribe, `psubscribe('location:trajet:*')`) and `GET /ws/location`, reusing the
   existing auth pattern (`WS_CLOSE_UNAUTHORIZED`, cookie/bearer/`?token=`). Access check mirrors
   `resolvePartyAccess` — driver or a passenger with `booking.status = 'confirmed'` on that trajet.
5. **No BullMQ queue for the hot path**: unlike messages, a lost location ping needs no retry or
   durability — publish straight from the route handler to Redis. Introducing a queue here would
   add latency and complexity for data that's obsolete within seconds anyway.
6. **Frontend**: no map library exists yet — add Leaflet with OSM raster tiles (free, no API key,
   consistent with the Nominatim geocoding already in use) rather than Mapbox GL/Google Maps, which
   would introduce a paid API key management concern for no current benefit. Open `/ws/location`
   scoped to the trip-tracking view, subscribe on mount, unsubscribe/close on unmount; fall back to
   showing the static departure/arrival pins when no live location is available (trip not started,
   or the cache entry has expired).
7. **Driver client**: `navigator.geolocation.watchPosition`, gated to the window the trip is
   `in_progress`, with a distance/time filter before each POST (e.g. skip sends under ~20m
   movement or under ~4s elapsed) to bound write volume and battery drain. Background location on
   a closed/backgrounded mobile browser tab is a real platform limitation — flagged here, not
   solved by this design.
8. **Explicitly out of scope for this pass**: Redis `GEOADD`/`GEOSEARCH` geospatial indexing (no
   "drivers near me" feature is planned; the existing Haversine SQL search over static endpoints is
   unrelated and already sufficient), PostGIS, routing/ETA engines, geofencing-based auto
   arrival-detection, and breadcrumb history persistence. Revisit if a fleet-proximity feature or
   post-trip analytics is ever requested.

## Sources

- [Hello Interview — Design a Ride-Sharing Service Like Uber](https://www.hellointerview.com/learn/system-design/problem-breakdowns/uber)
- [Redis — Geo Commands Tutorial: Location-Based Queries and Search](https://redis.io/tutorials/howtos/solutions/geo/getting-started/)
- [martinjoo.dev — Ride-sharing with Redis](https://martinjoo.dev/ride-sharing-with-redis)
- [Adrian Bailador — Real-time Driver Location Tracking in .NET: Redis GEO, State Buffer and SignalR](https://adrianbailador.github.io/blog/58-realtime-driver-location-dotnet/)
- [Altimetrik — Building Real-Time Tracking App: Node.js, Open Layers, Redis, WebSocket Guide](https://www.altimetrik.com/blog/real-time-tracking-using-node-js-websockets-redis-and-open-layers/)
- [oneuptime.com — How to Build Location Features with Redis Geospatial Indexes](https://oneuptime.com/blog/post/2026-01-25-redis-geospatial-location-features/view)
- This repo's own `apps/api/src/realtime/hub.ts` + `notification-hub.ts` + `queue/redis.ts` — the
  existing WebSocket/Redis pattern for chat and notifications, used here as the reference shape to
  mirror for the real-time half only.
