import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Flex, Loader } from '@strapi/design-system';
import { Page } from '@strapi/strapi/admin';

import type { SourceHit, ZoneHit } from '../../../shared/protocol';
import { sameEntry, type StrapiSource } from '../../../shared/source';
import { Canvas } from '../components/Canvas';
import { DocumentActions } from '../components/DocumentActions';
import { DraftNotice } from '../components/DraftNotice';
import { DropSurface } from '../components/DropSurface';
import { NewPageDialog } from '../components/NewPageDialog';
import { Resizer } from '../components/Resizer';
import { Inspector } from '../components/Inspector';
import { Sidebar } from '../components/Sidebar';
import { SetupNotice } from '../components/SetupNotice';
import { Toolbar, type Device, type Mode } from '../components/Toolbar';
import { useBridge } from '../hooks/useBridge';
import { useEntry } from '../hooks/useEntry';
import { useSchemas } from '../hooks/useSchemas';
import { usePages } from '../hooks/usePages';
import { usePreviewToken } from '../hooks/usePreviewToken';
import { useSettings } from '../hooks/useSettings';
import { blankItem } from '../utils/schema';

/** A drop the bridge reported, waiting for its entry to be loaded before it can be applied. */
interface PendingDrop {
  zone: string;
  entry: StrapiSource;
  index: number;
  from?: number;
  component?: string;
}

/**
 * The builder: a site in an iframe, the blocks that can be dropped into it, and the form for
 * whatever is selected.
 *
 * A *full-page* route rather than a panel inside the Content Manager, because the thing being
 * edited is a page, not an entry: an editor arrives knowing what the page should look like, not
 * which of eleven content-types the heading lives on. Starting from the rendered page and
 * letting the click decide the entry is the entire point.
 */
