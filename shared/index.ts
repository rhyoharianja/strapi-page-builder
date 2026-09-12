/**
 * The plugin's public contract, for whoever renders the site.
 *
 * A front end integrating with the visual builder needs three things and none of them are
 * Strapi-runtime code: the attribute names to emit, the way a source is spelled, and the
 * message shapes if it wants to talk to the builder itself. All of that is here, importable
 * from a Nuxt, Next, SvelteKit or plain-Vite bundle:
 *
 * ```ts
 * import { encodeSource, ATTR } from 'strapi-page-builder/shared';
 * ```
 *
 * Nothing exported here imports Strapi, React or the DOM.
 */

export {
  ATTR,
  decodeSource,
  encodeSource,
  readPath,
  sameEntry,
  sourceKey,
  writePath,
  type StrapiSource,
} from './source';

export {
  CHANNEL,
  PROTOCOL_VERSION,
  unwrap,
  wrap,
  type AdminMessage,
  type BridgeMessage,
  type Envelope,
  type SourceHit,
  type SourceRect,
  type ZoneHit,
} from './protocol';

export const PLUGIN_ID = 'page-builder' as const;
