import type { Core } from '@strapi/strapi';

import bootstrap from './bootstrap';
import destroy from './destroy';
import register from './register';

import config from './config';
import controllers from './controllers';
import middlewares from './middlewares';
import policies from './policies';
import routes from './routes';
import services from './services';

type Lifecycle = (context: { strapi: Core.Strapi }) => void | Promise<void>;
type Factory = (context: { strapi: Core.Strapi }) => unknown;

/**
 * Declared locally and referencing only `@strapi/strapi` so the emitted declaration stays
 * portable under pnpm (see docs/package-conventions.md — TS2742).
 */
interface PageBuilderServerPlugin {
  register: Lifecycle;
  bootstrap: Lifecycle;
  destroy: Lifecycle;
  config: { default: unknown; validator: (config?: any) => void };
  controllers: Record<string, Factory>;
  routes: Record<string, unknown>;
  services: Record<string, Factory>;
  policies: Record<string, unknown>;
  middlewares: Record<string, unknown>;
}

/**
 * No content-type of its own, deliberately.
 *
 * The builder edits content that already exists — an Article, a Page, a Hero component on
 * whatever content-type the project modelled. A plugin that added its own "page" table would be
 * asking the project to re-model its content just to be able to click on it, which is exactly
 * the coupling this plugin exists to avoid.
 */
const plugin: PageBuilderServerPlugin = {
  register,
  bootstrap,
  destroy,
  config,
  controllers,
  routes,
  services,
  policies,
  middlewares,
};

export default plugin;
