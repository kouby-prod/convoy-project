# Notification System Architecture

Research notes on how production notification systems are typically built, followed by a
concrete recommendation for this repo's stack (Hono + Drizzle/Postgres + ioredis + BullMQ + `ws`
on the API side, Next.js + TanStack Query on the web side).

## 1. General architecture (industry pattern)

Most notification systems converge on the same layered shape, regardless of scale:

```
Event source ──▶ Queue/bus ──▶ Notification service ──▶ Channel dispatchers ──▶ Provider
 (domain code)   (decouples)    (preferences, dedup,      (email/SMS/push/      (SES, FCM,
                                 fan-out, rate limit)       in-app workers)       Twilio...)
                                        │
                                        ▼
                              Notification store (per-user inbox)
                                        │
                                        ▼
                         Real-time channel (WebSocket/SSE + pub/sub)
                                        │
                                        ▼
                                  Connected clients
```

**Core components:**

- **Event source** — domain code (booking confirmed, message received, trip cancelled) emits an
  event instead of calling a notifier directly. Decoupling this from delivery is what lets you
  add channels later without touching business logic.
- **Queue/bus** (Kafka/SNS/SQS/BullMQ at smaller scale) — buffers bursts, decouples producers
  from delivery latency, and enables retries without blocking the request that triggered the
  event.
- **Notification service** — the orchestration layer: resolves the user's preferences, applies
  rate limits/dedup, and fans out to one job per active channel.
- **Preference engine** — per-channel enabled/disabled, quiet hours, category opt-outs
  (marketing/social/transactional/security). Evaluated before every dispatch; security/critical
  notifications can override.
- **Channel dispatchers** — one worker pool per channel (email via SES/SendGrid/nodemailer, push
  via FCM/APNs, SMS via Twilio, in-app via DB write + real-time push). Each channel fails and
  retries independently.
- **Notification store** — a per-user inbox table (Postgres/DynamoDB) backing the in-app channel:
  source of truth for unread counts, history, and offline sync.
- **Real-time delivery** — WebSocket or SSE connections held by connected clients, fed by a
  pub/sub backbone (Redis Pub/Sub, NATS) so any server instance can push to a socket held by any
  other instance. Typical flow: write to DB → publish to `user:{id}:notifications` → connected
  socket(s) push the frame → client updates UI optimistically → read receipt syncs back.
- **Retry / DLQ** — exponential backoff with jitter for transient failures; permanent failures
  land in a dead-letter queue for inspection instead of being silently dropped.

**Reliability & scale patterns worth knowing even if unused at current scale:**

- *Fan-out on write* (push to every recipient's inbox immediately) vs *fan-out on read* (compute
  relevance at query time) vs a *hybrid* for very high-fan-out accounts. Fan-out on write is the
  right default for a per-user notification inbox like this one.
- *Idempotency keys* (`event_id` + `user_id` + `channel`) so retries or duplicate event emission
  never double-send.
- *Hybrid push-pull*: the socket frame can carry the full payload (simple, what this repo does
  for messages) or just a lightweight "something changed, refetch" signal (lower payload risk,
  used at larger scale).
- *Presence-aware fallback*: if a user has no live socket, fall back to email/push instead of
  relying on them polling later.
- *Notification categories/types*: modeling `type` as data (not just a free-text title) is what
  lets the UI group, icon, filter, and let users opt out per-category.

## 2. What this repo already has

The `e275c56` commit built exactly this pattern for **chat messages only**:

- `apps/api/src/queue/redis.ts` — shared `ioredis` connection factory.
- `apps/api/src/queue/message-worker.ts` (BullMQ) — processes message jobs, publishes to Redis
  channel `messages:booking:{bookingId}`.
- `apps/api/src/realtime/hub.ts` (`MessageHub`) — per-instance in-memory socket map; each API
  instance `psubscribe`s `messages:booking:*` so a message created on instance A reaches a socket
  held by instance B.
