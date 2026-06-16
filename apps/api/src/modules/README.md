# modules/

<!-- TODO: domain modules -->

Domain feature modules will live here (one folder per bounded context, e.g.
`rides/`, `bookings/`, `users/`). Each module exports an `OpenAPIHono` sub-app
that `app.ts` mounts. **Empty on purpose** in the base skeleton — no domain
logic yet.
