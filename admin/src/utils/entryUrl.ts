import type { Attribute, Schema } from './schema';

/**
 * Turning an entry into the URL that renders it.
 *
 * Strapi knows the entry; only the project knows its routing, so the shape comes from
 * configuration (`entryUrls`) and the values come from the entry. Both the Content Manager button
 * and the builder's page picker resolve them, which is why this lives here rather than in either.
 */

/**
 * Fill `/artikel/{slug}` from an entry.
 *
 * Returns `null` when a placeholder has no value — the common case while an entry is still being
 * written. A URL with `undefined` in it is worse than no URL: it sends the editor to a 404 and
 * makes the builder look broken rather than the entry look unfinished.
 */
export const resolvePattern = (
  pattern: string,
  values: Record<string, unknown>
): string | null => {
  let missing = false;

  const path = pattern.replace(/\{([^}]+)\}/g, (_, field: string) => {
    const value = field.split('.').reduce<unknown>((current, key) => {
      if (current === null || current === undefined) return undefined;
      return (current as Record<string, unknown>)[key];
    }, values);

    if (value === undefined || value === null || value === '') {
      missing = true;
      return '';
    }

    return encodeURIComponent(String(value));
  });

  return missing ? null : path;
};

/** An absolute URL on the site, from a path and whatever `frontendUrl` was configured. */
export const absoluteUrl = (frontendUrl: string, path: string): string | null => {
  try {
    // Resolved against the origin, so a `frontendUrl` that already carries a path is ignored.
    return new URL(path, new URL(frontendUrl).origin).toString();
  } catch {
    return null;
  }
};

/** Fields worth showing as an entry's name, in the order they are worth showing. */
const TITLE_FIELDS = ['title', 'name', 'label', 'heading', 'slug'];

export const entryTitle = (values: Record<string, unknown>, fallback?: string): string => {
  for (const field of TITLE_FIELDS) {
    const value = values[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  /*
   * The content-type's own name, not the document id. A single type built out of `heroTitle` and
   * `heroNote` has no field worth calling a title, and "u57wp3mztowf0ko4egtz5t7u" in a picker is
   * a worse answer than "Pegadaian Home" — it identifies the row without telling the editor
   * anything they could act on.
   */
  return fallback ?? String(values.documentId ?? 'Untitled');
};

/** A URL-safe slug, matching what Strapi's own `uid` field would produce from a title. */
export const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'page';

/**
 * The smallest body Strapi will accept for a new entry of this content-type.
 *
 * Built from the schema's own `required` flags rather than a hand-written list per content-type:
 * the plugin is meant to work against any of them, and a list would be right for the one project
 * that wrote it. A required field it cannot guess a value for gets the title — visible and
 * obviously a placeholder, which is the honest default for something an editor is about to edit.
 */
export const newEntryBody = (schema: Schema, title: string): Record<string, unknown> => {
  const body: Record<string, unknown> = {};

  for (const [name, attribute] of Object.entries(schema.attributes ?? {})) {
    const field = attribute as Attribute;

    if (name === 'id' || name === 'documentId') continue;

    if (field.type === 'uid') {
      // A `uid` only auto-generates inside the Content Manager's own form, never over the API.
      body[name] = slugify(title);
      continue;
    }

    if (!field.required) continue;

    switch (field.type) {
      case 'integer':
      case 'biginteger':
      case 'float':
      case 'decimal':
        body[name] = 0;
        break;
      case 'boolean':
        body[name] = false;
        break;
      case 'enumeration':
        body[name] = field.enum?.[0] ?? null;
        break;
      case 'component':
      case 'dynamiczone':
        // An empty zone is valid and is what a new page should start as.
        body[name] = [];
        break;
      default:
        body[name] = title;
    }
  }

  return body;
};
