/**
 * The `postMessage` protocol between the Strapi admin and the front end in the iframe.
 *
 * **Why a protocol and not a library.** The two sides are different origins, different build
 * systems, and often different frameworks — there is no shared module to import. All they can
 * exchange is structured-clonable JSON. Writing that exchange down as types in one file is the
 * only thing that keeps a Nuxt bridge and a React admin honest with each other.
 *
 * Every message carries `channel` and `version`. The channel is checked first because an iframe
 * receives messages from browser extensions, dev-server HMR clients and analytics scripts on the
 * same `window`; without it the builder would try to parse Vite's reload pings. The version is
 * checked second, so a site pinned to an older bridge gets a clear "bridge is out of date"
 * notice instead of silently failing to select anything.
 */

import type { StrapiSource } from './source';

export const CHANNEL = 'strapi-page-builder' as const;

/**
 * Bump on any breaking change to the message shapes.
 *
 * The bridge is served from the Strapi server (`GET /page-builder/bridge.js`) precisely so
 * most sites never pin a version and this number stays uninteresting. It exists for sites that
 * vendored the file into their own bundle.
 */
export const PROTOCOL_VERSION = 1;

/** A rectangle in iframe viewport coordinates. */
export interface SourceRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** One annotated element the bridge found on the page. */
export interface SourceHit {
  source: StrapiSource;
  rect: SourceRect;
  /** The element's current text, used to show a preview in the inspector. */
  text?: string;
}

/** One dynamic zone the bridge found, with the items currently in it. */
export interface ZoneHit {
  /** Field path of the array, relative to the entry. */
  zone: string;
  entry: StrapiSource;
  rect: SourceRect;
  /**
   * Where each item sits, in the canvas's own viewport coordinates.
   *
   * Rects rather than a count, because the admin has to work out a drop position **itself**:
   * Chrome does not deliver drag events into a cross-origin iframe, so a drag from the palette is
   * caught by a surface in the admin and resolved against these.
   */
  items: SourceRect[];
}

/** Sent by the page inside the iframe. */
export type BridgeMessage =
  /**
   * Bridge booted and scanned the page. Also re-sent after client-side navigation.
   *
   * `preview` says whether the page **acted on** the draft-preview token — not whether one was
   * offered. A site that ignores it is showing published content, and the builder has to behave
   * differently there, so this is the one fact that decides it.
   */
  | { type: 'ready'; url: string; version: number; hits: number; preview?: boolean }
  /** Editor clicked an annotated element. */
  | { type: 'select'; hit: SourceHit }
  /** Pointer moved over an annotated element, or left one (`hit: null`). */
  | { type: 'hover'; hit: SourceHit | null }
  /** The page navigated on the client, so the admin's URL bar must follow. */
  | { type: 'navigate'; url: string }
  /** Annotated elements changed — the admin refreshes its outline. */
  | { type: 'sources'; hits: SourceHit[]; zones: ZoneHit[]; preview?: boolean }
  /**
   * A block was dropped.
   *
   * `index` is where it landed; `from` is the position it was picked up from and is absent when
   * something was dragged in from the palette. The bridge decides both, not the admin, because
   * only the page knows where the pointer actually was — the admin cannot read the iframe's DOM.
   */
  | { type: 'drop'; zone: string; entry: StrapiSource; index: number; from?: number; component?: string };

/** Sent by the Strapi admin. */
export type AdminMessage =
  /** First message after `ready`: tells the bridge who it is talking to. */
  /**
   * First message after `ready`: who the bridge is talking to, and a short-lived token the page
   * may use to read draft content. The token travels here rather than in the iframe's URL so it
   * never reaches browser history, referrers or the front end's own logs.
   */
  | { type: 'init'; origin: string; version: number; previewToken?: string }
  /** Turn click-to-edit overlays on or off, so the editor can use the site normally. */
  | { type: 'setMode'; mode: 'edit' | 'browse' }
  /** Scroll to and flash an element, e.g. when picking it from the outline list. */
  | { type: 'highlight'; source: StrapiSource | null }
  /**
   * Show an unsaved value in place, without a round trip.
   *
   * This is what makes typing in the inspector feel live. It only rewrites text content in the
   * DOM — it does not re-render the framework's component tree, so the next `refresh` wipes it.
   * Deliberate: the authoritative render is always the front end's own, and a patch that could
   * outlive a refresh would be a second, divergent source of truth.
   */
  | { type: 'patch'; source: StrapiSource; value: string }
  /** Data changed in Strapi — reload so the front end re-fetches over its own API. */
  | { type: 'refresh'; hard?: boolean }
  /** Ask the bridge to re-scan and report every annotated element. */
  | { type: 'scan' }
  /**
   * A drag started in the admin, carrying this component type.
   *
   * Sent up front rather than read out of `dataTransfer` on the other side: during `dragover`
   * the DataTransfer is in the browser's protected mode, so the drop target can see the *types*
   * but not the payload. Handing the payload over before the drag begins sidesteps that
   * entirely, and works the same whether the drag is native or pointer-driven.
   */
  | { type: 'dragStart'; component: string }
  /** The drag ended, wherever it ended. Clears the insertion indicator. */
  | { type: 'dragEnd' }
  /**
   * Show a new order in place, before anything is saved.
   *
   * The same bargain as `patch`: a view, never state. The canvas is showing draft content that
   * the published site does not have, so it is labelled as such in the inspector.
   */
  | { type: 'reorder'; zone: string; from: number; to: number }
  /** Remove an item from view immediately after it is deleted. */
  | { type: 'removeItem'; zone: string; index: number };

/** Envelope actually put on the wire. */
export type Envelope<T> = T & { channel: typeof CHANNEL; version: number };

export const wrap = <T extends object>(message: T): Envelope<T> => ({
  ...message,
  channel: CHANNEL,
  version: PROTOCOL_VERSION,
});

/**
 * Accept a message only if it is ours.
 *
 * Not a type guard over the union's `type` field: an unknown `type` from a newer bridge should
 * reach the reducer and be ignored there by name, not be rejected here as foreign traffic. The
 * distinction matters when debugging a version mismatch.
 */
export const unwrap = <T>(data: unknown): (T & { version: number }) | null => {
  if (!data || typeof data !== 'object') return null;

  const candidate = data as Record<string, unknown>;

  if (candidate.channel !== CHANNEL || typeof candidate.type !== 'string') return null;

  return candidate as T & { version: number };
};
