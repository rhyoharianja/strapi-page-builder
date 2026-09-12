import { useRef, useState } from 'react';

import type { SourceRect, ZoneHit } from '../../../shared/protocol';
import type { StrapiSource } from '../../../shared/source';

interface DropSurfaceProps {
  /** The component being dragged from the palette, or `null` when nothing is. */
  component: string | null;
  zones: ZoneHit[];
  /** Where the canvas iframe sits in the admin's own viewport. */
  canvas: { x: number; y: number; width: number; height: number } | null;
  onDrop: (drop: { zone: string; entry: StrapiSource; index: number; component: string }) => void;
  onCancel: () => void;
}

/**
 * Catches a drag from the palette, because the canvas cannot.
 *
 * **Chrome does not deliver drag events into a cross-origin iframe.** Verified rather than
 * assumed: during a real mouse drag from the palette the framed page received the plugin's own
 * `dragStart` and `dragEnd` messages and *zero* `dragenter`, `dragover` or `drop` events. Every
 * earlier check had dropped blocks by posting the protocol message straight to the bridge, which
 * proves the protocol and says nothing about the gesture — so this was invisible until a real
 * drag was driven end to end.
 *
 * Reordering **inside** the canvas is unaffected and still handled by the bridge: that drag starts
 * and ends in the same document, so the browser routes it normally. Only palette → canvas needs
 * this.
 *
 * The surface is a transparent layer over the iframe, present only while a palette drag is in
 * flight — at any other time it would swallow every click meant for the page. Drop positions are
 * resolved against the item rectangles the bridge reports, converted from the canvas's coordinate
 * space into the admin's by the iframe's own offset.
 */
const DropSurface = ({ component, zones, canvas, onDrop, onCancel }: DropSurfaceProps) => {
  const [indicator, setIndicator] = useState<{ top: number; left: number; height: number } | null>(
    null
  );
  const target = useRef<{ zone: ZoneHit; index: number } | null>(null);

  if (!component || !canvas || zones.length === 0) return null;

  /** Which zone the pointer is inside, in canvas coordinates. */
  const zoneAt = (x: number, y: number): ZoneHit | null =>
    zones.find(
      (zone) =>
        x >= zone.rect.left &&
        x <= zone.rect.left + zone.rect.width &&
        y >= zone.rect.top &&
        y <= zone.rect.top + zone.rect.height
      // A page with one zone is the common case; the first match is the right one.
    ) ??
    zones[0] ??
    null;

/**
 * Whether two items sit side by side rather than stacked.
 *
 * Tested as *substantial* vertical overlap, not any overlap at all. Adjacent stacked sections
 * routinely share a boundary pixel — one block ending at 434 while the next begins at 433 — and
 * treating that as a shared row made the editor decide "before or after" on the horizontal axis
 * for a vertical stack. Every drop on the right-hand half then landed one slot late.
 */
const sharesRow = (a: SourceRect, b: SourceRect): boolean => {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);

  return overlap > Math.min(a.height, b.height) * 0.5;
};

  /**
   * Where a drop at this point would insert — the same rule the bridge applies to drags inside
   * the canvas, so a block lands in the same place whichever way it was dragged.
   *
   * The axis that decides "before or after" is the axis that actually separates the items: the
   * vertical midpoint for a stack of full-width sections, the horizontal one for cards sharing a
   * row. Using the horizontal rule for everything was wrong in a way that read as a random
   * off-by-one — the canvas has a scrollbar, so a full-width block's centre sits a few pixels
   * left of the iframe's centre, and every drop on the right-hand side landed one slot late.
   */
  const insertionAt = (zone: ZoneHit, x: number, y: number) => {
    const items = zone.items;

    for (let i = 0; i < items.length; i += 1) {
      const rect = items[i];
      const inRow = y >= rect.top && y <= rect.top + rect.height;

      if (!inRow) {
        // Above this item: the drop belongs before it. Below: keep looking.
        if (y < rect.top) return i;
        continue;
      }

      const shares = items.some((other, j) => j !== i && sharesRow(rect, other));

      const after = shares ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;

      return after ? i + 1 : i;
    }

    return items.length;
  };

  /** Where a pointer at these page coordinates would insert. */
  const resolve = (clientX: number, clientY: number) => {
    // The canvas reports its own viewport coordinates; shift them into this document's.
    const x = clientX - canvas.x;
    const y = clientY - canvas.y;

    const zone = zoneAt(x, y);

    return zone ? { zone, index: insertionAt(zone, x, y) } : null;
  };

  const over = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    const landing = resolve(event.clientX, event.clientY);
    if (!landing) return;

    const { zone, index } = landing;
    target.current = landing;

    const anchor = zone.items[index] ?? zone.items[zone.items.length - 1];

    setIndicator(
      anchor
        ? {
            top: canvas.y + anchor.top,
            left: canvas.x + anchor.left,
            height: Math.max(anchor.height, 4),
          }
        : { top: canvas.y + zone.rect.top, left: canvas.x + zone.rect.left, height: 4 }
    );
  };

  const drop = (event: React.DragEvent) => {
    event.preventDefault();

    /*
     * Resolved from the drop's own coordinates, not from whatever the last `dragover` recorded.
     *
     * The surface only mounts once the drag has started, so a drag that reaches the canvas in one
     * movement can deliver its `drop` without this component ever having seen a `dragover` — and
     * relying on the remembered target made the drop land about half the time. The last hover is
     * kept only as a fallback for a drop with no usable coordinates.
     */
    const landed = resolve(event.clientX, event.clientY) ?? target.current;


    setIndicator(null);
    target.current = null;

    if (!landed) {
      onCancel();
      return;
    }

    onDrop({
      zone: landed.zone.zone,
      entry: landed.zone.entry,
      index: landed.index,
      component,
    });
  };

  return (
    <>
      <div
        onDragOver={over}
        onDrop={drop}
        onDragLeave={() => setIndicator(null)}
        style={{
          position: 'fixed',
          top: canvas.y,
          left: canvas.x,
          width: canvas.width,
          height: canvas.height,
          zIndex: 5,
        }}
      />

      {indicator ? (
        <div
          style={{
            position: 'fixed',
            top: indicator.top,
            left: indicator.left - 5,
            width: 3,
            height: indicator.height,
            background: 'var(--primary600, #4945ff)',
            borderRadius: 2,
            boxShadow: '0 0 0 2px rgba(73, 69, 255, .25)',
            pointerEvents: 'none',
            zIndex: 6,
          }}
        />
      ) : null}
    </>
  );
};

export { DropSurface };
