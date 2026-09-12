import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../../shared';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import { resolveOrigins, type PageBuilderConfig } from '../config';

/** What the admin builder needs before it can open anything. */
export interface PageBuilderSettings {
  frontendUrl: string;
  allowedOrigins: string[];
  protocolVersion: number;
  /** Path of the served bridge, so the setup snippet can be copied straight from the UI. */
  bridgePath: string | null;
  /** Content-type uid → URL pattern, for the Content Manager's "Edit visually" button. */
  entryUrls: Record<string, string>;
}

const settings = ({ strapi }: { strapi: Core.Strapi }) => ({
  read(): PageBuilderSettings {
    const config = (strapi.config.get(`plugin::${PLUGIN_ID}`) ?? {}) as Partial<PageBuilderConfig>;
    const prefix = (strapi.config.get('api.rest.prefix', '/api') as string).replace(/\/$/, '');

    return {
      frontendUrl: (config.frontendUrl ?? '').trim(),
      allowedOrigins: resolveOrigins(config),
      protocolVersion: PROTOCOL_VERSION,
      /*
       * Built from the host's own REST prefix rather than hard-coded to `/api`. A project that
       * moved its content API (`api.rest.prefix`) would otherwise be handed a copy-paste
       * snippet pointing at a 404 — and a 404 on the bridge looks exactly like "the plugin does
       * not work", because nothing on the page is clickable and nothing says why.
       */
      bridgePath: config.serveBridge === false ? null : `${prefix}/${PLUGIN_ID}/bridge.js`,
      entryUrls: config.entryUrls ?? {},
    };
  },
});

export default settings;
