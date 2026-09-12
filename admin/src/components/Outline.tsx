import { Box, Flex, Typography } from '@strapi/design-system';

import type { ZoneHit } from '../../../shared/protocol';
import type { StrapiSource } from '../../../shared/source';
import type { useEntry } from '../hooks/useEntry';
import { componentLabel, type SchemaIndex } from '../utils/schema';

interface OutlineProps {
  zones: ZoneHit[];
  schemas: SchemaIndex | null;
  doc: ReturnType<typeof useEntry>;
  /** Field path of the selected block, e.g. `blocks.2`. */
  selected?: string;
  onSelect: (source: StrapiSource, field: string) => void;
}

/** Fields worth showing beside a block's type, in the order they are worth showing. */
const SUMMARY_FIELDS = ['title', 'name', 'label', 'heading', 'quote', 'eyebrow'];

const summarise = (item: Record<string, unknown>): string | null => {
  for (const field of SUMMARY_FIELDS) {
    const value = item[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return null;
};

/**
 * What this page is actually made of.
 *
 * The palette answers "what could I add"; this answers "what is here", and they are different
 * questions an editor asks at different moments. Read from the **entry**, not from the canvas:
 * the entry is what gets saved, it carries blocks the page may not have rendered yet, and its
 * order is the order that matters. Counting rendered sections would agree most of the time and
 * quietly disagree exactly when something failed to draw.
 *
 * Clicking a row selects the block and scrolls the canvas to it, which is the only way to reach
 * a section that is three screens down without hunting for it.
 */
const Outline = ({ zones, schemas, doc, selected, onSelect }: OutlineProps) => {
  if (!schemas || zones.length === 0) {
    return (
      <Box padding={4}>
        <Typography variant="pi" textColor="neutral600">
          No blocks on this page. Mark a container with <code>data-strapi-zone</code> to start.
        </Typography>
      </Box>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={4} padding={4}>
      {zones.map((zone) => {
        const items = doc.listAt(zone.zone);

        return (
          <Box key={`${zone.entry.documentId}-${zone.zone}`}>
            <Typography variant="sigma" textColor="neutral600">
              {zone.zone}
            </Typography>

            <Flex direction="column" alignItems="stretch" gap={1} paddingTop={2}>
              {items.length === 0 ? (
                <Typography variant="pi" textColor="neutral600">
                  Empty — drag a block from Components.
                </Typography>
              ) : (
                items.map((item, index) => {
                  const field = `${zone.zone}.${index}`;
                  const component = String(item.__component ?? '');
                  const isSelected = selected === field;
                  const summary = summarise(item as Record<string, unknown>);

                  return (
                    <Flex
                      key={`${field}-${item.id ?? index}`}
                      direction="column"
                      alignItems="stretch"
                      padding={2}
                      hasRadius
                      background={isSelected ? 'primary100' : 'neutral0'}
                      style={{
                        border: `1px solid var(--${isSelected ? 'primary200' : 'neutral200'}, #dcdce4)`,
                        cursor: 'pointer',
                      }}
                      onClick={() => onSelect(zone.entry, field)}
                    >
                      <Typography variant="omega" fontWeight="semiBold">
                        {component ? componentLabel(schemas, component) : 'Block'}
                      </Typography>

                      {summary ? (
                        /*
                         * One line, ellipsised. A block's title is what tells two Features apart,
                         * but a description wrapped over four lines turns the outline back into
                         * the thing it is meant to be an index of.
                         */
                        <Typography
                          variant="pi"
                          textColor="neutral600"
                          ellipsis
                          style={{ maxWidth: '100%' }}
                        >
                          {summary}
                        </Typography>
                      ) : null}
                    </Flex>
                  );
                })
              )}
            </Flex>
          </Box>
        );
      })}
    </Flex>
  );
};

export { Outline };
