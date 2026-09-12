import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../shared';
import { registerPreviewStrategy } from './auth/preview-strategy';

/**
 * Say out loud whether the plugin is usable.
 *
 * Without `frontendUrl` the builder opens on an empty address bar, which looks like a bug in
 * the plugin rather than a missing line in `config/plugins.ts`. One log line at boot is far
 * cheaper than the debugging session it replaces.
 */
const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  /*
   * In `bootstrap`, not `register`: the content-api auth registry is assembled while plugins are
   * loading, and a strategy added too early is added to a registry that is then replaced.
   */
  registerPreviewStrategy(strapi);

  const { frontendUrl, allowedOrigins } = strapi
    .plugin(PLUGIN_ID)
    .service('settings')
    .read();

  if (!frontendUrl) {
    strapi.log.warn(
      `[${PLUGIN_ID}] no frontendUrl configured — set plugins.'page-builder'.config.frontendUrl`
    );
    return;
  }

  strapi.log.info(`[${PLUGIN_ID}] canvas origins: ${allowedOrigins.join(', ')}`);
};

export default bootstrap;
