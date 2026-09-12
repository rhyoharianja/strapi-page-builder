/**
 * Walking Strapi's own schemas to find the field a DOM node pointed at.
 *
 * **Why this is not simply `schema.attributes[field]`.** The interesting fields are never at the
 * top level. A heading lives at `hero.heading` inside a component, a card lives at
 * `blocks.2.title` inside a dynamic zone. The annotation gives a dotted path through *data*, and
 * turning that into an *attribute definition* means walking the schema and the entry side by
 * side: only the entry knows which component sits at `blocks.2`, and only the schema knows what
 * fields that component has.
 *
 * Everything here is read-only and pure, so the resolution is testable without an admin runtime.
 */

export interface Attribute {
  type: string;
  component?: string;
  components?: string[];
  repeatable?: boolean;
  enum?: string[];
  required?: boolean;
  /** Present on relations and media; enough to know we cannot edit them inline yet. */
  relation?: string;
  multiple?: boolean;
  [key: string]: unknown;
}

export interface Schema {
  uid: string;
  apiID?: string;
  kind?: 'collectionType' | 'singleType';
  info?: { displayName?: string; singularName?: string; icon?: string };
  attributes: Record<string, Attribute>;
}

export interface SchemaIndex {
  contentTypes: Record<string, Schema>;
  components: Record<string, Schema>;
}

/** The `__component` discriminator Strapi stores on every dynamic-zone item. */
const COMPONENT_KEY = '__component';

export interface ResolvedField {
  attribute: Attribute;
  /** Label to show above the input — the last human-meaningful path segment. */
  label: string;
}

/**
 * Find the attribute a dotted path lands on.
 *
 * Returns `null` for a path the schema does not explain, which happens for real reasons and not
 * only typos: a template can annotate a computed value, or a field that was removed from the
 * content-type after the page was last deployed. The inspector shows that as "field not found"
 * rather than rendering an input that would write a key nothing reads.
 */
export const resolveField = (
  index: SchemaIndex,
  uid: string,
  path: string | undefined,
  entry: unknown
): ResolvedField | null => {
  const root = index.contentTypes[uid];

  if (!root || !path) return null;

  let attributes: Record<string, Attribute> | undefined = root.attributes;
  let value: unknown = entry;
  let attribute: Attribute | undefined;
  let label = path;

  for (const segment of path.split('.')) {
    if (/^\d+$/.test(segment)) {
      /*
       * An array index does not change which attributes are in scope for a repeatable
       * component — every item has the same shape — but it very much does for a dynamic zone,
       * where each item carries its own `__component`. So the item is read out of the entry and
       * asked what it is.
       */
      const list = Array.isArray(value) ? (value as unknown[]) : [];
      const item = list[Number(segment)];

      value = item;

      const componentUid = (item as Record<string, unknown> | undefined)?.[COMPONENT_KEY];

      if (typeof componentUid === 'string') {
        attributes = index.components[componentUid]?.attributes;
      }

      continue;
    }

    attribute = attributes?.[segment];
    if (!attribute) return null;

    label = segment;
    value = (value as Record<string, unknown> | undefined)?.[segment];

    if (attribute.type === 'component' && attribute.component) {
      attributes = index.components[attribute.component]?.attributes;
    } else if (attribute.type === 'dynamiczone') {
      // Scope is decided by the next index segment, which reads `__component` above.
      attributes = undefined;
    }
  }

  return attribute ? { attribute, label } : null;
};

/**
 * Field types the inspector can edit in place.
 *
 * Deliberately conservative. A relation or a media field edited through a hand-rolled input is
 * how a plugin quietly writes a shape the Content Manager would never produce; for those the
 * inspector links to the real form instead. Widening this list is a decision to reimplement a
 * piece of the Content Manager, and should be taken one type at a time.
 */
export const EDITABLE_TYPES = new Set([
  'string',
  'text',
  'richtext',
  'email',
  'uid',
  'integer',
  'biginteger',
  'float',
  'decimal',
  'boolean',
  'enumeration',
  'date',
  'datetime',
  'time',
]);

