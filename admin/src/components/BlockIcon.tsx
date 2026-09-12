import * as Icons from '@strapi/icons';

/**
 * The icon a block declares for itself, resolved to something drawable.
 *
 * Strapi keeps it on the component's `info.icon` — the same value the Content-Type Builder shows —
 * so the palette and the CTB agree without a second list to maintain. A project changes a block's
 * icon by editing its component JSON, which is where every other fact about that block lives.
 *
 * **On the namespace import.** Pulling the whole icon set in defeats tree-shaking for this module,
 * and that is the right trade here: which icon is needed is decided by a project's schemas at
 * runtime, so there is no set of imports that could be written ahead of time. The admin already
 * bundles `@strapi/icons` for its own UI, so the cost is a lookup table, not the icons themselves.
 */

type IconComponent = React.ComponentType<{ width?: string; height?: string }>;

/**
 * Strapi's Content-Type Builder names a handful of icons differently from the icon package, and
 * two of the names it offers have no icon at all. Mapped explicitly, because the alternative is a
 * silent fallback that makes every one of them look like an unconfigured block.
 */
const ALIASES: Record<string, string> = {
  grid: 'GridFour',
  picture: 'Image',
  stepField: 'NumberList',
  typhography: 'Feather',
  quote: 'Message',
  calendar: 'Calendar',
};

const toPascal = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

export const blockIcon = (icon?: string): IconComponent => {
  const set = Icons as unknown as Record<string, IconComponent | undefined>;

  if (!icon) return set.PuzzlePiece as IconComponent;

  const resolved = set[ALIASES[icon] ?? toPascal(icon)];

  // A block whose icon cannot be resolved still gets a glyph: a blank tile reads as broken.
  return (resolved ?? set.PuzzlePiece) as IconComponent;
};
