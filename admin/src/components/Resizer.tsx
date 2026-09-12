import { useCallback, useEffect, useRef } from 'react';

interface ResizerProps {
  /** Which side of the canvas this handle sits on — it decides which way a drag grows the panel. */
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  /** True while a drag is in progress, so the canvas can be shielded from the pointer. */
  onActiveChange: (active: boolean) => void;
}

/**
 * A drag handle between a panel and the canvas.
 *
 * Pointer events on `window` rather than on the handle, because the pointer routinely leaves the
 * handle mid-drag — it is four pixels wide — and a listener bound to the element stops receiving
 * moves the moment it does. Pointer capture would work too; listening on the window is the same
 * idea with less to go wrong.
 *
 * While dragging, the canvas iframe must not receive the pointer: an iframe swallows pointer
 * events, so a drag that crosses it would freeze. The Builder drops a shield over the canvas for
 * the duration.
 */
const Resizer = ({ side, width, min, max, onResize, onActiveChange }: ResizerProps) => {
  const start = useRef<{ x: number; width: number } | null>(null);

  const move = useCallback(
    (event: PointerEvent) => {
      if (!start.current) return;

      const delta = event.clientX - start.current.x;
      // A handle on the right of the canvas grows its panel when dragged left.
      const next = start.current.width + (side === 'left' ? delta : -delta);

      onResize(Math.min(Math.max(next, min), max));
    },
    [side, min, max, onResize]
  );

  const stop = useCallback(() => {
    if (!start.current) return;

    start.current = null;
    onActiveChange(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onActiveChange]);

  useEffect(() => {
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [move, stop]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel`}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, width };
        onActiveChange(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      style={{
        flexShrink: 0,
        width: 5,
        cursor: 'col-resize',
        background: 'var(--neutral150, #eaeaef)',
      }}
    />
  );
};

export { Resizer };
