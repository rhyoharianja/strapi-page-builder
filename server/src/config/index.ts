import { PROTOCOL_VERSION } from '../../../shared/protocol';

/**
 * Where the site lives, and who is allowed to be framed.
 *
 * Configured by the host app in `config/plugins.ts`:
 *
 * ```ts
 * export default ({ env }) => ({
 *   'page-builder': {
 *     enabled: true,
 *     config: {
 *       frontendUrl: env('FRONTEND_URL', 'http://localhost:3000'),
 *     },
 *   },
 * });
 * ```
 *
 * `allowedOrigins` exists separately from `frontendUrl` because a real deployment has more than
 * one: a staging build, a preview deployment per branch, a second brand on another domain. The
 * URL is only the one the builder opens first.
 */
export interface PageBuilderConfig {
  /** URL the builder loads when it opens with no address of its own. */
  frontendUrl: string;
  /** Origins the admin may frame. The origin of `frontendUrl` is always included. */
  allowedOrigins: string[];
  /** Serve `GET /page-builder/bridge.js` unauthenticated. Off only if you vendor the script. */
  serveBridge: boolean;
  /**
   * Refuse `?status=draft` to callers without a preview token.
   *
   * On by default because Strapi serves drafts to anyone holding `find` — see the middleware.
   * Turn it off only if a project deliberately wants its API tokens reading unpublished content.
   */
  guardDrafts: boolean;
  /**
   * Which URL renders an entry of each content-type, as a path with `{field}` placeholders.
   *
   * ```ts
   * entryUrls: {
   *   'api::page.page': '/{slug}',
   *   'api::article.article': '/artikel/{slug}',
   * }
   * ```
   *
   * Strapi knows the entry; only the project knows what URL draws it. A content-type left out
   * simply gets no "Edit visually" button, which is the right answer for anything that is not a
   * page of its own.
   */
  entryUrls: Record<string, string>;
}

const defaults: PageBuilderConfig = {
  frontendUrl: '',
  allowedOrigins: [],
  serveBridge: true,
  guardDrafts: true,
  entryUrls: {},
};

export default {
  default: defaults,

  /**
   * Fail at boot, not at first click.
   *
   * A misspelled origin here surfaces as a blank iframe with a CSP violation buried in the
   * browser console — one of the least legible failures in the whole plugin. Validating the
   * shape at startup turns that into a startup error naming the field.
   */
  validator(config?: Partial<PageBuilderConfig>) {
    if (!config) return;

    if (config.frontendUrl !== undefined && typeof config.frontendUrl !== 'string') {
      throw new Error('[page-builder] config.frontendUrl must be a string');
    }

    if (config.allowedOrigins !== undefined && !Array.isArray(config.allowedOrigins)) {
      throw new Error('[page-builder] config.allowedOrigins must be an array of origins');
    }

    for (const [uid, pattern] of Object.entries(config.entryUrls ?? {})) {
      if (typeof pattern !== 'string' || !pattern.startsWith('/')) {
        throw new Error(
          `[page-builder] config.entryUrls['${uid}'] must be a path beginning with "/" — got ${JSON.stringify(pattern)}`
        );
      }
    }

    for (const origin of config.allowedOrigins ?? []) {
      /*
       * An empty entry is "none", not a mistake.
       *
       * The list almost always arrives from `env.array('...', [])`, and an environment variable
       * left blank — which is what copying a `.env.example` gives you — parses to `['']`. Treating
       * that as an invalid URL refused to boot the whole app over a variable sitting at its
       * documented default, and the message read "contains an invalid URL:" with nothing after
       * the colon.
       */
      if (!origin || !origin.trim()) continue;

      try {
        new URL(origin);
      } catch {
        throw new Error(`[page-builder] config.allowedOrigins contains an invalid URL: ${origin}`);
      }
    }
  },
};

/** Origin of a URL, or `undefined` when it is not one. */
export const originOf = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

/**
 * Every origin the admin is allowed to frame.
 *
 * A plain function over the config object rather than a method on the settings service,
 * because `register()` needs it too and plugin services are not guaranteed to be resolvable
 * that early in the boot sequence. Both callers therefore read the same config the same way,
 * which is the only way the CSP the server sends and the origin check the admin performs can
 * be guaranteed to agree.
 *
 * The front end's own origin is always included. Requiring it to be repeated in
 * `allowedOrigins` was the first design and it produced exactly one support question per
 * install: a `frontendUrl` that is set and still refuses to frame reads as a broken plugin.
 */
export const resolveOrigins = (config?: Partial<PageBuilderConfig>): string[] => {
  const origins = new Set<string>();

  for (const value of [config?.frontendUrl, ...(config?.allowedOrigins ?? [])]) {
    // `originOf` already returns undefined for a blank value, so empties simply contribute nothing.
    const origin = originOf(value);
    if (origin) origins.add(origin);
  }

  return [...origins];
};

export { PROTOCOL_VERSION };
