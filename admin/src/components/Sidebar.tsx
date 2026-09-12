import { Box, Tabs } from '@strapi/design-system';

import type { ZoneHit } from '../../../shared/protocol';
import type { StrapiSource } from '../../../shared/source';
import type { useEntry } from '../hooks/useEntry';
import type { SchemaIndex } from '../utils/schema';
import { Outline } from './Outline';
import { Palette } from './Palette';

interface SidebarProps {
  zones: ZoneHit[];
  schemas: SchemaIndex | null;
  doc: ReturnType<typeof useEntry>;
  selectedField?: string;
  onSelectBlock: (source: StrapiSource, field: string) => void;
  onDragStart: (component: string) => void;
  onDragEnd: () => void;
}

/**
 * The left rail: what this page is, and what it could be.
 *
 * Two tabs rather than one long column, because they answer different questions. **Layers** is
 * the page as it stands — the blocks actually in the entry, in order, clickable to jump to. It
 * opens first because that is what an editor arriving at a page wants to see. **Components** is
 * the library: everything the zone will accept, grouped by category.
 *
 * They were one list at first, and it read as a menu of twenty-five things with no relationship
 * to the page on screen — the two most common actions, "take me to that section" and "add a
 * section", were both buried in it.
 */
const Sidebar = ({
  zones,
  schemas,
  doc,
  selectedField,
  onSelectBlock,
  onDragStart,
  onDragEnd,
}: SidebarProps) => (
  <Tabs.Root defaultValue="layers" variant="simple">
    <Box paddingLeft={3} paddingRight={3} paddingTop={2}>
      <Tabs.List aria-label="Page structure and available blocks">
        <Tabs.Trigger value="layers">Layers</Tabs.Trigger>
        <Tabs.Trigger value="components">Components</Tabs.Trigger>
      </Tabs.List>
    </Box>

    <Tabs.Content value="layers">
      <Outline
        zones={zones}
        schemas={schemas}
        doc={doc}
        selected={selectedField}
        onSelect={onSelectBlock}
      />
    </Tabs.Content>

    <Tabs.Content value="components">
      <Palette zones={zones} schemas={schemas} onDragStart={onDragStart} onDragEnd={onDragEnd} />
    </Tabs.Content>
  </Tabs.Root>
);

export { Sidebar };
