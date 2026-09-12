import type { Core } from '@strapi/strapi';

import guardDrafts from './guard-drafts';

/**
 * Declared locally and referencing only `@strapi/strapi` so the emitted declaration stays
 * portable under pnpm (see `server/src/index.ts` — TS2742).
 *
 * Without the annotation TypeScript infers a type that names a path inside `node_modules/.pnpm`,
 * refuses to emit it, and drops this module's `.d.ts` entirely — quietly, because the bundled
 * JavaScript still builds and the package still publishes.
 */
type Middlewares = Record<
  string,
  (config: unknown, context: { strapi: Core.Strapi }) => (ctx: unknown, next: () => Promise<void>) => Promise<unknown>
>;

const middlewares: Middlewares = { 'guard-drafts': guardDrafts };

export default middlewares;