/**
 * Keys the Content Manager reports as attributes but nobody edits.
 *
 * `/content-manager/components` includes the primary keys alongside the real fields, so a form
 * built by iterating the schema offers an `id` input — which writes a value the API ignores at
 * best and rejects at worst, and reads as a bug either way.
 */
const RESERVED = new Set(['id', 'documentId', '__component', 'createdAt', 'updatedAt', 'publishedAt']);

export const isEditable = (attribute?: Attribute, name?: string): boolean =>
  attribute !== undefined &&
  EDITABLE_TYPES.has(attribute.type) &&
  (name === undefined || !RESERVED.has(name));

/** Whether a live DOM patch makes sense for this type — only text the browser is showing. */
export const isTextual = (attribute?: Attribute): boolean =>
  attribute !== undefined && ['string', 'text', 'richtext', 'email', 'uid'].includes(attribute.type);

/** A path ending in a bare index selects a whole block rather than one of its fields. */
export const ITEM_PATH = /^(.*)\.(\d+)$/;

export const parseItemPath = (path?: string): { zone: string; index: number } | null => {
  const match = path ? ITEM_PATH.exec(path) : null;
  return match ? { zone: match[1], index: Number(match[2]) } : null;
};

/** The array attribute a zone path points at, if the schema has one. */
export const zoneAttribute = (
  index: SchemaIndex,
  uid: string,
  zone: string
): Attribute | undefined => {
  const root = index.contentTypes[uid];
  if (!root) return undefined;

  const segments = zone.split('.');
  let attributes: Record<string, Attribute> | undefined = root.attributes;
  let attribute: Attribute | undefined;

  for (const segment of segments) {
    attribute = attributes?.[segment];
    if (!attribute) return undefined;
    if (attribute.type === 'component' && attribute.component) {
      attributes = index.components[attribute.component]?.attributes;
    }
  }

  return attribute;
};

/** Component uids that may be dropped into a zone. */
export const zoneComponents = (
  index: SchemaIndex,
  uid: string,
  zone: string
): string[] => {
  const attribute = zoneAttribute(index, uid, zone);

  if (!attribute) return [];
  if (attribute.type === 'dynamiczone') return attribute.components ?? [];
  if (attribute.type === 'component' && attribute.repeatable && attribute.component) {
    return [attribute.component];
  }

  return [];
};

/**
 * The icon a component declares for itself.
 *
 * Strapi stores it on the component's `info.icon` — the same value the Content-Type Builder
 * shows — so the palette and the CTB agree without a second list. A project renames a block's
 * icon by editing its component JSON, which is where every other fact about the block lives.
 */
export const componentIcon = (index: SchemaIndex, component: string): string | undefined =>
  index.components[component]?.info?.icon;

/** Readable name for a component uid, from its own schema. */
export const componentLabel = (index: SchemaIndex, component: string): string =>
  index.components[component]?.info?.displayName ?? component.split('.').pop() ?? component;

/**
 * A new item the API will accept.
 *
 * Required fields are filled rather than left out: the Content Manager validates the whole
 * document on write, so a block dropped in with a missing required field fails the save — the
 * editor sees a 400 instead of the block they just dragged.
 *
 * Required *text* gets the component's own name, not an empty string. Two reasons, and both were
 * found by running it: Strapi rejects `''` for a required field just as it rejects a missing one,
 * and a card whose only text is empty renders as a blank rectangle the editor then has to hunt
 * for. "Kartu promo" is visible, obviously a placeholder, and passes validation.
 */
export const blankItem = (index: SchemaIndex, component: string): Record<string, unknown> => {
  const schema = index.components[component];
  const placeholder = componentLabel(index, component);
  const item: Record<string, unknown> = { __component: component };

  for (const [name, attribute] of Object.entries(schema?.attributes ?? {})) {
    if (!attribute.required) continue;

    switch (attribute.type) {
      case 'integer':
      case 'biginteger':
      case 'float':
      case 'decimal':
        item[name] = 0;
        break;
      case 'boolean':
        item[name] = false;
        break;
      case 'enumeration':
        item[name] = attribute.enum?.[0] ?? null;
        break;
      default:
        item[name] = placeholder;
    }
  }

  return item;
};
