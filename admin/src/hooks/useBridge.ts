import { useCallback, useEffect, useRef } from 'react';

import { unwrap, wrap, type AdminMessage, type BridgeMessage } from '../../../shared/protocol';
import type { SourceHit, ZoneHit } from '../../../shared/protocol';
import type { StrapiSource } from '../../../shared/source';

interface BridgeHandlers {
  onReady?: (info: { url: string; version: number; hits: number; preview?: boolean }) => void;
  onSelect?: (hit: SourceHit) => void;
  onHover?: (hit: SourceHit | null) => void;
  onNavigate?: (url: string) => void;
  onSources?: (hits: SourceHit[], zones: ZoneHit[], preview?: boolean) => void;
  onDrop?: (drop: {
    zone: string;
    entry: StrapiSource;
    index: number;
    from?: number;
    component?: string;
  }) => void;
}

/**
 * The admin half of the `postMessage` conversation.
 *
 * **Why the handlers live in a ref.** The listener is attached once, to `window`, for the life of
 * the builder page. If it depended on the handler props it would be torn down and re-attached on
 * every render — and a `ready` that arrives during that gap is simply lost, which shows up as an
 * iframe that loaded fine but never becomes clickable. Reading the latest handlers out of a ref
 * keeps one stable listener and still calls current code.
 *
 * **Why the origin check is not optional.** Anything can `postMessage` into the admin window:
 * browser extensions, embedded widgets, another tab's opener. Only the origins the server said
 * are allowed may drive this UI, because the messages it acts on decide which content gets
 * written.
 */
export const useBridge = (
  frame: React.RefObject<HTMLIFrameElement | null>,
  allowedOrigins: string[],
  handlers: BridgeHandlers,
  /** Handed to the page on `init` so it can read drafts. Absent until the token arrives. */
  previewToken?: string | null
) => {
  const latest = useRef(handlers);
  latest.current = handlers;

  const origins = useRef(allowedOrigins);
  origins.current = allowedOrigins;

  const token = useRef(previewToken);
  token.current = previewToken;

  /** Address the iframe by its exact origin, never `*` — patches carry unpublished content. */
  const post = useCallback(
    (message: AdminMessage, targetOrigin?: string) => {
      const target = frame.current?.contentWindow;
      if (!target) return;

      target.postMessage(wrap(message), targetOrigin ?? origins.current[0] ?? '*');
    },
    [frame]
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!origins.current.includes(event.origin)) return;

      const message = unwrap<BridgeMessage>(event.data);
      if (!message) return;

      const on = latest.current;

      switch (message.type) {
        case 'ready':
          /*
           * The handshake is answered from here rather than from a load handler on the iframe:
           * a client-side route change re-announces `ready` with no load event at all, and the
           * bridge needs the admin's origin again to keep addressing it.
           */
          event.source?.postMessage(
            wrap<AdminMessage>({
              type: 'init',
              origin: window.location.origin,
              version: message.version,
              ...(token.current ? { previewToken: token.current } : {}),
            }),
            { targetOrigin: event.origin } as WindowPostMessageOptions
          );
          on.onReady?.(message);
          break;

        case 'select':
          on.onSelect?.(message.hit);
          break;

        case 'hover':
          on.onHover?.(message.hit);
          break;

        case 'navigate':
          on.onNavigate?.(message.url);
          break;

        case 'sources':
          on.onSources?.(message.hits, message.zones ?? [], message.preview);
          break;

        case 'drop':
          on.onDrop?.(message);
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return { post };
};