const Builder = () => {
  const { settings, loading } = useSettings();
  const schemas = useSchemas();
  const previewToken = usePreviewToken();
  const { pages, create, creatable } = usePages(
    schemas,
    settings?.entryUrls,
    settings?.frontendUrl
  );

  /**
   * Panel widths, remembered.
   *
   * An editor who narrows the inspector to see more of the page means it, and means it next time
   * too. Kept in `localStorage` rather than on the server: it is a preference of this browser at
   * this screen size, not a fact about the project.
   */
  const [sidebarWidth, setSidebarWidth] = useState(() => readWidth('sidebar', 280));
  const [inspectorWidth, setInspectorWidth] = useState(() => readWidth('inspector', 380));
  const [resizing, setResizing] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);

  useEffect(() => writeWidth('sidebar', sidebarWidth), [sidebarWidth]);
  useEffect(() => writeWidth('inspector', inspectorWidth), [inspectorWidth]);

  const frame = useRef<HTMLIFrameElement>(null);
  const [searchParams] = useSearchParams();

  const [url, setUrl] = useState('');
  const [src, setSrc] = useState('');
  const [mode, setMode] = useState<Mode>('edit');
  const [device, setDevice] = useState<Device>('desktop');
  const [status, setStatus] = useState('Waiting for the page…');

  const [zones, setZones] = useState<ZoneHit[]>([]);
  const [selected, setSelected] = useState<SourceHit | null>(null);
  const [pending, setPending] = useState<PendingDrop | null>(null);
  const [unpublished, setUnpublished] = useState(false);
  /** Whether the framed site actually took up the draft-preview token. */
  const [draftPreview, setDraftPreview] = useState(false);

  /**
   * The palette drag in flight, and where the canvas was when it started.
   *
   * Held here because the admin, not the canvas, has to catch this drag — see `DropSurface`.
   */
  const [dragging, setDragging] = useState<string | null>(null);
  const [canvasBox, setCanvasBox] = useState<
    { x: number; y: number; width: number; height: number } | null
  >(null);

  /**
   * Which entry the panel is working on, kept apart from which *field* is selected.
   *
   * A drop can land on an entry nobody has clicked yet — a page may render several — so the
   * document being edited cannot simply be "whatever was last selected". Splitting the two lets
   * a drop switch entries and have its operation applied once that entry has loaded.
   */
  const [active, setActive] = useState<StrapiSource | null>(null);

  const schema = active && schemas ? schemas.contentTypes[active.uid] : undefined;
  const doc = useEntry(active, schema);

  /**
   * Where to open, and on what.
   *
   * The Content Manager's "Edit visually" button arrives with all three in the query string, so
   * the editor lands on the page they were already editing with the inspector pointed at that
   * entry — not on `frontendUrl` and a fresh hunt for the right section. Opening from the menu
   * carries none of it and falls back to the configured site.
   *
   * `searchParams` is read once into a memo: it is a fresh object on every render, and depending
   * on it directly would re-seed the canvas — and throw away the editor's navigation — on each
   * one.
   */
  const opened = useMemo(
    () => ({
      url: searchParams.get('url'),
      uid: searchParams.get('uid'),
      documentId: searchParams.get('documentId'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (src) return;

    const initial = opened.url ?? settings?.frontendUrl;

    if (!initial) return;

    setUrl(initial);
    setSrc(initial);

    if (opened.uid && opened.documentId) {
      setActive({ uid: opened.uid, documentId: opened.documentId });
    }
  }, [settings, src, opened]);

  const { post } = useBridge(frame, settings?.allowedOrigins ?? [], {
    onReady: ({ hits, version, preview: active }) => {
      setDraftPreview(Boolean(active));
      setStatus(
        version === settings?.protocolVersion
          ? `${hits} editable element${hits === 1 ? '' : 's'}${active ? ' · draft' : ''}`
          : `Bridge v${version} — expected v${settings?.protocolVersion}`
      );
      // Not `setMode` on every ready — see the loop note in the bridge's `init` handler.
    },
    onSelect: (hit) => {
      setSelected(hit);
      setActive((current) =>
        current && sameEntry(current, hit.source)
          ? current
          : { uid: hit.source.uid, documentId: hit.source.documentId, locale: hit.source.locale }
      );
    },
    /*
     * The address bar follows client-side navigation but must not reload the frame doing it:
     * writing `src` here would throw away the SPA state the editor just navigated through.
     */
    onNavigate: (next) => setUrl(next),
    onSources: (hits, nextZones, active) => {
      setDraftPreview(Boolean(active));

      /*
       * Adopt the entry the page itself declares.
       *
       * Until now the document loaded only once something was clicked, so the Layers tab opened
       * empty on a page full of blocks — the panel that exists to tell you what is here had
       * nothing to say until you already knew. A zone carries its entry, so there is no reason
       * to wait.
       */
      const first = nextZones[0]?.entry;

      if (first) {
        setActive((current) =>
          current && sameEntry(current, first)
            ? current
            : { uid: first.uid, documentId: first.documentId, locale: first.locale }
        );
      }

      setStatus(
        `${hits.length} editable element${hits.length === 1 ? '' : 's'}${active ? ' · draft' : ''}`
      );
      setZones(nextZones);
    },
    onDrop: (drop) => applyDrop(drop),
  }, previewToken);

  /**
   * One landing place for a drop, however it was made.
   *
   * A reorder inside the canvas arrives over `postMessage` from the bridge; a block dragged from
   * the palette arrives from the admin's own drop surface. They describe the same thing, so they
   * must not grow two ways of applying it.
   */
  function applyDrop(drop: PendingDrop) {
    setPending(drop);
    setActive((current) =>
      current && sameEntry(current, drop.entry)
        ? current
        : { uid: drop.entry.uid, documentId: drop.entry.documentId, locale: drop.entry.locale }
    );
  }

  /**
   * Begin a palette drag.
   *
   * The canvas is asked to re-scan first: the drop position is resolved against the rectangles it
   * last reported, and a page that has been scrolled since would otherwise place the block by
   * where things used to be.
   */
  const startPaletteDrag = useCallback(
    (component: string) => {
      const box = frame.current?.getBoundingClientRect();

      setCanvasBox(box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null);
      setDragging(component);
      post({ type: 'scan' });
      post({ type: 'dragStart', component });
    },
    [post]
  );

  const endPaletteDrag = useCallback(() => {
    setDragging(null);
    post({ type: 'dragEnd' });
  }, [post]);

  /*
   * Re-introduce ourselves when the token arrives.
   *
   * The handshake usually carries it, but the token is fetched in parallel with the iframe load
   * and often lands after `ready`. Sending a fresh `init` is how a page that booted without a
   * token still ends up in draft mode, instead of quietly showing published content for the rest
   * of the session.
   */
  useEffect(() => {
    if (!previewToken) return;

    post({
      type: 'init',
      origin: window.location.origin,
      version: settings?.protocolVersion ?? 1,
      previewToken,
    });
  }, [previewToken, post, settings?.protocolVersion]);

  /*
   * Push the mode when it changes, and once more shortly after a page load: the bridge boots with
   * `edit` but a builder left in browse mode must not silently start swallowing clicks again.
   */
  useEffect(() => {
    post({ type: 'setMode', mode });
    if (mode === 'browse') setSelected(null);
  }, [mode, post, src]);

  const save = useCallback(async () => {
    if (!(await doc.save())) return false;

    setUnpublished(true);

    /*
     * Refresh only when the site is actually reading drafts.
     *
     * With draft preview the canvas can re-render straight from the CMS and show exactly what was
     * saved — including a block it has never rendered before, which no amount of DOM patching can
     * invent. Without it, re-fetching would replace the draft view with the older published copy,
     * and a block dragged one place to the left would jump straight back.
     */
    if (draftPreview) post({ type: 'refresh' });

    return true;
  }, [doc, draftPreview, post]);

  /*
   * A structural change is applied and saved in two steps, not one.
   *
   * `moveItem` and `insertItem` only queue a change into React state, so calling `save()` in the
   * same tick would send the entry exactly as it was before the move. This flag carries the
   * intent across to the next render, where the new array is actually in hand.
   */
  const sawDirty = useRef(false);

  /**
   * The drop already applied, so it cannot be applied twice.
   *
   * `setPending(null)` only takes effect when React commits, and this effect depends on `doc`,
   * which is a fresh object every render — so nothing structural stops the effect from running
   * again over the same pending drop before the clear lands. Marking the object synchronously,
   * before any awaiting, closes that window; clearing the state afterwards is housekeeping.
   *
   * (A run that appeared to insert several blocks per drop turned out to be accumulated draft
   * state from earlier runs, not a duplicate apply. The guard stays because the race is real,
   * not because it was the cause.)
   */
  const applied = useRef<PendingDrop | null>(null);

  /* Apply a drop as soon as the entry it landed on is loaded. */
  useEffect(() => {
    if (!pending || !doc.entry || !active || !schemas) return;
    if (!sameEntry(active, pending.entry)) return;
    if (applied.current === pending) return;

    applied.current = pending;

    const apply = async () => {
      if (pending.from !== undefined) {
        const to = doc.moveItem(pending.zone, pending.from, pending.index);
        // Show the move before the round trip, so the drag lands where it was dropped.
        post({ type: 'reorder', zone: pending.zone, from: pending.from, to });
      } else if (pending.component) {
        doc.insertItem(pending.zone, blankItem(schemas, pending.component), pending.index);
      }

      sawDirty.current = true;
      setPending(null);
    };

    void apply();
  }, [pending, doc, active, schemas, post]);

  useEffect(() => {
    if (pending || !doc.dirty || doc.busy) return;
    if (!sawDirty.current) return;

    sawDirty.current = false;
    void save();
  }, [pending, doc.dirty, doc.busy, save]);

  const preview = useCallback(
    (source: StrapiSource, value: string) => post({ type: 'patch', source, value }),
    [post]
  );

  const publish = useCallback(async () => {
    if (await doc.publish()) {
      setUnpublished(false);
      // Now the site really has it, so the canvas can go back to reading the published API.
      post({ type: 'refresh' });
    }
  }, [doc, post]);

  /**
   * Pick a block from the Layers list.
   *
   * The canvas is told to scroll to it as well as the inspector being pointed at it: a section
   * three screens down is otherwise selected but invisible, which reads as the click having done
   * nothing.
   */
  const selectFromOutline = useCallback(
    (entry: StrapiSource, field: string) => {
      const source: StrapiSource = { ...entry, field };

      setSelected({ source, rect: { top: 0, left: 0, width: 0, height: 0 } });
      post({ type: 'highlight', source });
    },
    [post]
  );

  const removeBlock = useCallback(
    (zone: string, index: number) => {
      doc.removeItem(zone, index);
      post({ type: 'removeItem', zone, index });
      setSelected(null);
      sawDirty.current = true;
    },
    [doc, post]
  );

  if (loading) {
    return (
      <Page.Main>
        <Flex justifyContent="center" padding={10}>
          <Loader>Loading</Loader>
        </Flex>
      </Page.Main>
    );
  }

  if (!settings?.frontendUrl && !opened.url) {
    return (
      <Page.Main>
        <SetupNotice bridgePath={settings?.bridgePath ?? null} />
      </Page.Main>
    );
  }

  return (
    <Page.Main>
      <Flex direction="column" alignItems="stretch" height="100vh">
        <Toolbar
          pages={pages}
          current={src}
          onOpen={(next) => {
            setUrl(next);
            setSrc(next);
          }}
          onNew={() => setCreating(true)}
          canCreate={creatable.length > 0}
          mode={mode}
          onModeChange={setMode}
          device={device}
          onDeviceChange={setDevice}
          size={canvasSize}
          onRefresh={() => post({ type: 'refresh', hard: true })}
          status={status}
        />

        <Flex alignItems="stretch" flex="1" style={{ minHeight: 0 }}>
          <Box
            background="neutral100"
            style={{
              width: sidebarWidth,
              flexShrink: 0,
              overflowY: 'auto',
            }}
          >
            <Sidebar
              zones={zones}
              schemas={schemas}
              doc={doc}
              selectedField={selected?.source.field}
              onSelectBlock={selectFromOutline}
              onDragStart={startPaletteDrag}
              onDragEnd={endPaletteDrag}
            />
          </Box>

          <Resizer
            side="left"
            width={sidebarWidth}
            min={200}
            max={480}
            onResize={setSidebarWidth}
            onActiveChange={setResizing}
          />

          <Canvas
            ref={frame}
            url={src}
            device={device}
            onLoad={() => setSelected(null)}
            onResize={setCanvasSize}
          />

          {/*
            An iframe swallows pointer events, so a resize drag that crosses the canvas would
            freeze halfway. The shield exists only while a handle is held.
          */}
          {resizing ? (
            <div style={{ position: 'fixed', inset: 0, zIndex: 4, cursor: 'col-resize' }} />
          ) : null}

          <Resizer
            side="right"
            width={inspectorWidth}
            min={280}
            max={640}
            onResize={setInspectorWidth}
            onActiveChange={setResizing}
          />

          <DropSurface
            component={dragging}
            zones={zones}
            canvas={canvasBox}
            onDrop={(drop) => {
              applyDrop(drop);
              endPaletteDrag();
            }}
            onCancel={endPaletteDrag}
          />

          <Box
            background="neutral0"
            style={{ width: inspectorWidth, flexShrink: 0, overflowY: 'auto' }}
          >
            {active ? (
              <DocumentActions
                dirty={doc.dirty}
                busy={doc.busy}
                onSave={() => void save()}
                onPublish={() => void publish()}
              />
            ) : null}

            {unpublished ? (
              <Box padding={4} paddingBottom={0}>
                <DraftNotice preview={draftPreview} />
              </Box>
            ) : null}

            <Inspector
              source={selected?.source ?? null}
              label={selected?.source.label}
              schemas={schemas}
              doc={doc}
              onPreview={preview}
              onRemoveBlock={removeBlock}
            />
          </Box>
        </Flex>
      </Flex>

      <NewPageDialog
        open={creating}
        creatable={creatable}
        schemas={schemas}
        busy={creatingBusy}
        onCancel={() => setCreating(false)}
        onCreate={async (uid, title) => {
          setCreatingBusy(true);

          try {
            const page = await create(uid, title);

            if (page) {
              setUrl(page.url);
              setSrc(page.url);
              setActive({ uid: page.uid, documentId: page.documentId });
              setSelected(null);
            }
          } finally {
            setCreatingBusy(false);
            setCreating(false);
          }
        }}
      />
    </Page.Main>
  );
};

/** Panel widths live in this browser, not on the server — see the note where they are read. */
const readWidth = (key: string, fallback: number): number => {
  try {
    const stored = Number(window.localStorage.getItem(`page-builder:${key}`));

    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  } catch {
    // Private browsing, or storage disabled: the default is a perfectly good answer.
    return fallback;
  }
};

const writeWidth = (key: string, width: number): void => {
  try {
    window.localStorage.setItem(`page-builder:${key}`, String(width));
  } catch {
    // Nothing to do and nothing worth telling the editor about.
  }
};

export { Builder };
