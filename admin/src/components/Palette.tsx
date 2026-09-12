import { Box, Flex, Typography } from '@strapi/design-system';

import type { ZoneHit } from '../../../shared/protocol';
import { componentIcon, componentLabel, zoneComponents, type SchemaIndex } from '../utils/schema';
import { blockIcon } from './BlockIcon';

interface PaletteProps {
  zones: ZoneHit[];
  schemas: SchemaIndex | null;
  onDragStart: (component: string) => void;
  onDragEnd: () => void;
}

/**
 * The blocks that may be dropped, read out of the schema.
 *
 * Nothing is registered here by hand. A dynamic zone already declares which components it
 * accepts, so the palette is derived from the same schema the server validates against — a
 * hand-maintained list would be a second declaration of the same fact, and the day the two
 * disagreed the palette would offer a block the save then rejects.
 *
 * Only zones the page actually renders are shown. A content-type may have five dynamic zones
 * while this page renders one, and offering blocks for a zone that is nowhere on screen gives
 * the editor nothing to aim at.
 *
 * **Grouped by the component's own category.** A uid is `layout.hero`, `element.prose`,
 * `chart.line` — the grouping is already a fact the schema carries, so reading it here beats
 * keeping a list of which block belongs where in a second place that can disagree.
 *
 * **Drawn as tiles rather than rows.** Twenty-seven full-width rows is a column you scroll and
 * read; the same blocks as two columns of squares is a thing you scan and recognise. Each tile
 * carries the icon the component declares for itself, so a project changes what it looks like by
 * editing its schema.
 */

/** Category order, then anything unexpected, so a new category still appears rather than vanishing. */
const ORDER = ['layout', 'element', 'chart'];

const LABELS: Record<string, string> = {
  layout: 'Layout',
  element: 'Elements',
  chart: 'Charts',
};

const groupByCategory = (components: string[]): [string, string[]][] => {
  const groups = new Map<string, string[]>();

  for (const component of components) {
    const [category = 'other'] = component.split('.');
    groups.set(category, [...(groups.get(category) ?? []), component]);
  }

  return [...groups.entries()].sort(
    ([a], [b]) =>
      (ORDER.indexOf(a) === -1 ? ORDER.length : ORDER.indexOf(a)) -
      (ORDER.indexOf(b) === -1 ? ORDER.length : ORDER.indexOf(b))
  );
};

const Tile = ({
  component,
  label,
  icon,
  onDragStart,
  onDragEnd,
}: {
  component: string;
  label: string;
  icon?: string;
  onDragStart: (component: string) => void;
  onDragEnd: () => void;
}) => {
  const Glyph = blockIcon(icon);

  return (
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="center"
      gap={2}
      padding={2}
      hasRadius
      background="neutral0"
      /*
       * A native HTML5 drag. It is the only kind the browser will carry towards the canvas at all
       * — and the drop itself is caught by the admin's own surface, because Chrome does not
       * deliver drag events into a cross-origin iframe. See `DropSurface`.
       */
      draggable
      onDragStart={(event: React.DragEvent) => {
        event.dataTransfer.effectAllowed = 'copy';
        // Firefox starts no drag at all unless something is written here.
        event.dataTransfer.setData('text/plain', component);
        onDragStart(component);
      }}
      onDragEnd={onDragEnd}
      style={{
        border: '1px solid var(--neutral200, #dcdce4)',
        cursor: 'grab',
        userSelect: 'none',
        aspectRatio: '1 / 1',
        textAlign: 'center',
      }}
    >
      <Glyph width="2rem" height="2rem" />

      <Typography
        variant="pi"
        textColor="neutral700"
        ellipsis
        style={{ maxWidth: '100%', lineHeight: 1.2 }}
      >
        {label}
      </Typography>
    </Flex>
  );
};

const Palette = ({ zones, schemas, onDragStart, onDragEnd }: PaletteProps) => {
  if (!schemas || zones.length === 0) {
    return (
      <Box padding={4}>
        <Typography variant="pi" textColor="neutral600">
          No drop zones on this page. Mark a container with <code>data-strapi-zone</code> and its
          items with <code>data-strapi-item</code> to drag blocks into it.
        </Typography>
      </Box>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={4} padding={4}>
      {zones.map((zone) => {
        const components = zoneComponents(schemas, zone.entry.uid, zone.zone);

        return (
          <Box key={`${zone.entry.documentId}-${zone.zone}`}>
            {components.length === 0 ? (
              <Typography variant="pi" textColor="neutral600">
                <code>{zone.zone}</code> is not an array field in this schema.
              </Typography>
            ) : null}

            {groupByCategory(components).map(([category, members]) => (
              <Box key={category} paddingBottom={4}>
                <Typography variant="sigma" textColor="neutral600">
                  {LABELS[category] ?? category}
                </Typography>

                <Box
                  paddingTop={2}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '8px',
                  }}
                >
                  {members.map((component) => (
                    <Tile
                      key={component}
                      component={component}
                      label={componentLabel(schemas, component)}
                      icon={componentIcon(schemas, component)}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        );
      })}
    </Flex>
  );
};

export { Palette };