- `apps/api/src/realtime/messages-ws.ts` — `GET /ws/messages`, authenticated via session/bearer
  token, clients `subscribe`/`unsubscribe` to specific `bookingId`s.

The notification system added in `9a0ce0e` reused the **store** half of the pattern (a
`notification` table, REST list/mark-read routes) but not the **real-time** half — it's pure
poll-on-a-timer. The fix is to reuse `MessageHub`'s exact shape for notifications rather than
invent a new mechanism (since implemented — see `apps/api/src/realtime/notification-hub.ts`).

## 3. Recommended architecture for this repo

Given current scale (single Postgres, single Redis, BullMQ already present, no plans for
SMS/push), the right target is the **in-app + email** slice of the general pattern, built by
mirroring the existing message infrastructure — not by introducing Kafka/SNS/a preference
service/etc., which would be over-engineering for the current traffic level.

```
Domain event (booking/trip/message code)
        │
        ▼
notifyUser(...)  ── inserts `notification` row (typed, with link) ──▶ Postgres
        │
        ├──▶ best-effort email (nodemailer, already exists)
        │
        └──▶ publish to Redis channel `notifications:user:{userId}`
                        │
                        ▼
              NotificationHub.psubscribe('notifications:user:*')
                        │
                        ▼
              GET /ws/notifications (per-user socket, no subscribe step needed —
              a user's socket receives all of their own notifications)
                        │
                        ▼
              Web client: WS listener updates TanStack Query cache directly
              (unread badge + list), falls back to the existing poll if the
              socket is down.
```

Concretely, evolve (not replace) the existing pieces:

1. **Schema**: add a `type` enum column (`booking_request | booking_status | trip_cancelled |
   message | system`) so the UI can group/icon/filter without string-matching titles; fix the
   `id` column type drift (`text` → `uuid` with `defaultRandom()`); actually populate `link` at
   call sites.
2. **Notification service**: keep `notifyUser` as the single write path (already correct — it's
   the "notification service" in miniature), but move it out of the `trajet` module into the
   `notification` module itself since it's a cross-domain concern, and have it publish to Redis
   after the DB write.
3. **Real-time**: add `NotificationHub` (same shape as `MessageHub`, simpler — keyed by `userId`
   directly, no per-booking subscribe step) and `GET /ws/notifications`.
4. **REST API**: add a cheap `GET /notifications/unread-count`, default ordering to newest-first,
   add a server-side `unreadOnly` filter.
5. **Frontend**: open the notification socket once (e.g. in the navbar/providers), update the
   TanStack Query cache on `notification.created` frames instead of relying solely on
   `staleTime` polling; keep the poll as a fallback for when the socket is disconnected.
6. **Preferences / rate limiting / DLQ**: explicitly out of scope for this pass — the app has one
   channel that matters (in-app) plus best-effort email, and volume is low enough that dropped
   emails don't need a retry queue yet. Revisit if SMS/push or per-category opt-out is ever
   requested.

## Sources

- [MagicBell — Notification System Design: Architecture & Best Practices](https://www.magicbell.com/blog/notification-system-design)
- [System Design Handbook — How to Design a Notification System](https://www.systemdesignhandbook.com/guides/design-a-notification-system/)
- [Codelit.io — Notification System Architecture: Channels, Fan-Out, and Delivery at Scale](https://codelit.io/blog/notification-system-architecture)
- [PubNub — What is Fan-Out Software?](https://www.pubnub.com/guides/what-is-fan-out-software/)
- [GetStream.io — Fan-Out glossary](https://getstream.io/glossary/fan-out/)
- [WebSocket.org — WebSocket Notifications: Real-time Push and In-App Delivery](https://websocket.org/guides/use-cases/notifications/)
- [Scalewithchintan — Scalable Notification System Design](https://scalewithchintan.com/blog/design-scalable-notification-system-architecture-best-practices)
- This repo's own `apps/api/src/queue/message-worker.ts` + `apps/api/src/realtime/hub.ts` — the
  existing WebSocket/Redis pattern for chat, used here as the reference implementation to mirror.
