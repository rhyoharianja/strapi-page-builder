import { errors } from '@strapi/utils';

import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../../shared';

/** Scopes a preview token may exercise. Reading published-or-draft content, and nothing else. */
const READ = /\.(find|findOne)$/;

/**
 * Let a preview token read draft content through the ordinary content API.
 *
 * **Why a strategy rather than a proxy endpoint.** The alternative was a plugin route that
 * fetches a document and hands it back, and it forces every front end to learn a second, plugin-
 * shaped API purely for preview — different URL, different response envelope, different filters.
 * Registering an auth strategy instead means the site keeps calling `/api/pages?...` exactly as
 * it does in production and changes two things: one header, and `status=draft`. Everything a
 * front end already knows about querying Strapi keeps working inside the builder.
 *
 * The strategy is deliberately incapable of more than reading. `authenticate` claims only
 * requests carrying one of this plugin's own tokens, so every other request still falls through
 * to Strapi's usual public and API-token strategies; `verify` then refuses any scope that is not
 * a `find` or `findOne`. A leaked token can read unpublished content until it expires — which is
 * the capability being granted, and the reason it expires in half an hour.
 */
export const registerPreviewStrategy = (strapi: Core.Strapi): void => {
  const auth = (strapi as unknown as { get?: (name: string) => unknown }).get?.('auth') as
    | { register?: (type: string, strategy: unknown) => void }
    | undefined;

  if (!auth?.register) {
    strapi.log.warn(
      `[${PLUGIN_ID}] could not register the preview auth strategy — draft preview will be unavailable`
    );
    return;
  }

  auth.register('content-api', {
    name: `${PLUGIN_ID}-preview`,

    async authenticate(ctx: any) {
      const service = strapi.plugin(PLUGIN_ID).service('preview');
      const token = service.fromRequest(ctx);

      // Not ours: say so plainly so the next strategy gets its turn.
      if (!token || !service.verify(token)) return { authenticated: false };

      return {
        authenticated: true,
        credentials: { type: 'preview' },
      };
    },

    verify(auth: { credentials?: { type?: string } }, config: { scope?: string | string[] }) {
      if (auth?.credentials?.type !== 'preview') {
        throw new errors.UnauthorizedError();
      }

      const scopes = config?.scope ? [config.scope].flat() : [];

      /*
       * An empty scope means the route declared none — an unguarded custom route. Refused rather
       * than allowed: a preview token must never be the credential that opens something whose
       * permissions nobody thought about.
       */
      if (scopes.length === 0 || !scopes.every((scope) => READ.test(scope))) {
        throw new errors.ForbiddenError('Preview tokens may only read content');
      }
    },
  });

  strapi.log.info(`[${PLUGIN_ID}] preview auth strategy registered (read-only, 30 min tokens)`);
};
