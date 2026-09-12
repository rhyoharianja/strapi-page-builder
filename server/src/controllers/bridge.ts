import fs from 'node:fs';
import path from 'node:path';

import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../../shared';
import { PROTOCOL_VERSION } from '../../../shared/protocol';

/**
 * Where the bridge file sits relative to the built server bundle.
 *
 * `@strapi/sdk-plugin` emits `dist/server/index.js`, so the package root is two levels up and
 * `bridge/bridge.js` is shipped beside `dist` via `files` in package.json. The second candidate
 * covers the ESM bundle, where `__dirname` does not exist, by resolving from the host app's own
 * `node_modules` instead.
 */
const candidates = (): string[] => {
  const list: string[] = [];

  if (typeof __dirname !== 'undefined') {
    list.push(path.resolve(__dirname, '../../bridge/bridge.js'));
    list.push(path.resolve(__dirname, '../bridge/bridge.js'));
  }

  list.push(
    path.resolve(process.cwd(), 'node_modules', `strapi-plugin-${PLUGIN_ID}`, 'bridge/bridge.js')
  );

  return list;
};

/** Read once. The file never changes at runtime, and this route is hit on every page load. */
let cached: string | null = null;

const read = (): string | null => {
  if (cached !== null) return cached;

  for (const candidate of candidates()) {
    try {
      cached = fs.readFileSync(candidate, 'utf8');
      return cached;
    } catch {
      continue;
    }
  }

  return null;
};

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Serve the front-end bridge.
   *
   * Unauthenticated on purpose: this is a public static asset that a browser fetches from
   * whatever origin the site is on, and it contains no data — only the protocol. Serving it
   * from Strapi rather than asking each site to vendor it is what guarantees the bridge and
   * the admin that talks to it are always the same release.
   */
  async serve(ctx): Promise<void> {
    if (strapi.config.get(`plugin::${PLUGIN_ID}.serveBridge`) === false) {
      return ctx.notFound('Bridge serving is disabled');
    }

    const source = read();

    if (source === null) {
      strapi.log.error(`[${PLUGIN_ID}] bridge.js not found in the installed package`);
      return ctx.notFound('Bridge script not found');
    }

    ctx.type = 'application/javascript; charset=utf-8';
    /*
     * Short cache with revalidation rather than `immutable`: the URL has no version in it, so a
     * long cache would pin an editor's browser to an old protocol after a plugin upgrade and
     * produce a version mismatch that clears itself only on a hard reload.
     */
    ctx.set('Cache-Control', 'public, max-age=60, must-revalidate');
    ctx.set('X-Strapi-Visual-Editor-Protocol', String(PROTOCOL_VERSION));
    ctx.body = source;
  },
});

export default controller;
