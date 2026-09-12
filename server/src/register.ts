import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../../shared';
import { resolveOrigins, type PageBuilderConfig } from './config';

type MiddlewareEntry = string | { name?: string; resolve?: string; config?: Record<string, any> };

const nameOf = (entry: MiddlewareEntry): string | undefined =>
  typeof entry === 'string' ? entry : (entry.name ?? entry.resolve);

/**
 * Let the admin frame the site.
 *
 * Strapi's `strapi::security` middleware sends `frame-src 'self'`, so an iframe pointing at
 * `http://localhost:3000` renders blank with nothing but a CSP violation in the browser console
 * — the single least legible failure in this whole plugin, and the first thing every install
 * hits. Editing `config/middlewares.ts` by hand is the documented cure, and it is a cure nobody
 * discovers on their own.
 *
 * So the plugin widens the directive itself, additively: it only ever appends the origins the
 * host already configured for this plugin, and it leaves every other directive untouched. If the
 * host has customised `frame-src` deliberately, its own values survive.
 *
 * This runs in `register()`, before the server instantiates its middleware stack from
 * `strapi.config` — which is what makes mutating the config here effective rather than too late.
 */
const register = ({ strapi }: { strapi: Core.Strapi }) => {
  const pluginConfig = (strapi.config.get(`plugin::${PLUGIN_ID}`) ?? {}) as Partial<PageBuilderConfig>;
  const allowedOrigins = resolveOrigins(pluginConfig);

  if (allowedOrigins.length === 0) return;

  const middlewares = strapi.config.get('middlewares') as MiddlewareEntry[] | undefined;

  if (!Array.isArray(middlewares)) return;

  /*
   * Guard draft reads, unless the project opted out.
   *
   * Appended to the global stack here rather than left for the host to add to
   * `config/middlewares.ts`, because a security default that only takes effect when someone
   * remembers to wire it up is not a default. Idempotent: re-registering on a dev reload would
   * otherwise stack copies of the same guard.
   */
  const guard = `plugin::${PLUGIN_ID}.guard-drafts`;

  if (pluginConfig.guardDrafts !== false && !middlewares.some((entry) => nameOf(entry) === guard)) {
    middlewares.push(guard);
    strapi.log.info(`[${PLUGIN_ID}] draft reads now require a preview token`);
  }

  const isSecurity = (entry: MiddlewareEntry) => nameOf(entry) === 'strapi::security';

  const index = middlewares.findIndex(isSecurity);

  if (index === -1) {
    strapi.log.warn(
      `[${PLUGIN_ID}] strapi::security not found in config/middlewares — add the canvas origins to frame-src yourself`
    );
    return;
  }

  const current = middlewares[index];
  const config = (typeof current === 'object' ? current.config : undefined) ?? {};
  const csp = config.contentSecurityPolicy ?? {};
  const directives = csp.directives ?? {};

  const frameSrc = new Set<string>([
    ...(Array.isArray(directives['frame-src']) ? directives['frame-src'] : ["'self'"]),
    ...allowedOrigins,
  ]);

  middlewares[index] = {
    name: 'strapi::security',
    config: {
      ...config,
      contentSecurityPolicy: {
        ...csp,
        directives: { ...directives, 'frame-src': [...frameSrc] },
      },
    },
  };

  strapi.config.set('middlewares', middlewares);
  strapi.log.info(`[${PLUGIN_ID}] frame-src now allows ${allowedOrigins.join(', ')}`);
};

export default register;
