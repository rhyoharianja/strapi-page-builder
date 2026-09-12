import type { Core } from '@strapi/strapi';

import bridge from './bridge';
import preview from './preview';
import settings from './settings';

/**
 * Annotated rather than inferred.
 *
 * Without the annotation TypeScript writes the emitted `.d.ts` in terms of a path inside
 * `.pnpm/@strapi+types@…`, which no consumer can resolve — TS2742. Naming the shape locally,
 * referencing only `@strapi/strapi`, keeps the declaration portable (see the same pattern in
 * `server/src/index.ts`).
 */
type Factory = (context: { strapi: Core.Strapi }) => unknown;

const controllers: Record<string, Factory> = { bridge, preview, settings };

export default controllers;
