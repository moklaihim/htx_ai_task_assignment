// Barrel export (design §1: `src/types/` — shared TS types). Kept dependency-free
// (no `pg`, no Express) so the frontend can import the same shapes later without
// pulling in backend-only code (design §6.5).
export * from './task.js';
export * from './developer.js';
export * from './error.js';
