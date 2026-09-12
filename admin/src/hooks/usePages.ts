import { useCallback, useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

import { absoluteUrl, entryTitle, newEntryBody, resolvePattern } from '../utils/entryUrl';
import type { SchemaIndex } from '../utils/schema';

export interface EditablePage {
  uid: string;
  /** Human name of the content-type, for grouping in the picker. */
  type: string;
  documentId: string;
  title: string;
  url: string;
}

/**
 * Every entry the builder can open, across every content-type the project mapped.
 *
 * This is what replaces the address bar. Typing a URL let an editor navigate to anything —
 * including pages the CMS does not own and URLs that do not exist — and then wonder why nothing
 * on them was editable. A list built from `entryUrls` can only offer pages that exist and that
 * this plugin knows how to edit, which is a smaller and far more useful set.
 *
 * Nothing here is specific to one content-type: a project adds `api::article.article` to
 * `entryUrls` and its articles appear in the picker and in "New", with no code change.
 */
export const usePages = (
  schemas: SchemaIndex | null,
  entryUrls: Record<string, string> | undefined,
  frontendUrl: string | undefined
) => {
  const { get, post } = useFetchClient();
  const [pages, setPages] = useState<EditablePage[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!schemas || !entryUrls || !frontendUrl) return;

    const uids = Object.keys(entryUrls);

    if (uids.length === 0) {
      setPages([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const found: EditablePage[] = [];

      for (const uid of uids) {
        const schema = schemas.contentTypes[uid];

        if (!schema) continue;

        const type = schema.info?.displayName ?? uid.split('.').pop() ?? uid;

        try {
          if (schema.kind === 'singleType') {
            const { data } = await get<{ data: Record<string, unknown> }>(
              `/content-manager/single-types/${uid}`
            );

            const path = resolvePattern(entryUrls[uid], data.data ?? {});
            const url = path && absoluteUrl(frontendUrl, path);

            if (url) {
              found.push({
                uid,
                type,
                documentId: String(data.data?.documentId ?? ''),
                title: entryTitle(data.data ?? {}, type),
                url,
              });
            }

            continue;
          }

          /*
           * A hundred is plenty for a picker and cheap to fetch. A site with more pages than that
           * needs search, not a longer list — and a longer list would be the wrong answer to the
           * same problem.
           */
          const { data } = await get<{ results: Record<string, unknown>[] }>(
            `/content-manager/collection-types/${uid}`,
            { params: { page: 1, pageSize: 100, sort: 'updatedAt:DESC' } }
          );

          for (const entry of data.results ?? []) {
            const path = resolvePattern(entryUrls[uid], entry);
            const url = path && absoluteUrl(frontendUrl, path);

            if (!url) continue;

            found.push({
              uid,
              type,
              documentId: String(entry.documentId ?? ''),
              title: entryTitle(entry),
              url,
            });
          }
        } catch {
          // One unreadable content-type must not empty the whole picker.
        }
      }

      if (!cancelled) {
        setPages(found);
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [schemas, entryUrls, frontendUrl, reloads, get]);

  /**
   * Create an entry and hand back the page it became.
   *
   * Created through the Content Manager's own endpoint, like every other write this plugin makes,
   * so validation and permissions apply exactly as they would in the form.
   */
  const create = useCallback(
    async (uid: string, title: string): Promise<EditablePage | null> => {
      const schema = schemas?.contentTypes[uid];

      if (!schema || !entryUrls?.[uid] || !frontendUrl) return null;

      const { data } = await post<{ data: Record<string, unknown> }>(
        `/content-manager/collection-types/${uid}`,
        newEntryBody(schema, title)
      );

      const entry = data.data ?? {};

      /*
       * Left as a draft, deliberately.
       *
       * Publishing on create would be the easy way to make the new page openable, and it is wrong:
       * an entry that has to go through review must not be published just so a tool can look at
       * it. The canvas reaches it through the preview token instead — see the soft 404 in the
       * front end's page component.
       */

      const path = resolvePattern(entryUrls[uid], entry);
      const url = path && absoluteUrl(frontendUrl, path);

      setReloads((count) => count + 1);

      if (!url) return null;

      return {
        uid,
        type: schema.info?.displayName ?? uid,
        documentId: String(entry.documentId ?? ''),
        title: entryTitle(entry),
        url,
      };
    },
    [schemas, entryUrls, frontendUrl, post]
  );

  /** Content-types an entry can be created in — the same ones the picker lists. */
  const creatable = Object.keys(entryUrls ?? {}).filter(
    (uid) => schemas?.contentTypes[uid]?.kind !== 'singleType'
  );

  return { pages, loading, create, creatable, refresh: () => setReloads((count) => count + 1) };
};
