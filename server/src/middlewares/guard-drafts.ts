import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../../shared';

/**
 * Stop `?status=draft` from serving unpublished content to anyone who asks.
 *
 * **This closes a real hole, and it is not one this plugin opened.** Strapi 5 honours
 * `?status=draft` on the content API for any caller whose role holds `find` — which the Public
 * role does on every collection a front end reads. Verified on this project: an anonymous
 * `GET /api/pages?…&status=draft` returned an entry that had been saved but deliberately not
 * published. Every draft on the site is one query parameter away from being public.
 *
 * Without this guard the preview token would also be decorative: the canvas could read drafts,
 * but so could everybody else, so the token would be protecting nothing.
 *
 * The guard downgrades rather than refuses. A request asking for drafts without the right to see
 * them gets the published version, exactly as if it had not asked — so a misconfigured front end
 * degrades to correct behaviour instead of breaking, and a prober learns nothing from the
 * response. Set `guardDrafts: false` in the plugin config if a project genuinely wants draft
 * reads open to its API tokens.
 */
const guardDrafts = (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.query?.status !== 'draft') return next();

    const preview = strapi.plugin(PLUGIN_ID).service('preview');
    const token = preview.fromRequest(ctx);

    if (token && preview.verify(token)) return next();

    /*
     * Reassigning `ctx.query` is what actually rewrites the request — Koa recomputes the
     * querystring from it, and the controllers downstream read the parsed object rather than the
     * raw string. Deleting the key alone leaves `ctx.querystring` intact, which some of Strapi's
     * own query parsing still reads.
     */
    ctx.query = { ...ctx.query, status: 'published' };

    return next();
  };
};

export default guardDrafts;
