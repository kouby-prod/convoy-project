# syntax=docker/dockerfile:1
# Production API image. Build context = repo root:
#   docker build -f Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- install all workspace deps (build needs tsup / typescript) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile

# ---- build (tsup bundles @carpool/* into dist) ----
FROM deps AS build
COPY . .
RUN pnpm --filter @carpool/api build

# ---- production node_modules only (no tsup, vitest, drizzle-kit, …) ----
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile --prod

# ---- runtime: no app source, no secrets, no devDependencies ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
# Workspace package is a symlink target for node_modules/@carpool/schemas.
# tsup already inlined it; this keeps the symlink from dangling.
COPY --from=build --chown=node:node /app/packages/schemas ./packages/schemas
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/drizzle ./drizzle
COPY --from=build --chown=node:node /app/apps/api/package.json ./package.json
USER node
EXPOSE 3001
# Default: HTTP. Compose `api-migrate` uses `node dist/migrate.js`.
# Compose `payment-worker` uses `node dist/payment-worker.js`.
CMD ["node", "dist/server.js"]
