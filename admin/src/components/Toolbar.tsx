import {
  Button,
  Flex,
  IconButton,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from '@strapi/design-system';
import { ArrowClockwise, ArrowsOut, Cursor, Expand, Eye, Monitor, Phone, Plus } from '@strapi/icons';

import type { EditablePage } from '../hooks/usePages';

export type Device = 'desktop' | 'tablet' | 'mobile' | 'free';
export type Mode = 'edit' | 'browse';

/**
 * The viewports, with their widths written down.
 *
 * `free` has no width of its own: it fills whatever the panels leave, which is what makes the
 * resizable panels a sizing tool as well as a layout one — drag the inspector narrower and the
 * canvas gets wider, and the readout says by how much.
 */
export const DEVICES: { id: Device; label: string; width: number | null; Icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Desktop', width: 1280, Icon: Monitor },
  { id: 'tablet', label: 'Tablet', width: 834, Icon: Expand },
  { id: 'mobile', label: 'Mobile', width: 390, Icon: Phone },
  { id: 'free', label: 'Free size', width: null, Icon: ArrowsOut },
];

interface ToolbarProps {
  pages: EditablePage[];
  current: string;
  onOpen: (url: string) => void;
  onNew: () => void;
  canCreate: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  device: Device;
  onDeviceChange: (device: Device) => void;
  /** Measured size of the canvas, so the readout is what is really on screen. */
  size: { width: number; height: number } | null;
  onRefresh: () => void;
  status: string;
}

/**
 * Page picker, mode switch, viewport, reload.
 *
 * **No address bar.** Typing a URL let an editor navigate anywhere — including pages this CMS
 * does not own — and then wonder why nothing on them was editable. The picker can only offer
 * entries that exist and that the plugin knows how to edit, which is a smaller and far more
 * useful set. It is built from `entryUrls`, so it covers every content-type a project maps, not
 * just pages.
 *
 * The mode switch is not decoration. In edit mode the bridge swallows every click, so the site's
 * own links stop working; handing the clicks back is how an editor walks the site. Browse then
 * edit is the real workflow.
 */
const Toolbar = ({
  pages,
  current,
  onOpen,
  onNew,
  canCreate,
  mode,
  onModeChange,
  device,
  onDeviceChange,
  size,
  onRefresh,
  status,
}: ToolbarProps) => (
  <Flex
    gap={2}
    padding={3}
    background="neutral0"
    alignItems="center"
    style={{ borderBottom: '1px solid var(--neutral150, #eaeaef)', flexShrink: 0 }}
  >
    <IconButton
      label={mode === 'edit' ? 'Switch to browsing' : 'Switch to editing'}
      variant={mode === 'edit' ? 'secondary' : 'tertiary'}
      onClick={() => onModeChange(mode === 'edit' ? 'browse' : 'edit')}
    >
      {mode === 'edit' ? <Cursor /> : <Eye />}
    </IconButton>

    <div style={{ minWidth: 240, maxWidth: 420, flex: 1 }}>
      <SingleSelect
        aria-label="Page"
        placeholder={pages.length ? 'Choose a page' : 'No editable pages configured'}
        disabled={pages.length === 0}
        value={current}
        onChange={(next: string | number) => onOpen(String(next))}
      >
        {pages.map((page) => (
          <SingleSelectOption key={`${page.uid}-${page.documentId}`} value={page.url}>
            {`${page.title} · ${page.type}`}
          </SingleSelectOption>
        ))}
      </SingleSelect>
    </div>

    <Button variant="tertiary" startIcon={<Plus />} disabled={!canCreate} onClick={onNew}>
      New
    </Button>

    <Flex flex="1" />

    {/*
      A row of icons rather than a dropdown: three viewports and a free mode is a choice you make
      often and want to see the state of, which a collapsed select hides.
    */}
    <Flex gap={1}>
      {DEVICES.map(({ id, label, Icon }) => (
        <IconButton
          key={id}
          label={label}
          variant={device === id ? 'secondary' : 'tertiary'}
          onClick={() => onDeviceChange(id)}
        >
          <Icon />
        </IconButton>
      ))}
    </Flex>

    <Typography
      variant="pi"
      textColor="neutral600"
      style={{ whiteSpace: 'nowrap', minWidth: 92, textAlign: 'right' }}
    >
      {size ? `${Math.round(size.width)} × ${Math.round(size.height)}` : '—'}
    </Typography>

    <IconButton label="Reload the page" variant="tertiary" onClick={onRefresh}>
      <ArrowClockwise />
    </IconButton>

    <Typography variant="pi" textColor="neutral600" style={{ whiteSpace: 'nowrap' }}>
      {status}
    </Typography>
  </Flex>
);

export { Toolbar };
