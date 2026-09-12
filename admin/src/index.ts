import { getTranslation } from './utils/getTranslation';
import { PLUGIN_ID } from './pluginId';
import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
import { OpenInBuilder } from './components/OpenInBuilder';

import type { StrapiApp } from '@strapi/strapi/admin';

const plugin: StrapiApp['appPlugins'][string] = {
  register(app) {
    /**
     * A menu link and a full-screen route — the opposite of the Puck plugin's choice, and for
     * the opposite reason.
     *
     * A custom field is reached *from the entry it belongs to*, which is right when you already
     * know the entry. This plugin exists for the case where you do not: you know the page looks
     * wrong, and finding out which of eleven content-types owns that heading is the work. So it
     * starts from a URL, and the click decides the entry.
     */
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: 'Page builder',
      },
      /*
       * Open to any authenticated admin, because the link itself grants nothing. Every read and
       * write the builder performs goes through the Content Manager's endpoints, which enforce
       * that user's own permissions: someone who cannot edit Articles opens this page, clicks a
       * heading, and gets the same 403 they would get in the Content Manager. Gating the menu
       * entry as well would only hide a screen that is already harmless.
       */
      permissions: [],
      Component: async () => {
        const { App } = await import('./pages/App');
        return { default: App };
      },
    });

    /**
     * "Edit visually" on the Content Manager's edit view.
     *
     * The menu link answers "I want to work on the site"; this answers "I am already looking at
     * this entry and want to see it in place". They are different arrivals at the same screen,
     * and only the second one knows which entry the editor means — which is why it carries the
     * entry through rather than dropping them on `frontendUrl`.
     *
     * Registered defensively: an admin without the Content Manager, or a future Strapi that
     * renames the zone, must not take the whole plugin down with it.
     */
    try {
      app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
        name: 'page-builder-open',
        Component: OpenInBuilder,
      });
    } catch {
      // The button is a convenience; the menu link still opens the builder.
    }

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = (await import(`./translations/${locale}.json`)) as {
            default: Record<string, string>;
          };

          const translated: Record<string, string> = {};

          for (const key of Object.keys(data)) {
            translated[getTranslation(key)] = data[key];
          }

          return { data: translated, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};

export default plugin;

/**
 * The front-end contract, re-exported for convenience.
 *
 * A project that renders its own annotations in TypeScript can import the helpers from
 * `strapi-page-builder/shared` instead — that entry pulls in no admin runtime at all and
 * is the one to use from a Nuxt or Next bundle.
 */
export { ATTR, encodeSource, type StrapiSource } from '../../shared/source';
