import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

import { PLUGIN_ID } from '../pluginId';

export interface PageBuilderSettings {
  frontendUrl: string;
  allowedOrigins: string[];
  protocolVersion: number;
  bridgePath: string | null;
  entryUrls: Record<string, string>;
}

/**
 * Read the plugin's server-side config.
 *
 * Fetched rather than compiled into the admin bundle because `frontendUrl` is an environment
 * value: the same admin build runs against localhost, staging and production, and each points
 * at a different site. Baking it in would mean a rebuild per environment.
 */
export const useSettings = () => {
  const { get } = useFetchClient();
  const [settings, setSettings] = useState<PageBuilderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    get<{ data: PageBuilderSettings }>(`/${PLUGIN_ID}/settings`)
      .then(({ data }) => {
        if (!cancelled) setSettings(data.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load settings');
      });

    return () => {
      cancelled = true;
    };
  }, [get]);

  return { settings, error, loading: settings === null && error === null };
};
