import crypto from 'node:crypto';

import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../../shared';

/**
 * Short-lived tokens that let the canvas read **draft** content.
 *
 * **Why a token of our own, and not a Strapi API token.** The front end has to be able to fetch
 * unpublished content while it is being framed by the builder, and the only credential a browser
 * can carry is one handed to it. Handing it a Strapi API token would put a key to the whole
 * content API into a page — one that does not expire, is not scoped to reading, and is now in
 * whatever the browser caches. These tokens expire in minutes, authorise nothing but `find` and
 * `findOne`, and are never written into a URL: the admin passes one to the iframe over
 * `postMessage`, so only an already-authenticated admin's browser ever holds one.
 *
 * The signature is an HMAC over the expiry, keyed by the app's own secret. That is enough: the
 * token carries no identity and grants no choice, so there is nothing inside it worth encrypting
 * — only something worth making unforgeable.
 */

const PURPOSE = 'strapi-page-builder:preview';

/** Long enough for an editing session, short enough that a leaked token is worthless by lunch. */
const TTL_MS = 30 * 60 * 1000;

const secretOf = (strapi: Core.Strapi): string => {
  const keys = strapi.config.get('server.app.keys') as string[] | undefined;
  const admin = strapi.config.get('admin.auth.secret') as string | undefined;

  /*
   * Falls back to the admin secret, then to a per-boot random value. The random fallback means a
   * misconfigured app still works and simply invalidates tokens on restart — much better than
   * signing with a constant, which is the failure mode that looks fine and is not.
   */
  return keys?.[0] ?? admin ?? crypto.randomBytes(32).toString('hex');
};

const sign = (strapi: Core.Strapi, expiresAt: number): string =>
  crypto
    .createHmac('sha256', secretOf(strapi))
    .update(`${PURPOSE}:${expiresAt}`)
    .digest('base64url');

const preview = ({ strapi }: { strapi: Core.Strapi }) => ({
  issue(): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + TTL_MS;

    return { token: `v1.${expiresAt}.${sign(strapi, expiresAt)}`, expiresAt };
  },

  /** Whether a token is one of ours and still valid. Never throws — a bad token is just `false`. */
  verify(token?: string | null): boolean {
    if (!token) return false;

    const [version, expiry, signature] = token.split('.');

    if (version !== 'v1' || !expiry || !signature) return false;

    const expiresAt = Number(expiry);

    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

    const expected = sign(strapi, expiresAt);

    // Constant-time, because a signature check that leaks timing leaks the signature.
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  /** Read a preview token off a request: `Authorization: Bearer …` only. */
  fromRequest(ctx: { request: { header: Record<string, string | undefined> } }): string | null {
    const header = ctx.request.header.authorization;

    if (!header?.startsWith('Bearer ')) return null;

    const token = header.slice('Bearer '.length).trim();

    return token.startsWith('v1.') ? token : null;
  },

  get pluginId(): string {
    return PLUGIN_ID;
  },
});

export default preview;
