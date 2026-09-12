import { forwardRef, useEffect, useRef } from 'react';
import { Box } from '@strapi/design-system';

import { DEVICES, type Device } from './Toolbar';

interface CanvasProps {
  url: string;
  device: Device;
  onLoad: () => void;
  /** Reports the measured size, so the toolbar shows what is really on screen. */
  onResize: (size: { width: number; height: number }) => void;
}

/**
 * The site itself, framed.
 *
 * No `sandbox` attribute. It reads as the cautious choice and it is the wrong one here: the frame
 * holds the project's own front end, loaded from an origin the server explicitly allowed, and
 * sandboxing would strip exactly the capabilities the page needs to be worth previewing — its
 * scripts, its storage, its navigation. The real boundary is the CSP `frame-src` list and the
 * origin check on every message, both enforced elsewhere and not bypassable by the framed page.
 *
 * The size is **measured**, never assumed: a 1280px desktop in a 900px column is 900px wide, and
 * a readout that claimed otherwise would be worse than none. `free` has no width of its own, so
 * it reports whatever the panels leave it.
 */
const Canvas = forwardRef<HTMLIFrameElement, CanvasProps>(({ url, device, onLoad, onResize }, ref) => {
  const shell = useRef<HTMLDivElement>(null);
  const width = DEVICES.find((d) => d.id === device)?.width;

  useEffect(() => {
    const element = shell.current;

    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      onResize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [onResize]);

  return (
    <Box background="neutral150" flex="1" style={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
      <div
        ref={shell}
        style={{
          width: width ? `${width}px` : '100%',
          maxWidth: '100%',
          height: '100%',
          margin: '0 auto',
          background: '#fff',
          transition: 'width .15s ease',
        }}
      >
        <iframe
          ref={ref}
          src={url}
          title="Site preview"
          onLoad={onLoad}
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
    </Box>
  );
});

Canvas.displayName = 'Canvas';

export { Canvas };
