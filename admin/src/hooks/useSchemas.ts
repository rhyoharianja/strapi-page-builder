import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

import type { Schema, SchemaIndex } from '../utils/schema';

const byUid = (rows: Schema[]): Record<string, Schema> =>
  rows.reduce<Record<string, Schema>>((all, row) => {
    all[row.uid] = row;
    return all;
  }, {});

/**
 * Every content-type and component schema, fetched once per builder session.
 *
 * Both endpoints in one hook because a field path can cross from one to the other mid-walk
 * (`blocks.2.title` starts in a content-type and ends in a component), so having only one of
 * them is never useful. They are small, cacheable and change only on a server restart, which is
 * why this is a plain fetch-on-mount rather than anything cleverer.
 */
export const useSchemas = () => {
  const { get } = useFetchClient();
  const [index, setIndex] = useState<SchemaIndex | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      get<{ data: Schema[] }>('/content-manager/content-types'),
      get<{ data: Schema[] }>('/content-manager/components'),
    ])
      .then(([types, components]) => {
        if (cancelled) return;

        setIndex({
          contentTypes: byUid(types.data.data ?? []),
          components: byUid(components.data.data ?? []),
        });
      })
      .catch(() => {
        // An empty index is a working state: the inspector says it cannot explain the field and
        // offers the Content Manager link, which is strictly better than a blank panel.
        if (!cancelled) setIndex({ contentTypes: {}, components: {} });
      });

    return () => {
      cancelled = true;
    };
  }, [get]);

  return index;
};
