import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../../shared';

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Mint a preview token for the builder.
   *
   * Admin-authenticated, so the token can only ever start its life in the browser of someone who
   * is already signed in to Strapi. From there it goes to the iframe over `postMessage` — never
   * into the URL, where it would end up in history, in the referrer of every outbound link, and
   * in whatever logs the front end keeps.
   */
  async token(ctx): Promise<void> {
    ctx.body = { data: strapi.plugin(PLUGIN_ID).service('preview').issue() };
  },
});

export default controller;
