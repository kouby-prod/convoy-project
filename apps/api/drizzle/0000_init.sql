-- No-op initial migration.
-- The base skeleton deliberately creates ZERO domain tables.
-- This keeps the migration pipeline wired and runnable; the first real
-- migration will be produced by `pnpm db:generate` once domain tables exist.
SELECT 1;
