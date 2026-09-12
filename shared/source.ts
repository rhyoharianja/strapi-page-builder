/**
 * How a DOM node says which Strapi data drew it.
 *
 * **The problem this solves.** The builder loads any front end by URL in an iframe. A browser
 * has no idea that a particular `<h1>` came from `api::page.page` document `abc123`, field
 * `title` — that knowledge exists only in the template that rendered it. So the template has
 * to say so, and this file defines exactly how, for every framework at once.
 *
 * Two attributes rather than one, because markup nests the way content nests:
 *
 * ```html
 * <section data-strapi-entry="api::page.page#lm0x9#en" data-strapi-label="Hero">
 *   <h1 data-strapi-field="hero.heading">Selamat datang</h1>
 *   <p  data-strapi-field="hero.subheading">Sejak 1901</p>
 * </section>
 * ```
 *
 * A field element resolves its entry from the nearest ancestor carrying `data-strapi-entry`,
 * so a repeated block writes the entry once instead of once per field. `data-strapi-source`
 * is the flattened shortcut for a single element that is both.
 *
 * Nothing here imports Strapi, React or the DOM: the same functions run in the admin bundle,
 * in the browser bridge, and in a Node renderer that wants to emit the attributes.
 */

/** Attribute names. Exported so the bridge and any helper library cannot drift apart. */
export const ATTR = {
  /** `uid#documentId[#locale]` — marks the element as one content entry. */
  entry: 'data-strapi-entry',
  /** Field path within the nearest annotated entry, e.g. `title` or `blocks.2.heading`. */
  field: 'data-strapi-field',
  /** `uid#documentId#field[#locale]` — entry and field on one element. */
  source: 'data-strapi-source',
  /** Human name shown in the builder's inspector instead of the raw uid. */
  label: 'data-strapi-label',
  /** Field path of a dynamic zone or repeatable component — the container blocks are dropped into. */
  zone: 'data-strapi-zone',
  /** Component item id, on the root element of one item inside a zone. */
  item: 'data-strapi-item',
} as const;

/**
 * How an item inside an array is addressed: **by position**, `blocks.2.heading`.
 *
 * The first design addressed items by their component `id`, on the reasoning that a stable
 * identity survives a reorder where a position does not. Running it disproved that. Strapi 5
 * keeps draft and published as separate document versions, and component items are **renumbered
 * in each** — the published entry the site renders had ids 13–18 while the draft the Content
 * Manager edits had 1–6 for the very same six blocks. An id read off the rendered page therefore
 * matches nothing in the document being written.
 *
 * Position is the only correspondence that survives publishing, so position is what is used, and
 * the bridge derives it from DOM order rather than from anything written in the markup. That has
 * a second benefit: after an optimistic reorder the DOM order *is* the new order, so every path
 * is correct again with nothing to renumber.
 *
 * The remaining hole is honest and documented: while a draft has blocks the published page does
 * not, positions stop corresponding. Closing it properly needs draft preview, not a cleverer
 * addressing scheme.
 */
const isIndexSegment = (segment: string): boolean => /^\d+$/.test(segment);

/** Which Strapi data a DOM node came from. */
export interface StrapiSource {
  /** Content-type UID, e.g. `api::page.page`. */
  uid: string;
  /** Strapi 5 document id. */
  documentId: string;
  /** Dotted path to the field, absent when the element marks the whole entry. */
  field?: string;
  /** i18n locale, when the site is localised. */
  locale?: string;
  /** Display name from `data-strapi-label`, if the template supplied one. */
  label?: string;
}

const clean = (part?: string): string | undefined => {
  const text = part?.trim();
  return text ? text : undefined;
};

/**
 * Serialise a source into an attribute value.
 *
 * `#` separates, because a UID already contains both `:` and `.` (`api::page.page`) and a
 * field path contains `.` too. `#` appears in neither, so splitting stays unambiguous without
 * escaping — which matters because these strings are written by hand in templates.
 */
export const encodeSource = (source: StrapiSource): string =>
  [source.uid, source.documentId, source.field ?? '', source.locale ?? '']
    .join('#')
    .replace(/#+$/, '');

/**
 * Parse an attribute value back into a source.
 *
 * Returns `null` rather than throwing on anything malformed. This runs inside a `mousemove`
 * handler on a page the plugin does not own: one typo in a template must not take the whole
 * canvas down, it must just make that one element non-editable.
 */
export const decodeSource = (value?: string | null): StrapiSource | null => {
  if (!value) return null;

  const [uid, documentId, field, locale] = value.split('#');

  if (!clean(uid) || !clean(documentId)) return null;

  return {
    uid: uid.trim(),
    documentId: documentId.trim(),
    ...(clean(field) ? { field: field.trim() } : {}),
    ...(clean(locale) ? { locale: locale.trim() } : {}),
  };
};

/** Stable identity for a source — what the builder compares selections by. */
export const sourceKey = (source: StrapiSource): string =>
  encodeSource({ uid: source.uid, documentId: source.documentId, field: source.field, locale: source.locale });

/** Whether two sources point at the same entry, regardless of field. */
export const sameEntry = (a: StrapiSource, b: StrapiSource): boolean =>
  a.uid === b.uid && a.documentId === b.documentId && (a.locale ?? '') === (b.locale ?? '');

/**
 * Read a field out of an entry by its dotted path.
 *
 * Numeric segments index arrays, so `blocks.2.heading` reaches into a dynamic zone or a
 * repeatable component — which is where most of a composed page actually lives.
 */
export const readPath = (entry: unknown, path?: string): unknown => {
  if (!path) return entry;

  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;

    return (current as Record<string, unknown>)[segment];
  }, entry);
};

/**
 * Write a field into an entry by its dotted path, returning a new object.
 *
 * Immutable because the admin holds the entry in React state, and because a PUT that sends a
 * mutated copy of what was fetched is how two editors silently overwrite each other's work:
 * a fresh object makes the change visible to React and easy to diff before sending.
 */
export const writePath = <T>(entry: T, path: string, value: unknown): T => {
  const [head, ...rest] = path.split('.');

  if (head === undefined) return entry;

  const isIndex = isIndexSegment(head);

  const container: any = isIndex
    ? Array.isArray(entry)
      ? [...(entry as unknown[])]
      : []
    : { ...((entry as Record<string, unknown>) ?? {}) };

  const key: any = isIndex ? Number(head) : head;

  container[key] = rest.length === 0 ? value : writePath(container[key], rest.join('.'), value);

  return container as T;
};
