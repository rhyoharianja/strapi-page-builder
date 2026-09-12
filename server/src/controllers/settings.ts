import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../../shared';

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  /** Everything the builder page needs to boot: where to point, and who it may frame. */
  async read(ctx): Promise<void> {
    ctx.body = { data: strapi.plugin(PLUGIN_ID).service('settings').read() };
  },
});

export default controller;
