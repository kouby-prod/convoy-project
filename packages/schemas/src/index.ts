// Shared contracts. Re-export every schema from here so consumers import from
// a single entry point: `import { PingResponseSchema } from '@carpool/schemas'`.
export * from './ping';
// Domain schema exports are appended below by `pnpm gen backend-feature`.
// plop:schemas
export * from './vehicle';
export * from './admin';
export * from './document';
export * from './contact';
export * from './geocode';
export * from './message';
export * from './notification';
export * from './review';
export * from './trajet';
