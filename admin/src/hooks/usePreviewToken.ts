import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

import { PLUGIN_ID } from '../pluginId';

/**
 * A short-lived token the canvas can use to read drafts.
 *
 * Fetched once when the builder opens and re-fetched a minute before it expires, because an
 * editing session outlives the token by design — thirty minutes of validity is what makes a
 * leaked token uninteresting, and silently letting it lapse mid-session would make the canvas
 * quietly fall back to published content with nothing to explain why.
 */
export const usePreviewToken = () => {
  const { get } = useFetchClient();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fetchToken = async () => {
      try {
        const { data } = await get<{ data: { token: string; expiresAt: number } }>(
          `/${PLUGIN_ID}/preview-token`
        );

        if (cancelled) return;

        setToken(data.data.token);

        const renewIn = Math.max(data.data.expiresAt - Date.now() - 60_000, 60_000);
        timer = setTimeout(fetchToken, renewIn);
      } catch {
        // No token means no draft preview — the builder still works against published content.
        if (!cancelled) setToken(null);
      }
    };

    void fetchToken();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [get]);

  return token;
};
