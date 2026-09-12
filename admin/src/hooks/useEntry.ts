import { useCallback, useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

import { readPath, writePath, type StrapiSource } from '../../../shared/source';
import type { Schema } from '../utils/schema';

/** One item of a dynamic zone or repeatable component, as the API returns it. */
type Item = Record<string, unknown> & { id?: number };

type Entry = Record<string, unknown>;

/**
 * Load and write one entry through the **Content Manager's own endpoints**.
 *
 * This is the single most consequential decision in the plugin. The alternative — a plugin
 * controller doing `documents().update()` — would have to re-implement, and then keep in step
 * with, everything the Content Manager does on the way to the database: field-level RBAC,
 * validation, draft & publish, relation reordering, the audit trail. Reusing its endpoints means
 * an editor without permission to change a field gets the same 403 here as they would there, and
 * the plugin never becomes a quieter door onto the same content.
 *
 * The cost is honest: these are admin APIs, not a public contract, and a future Strapi may move
 * them. That is a much smaller risk than a second write path that disagrees with the first.
 */
export const useEntry = (source: StrapiSource | null, schema?: Schema) => {
  const { get, put, post } = useFetchClient();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [reloads, setReloads] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * No URL until the schema is known.
   *
   * The kind decides the endpoint, and guessing it is not free: a single type addressed as a
   * collection type is a different URL that simply fails. The schema arrives a moment after the
   * page announces itself, so the first render has `undefined` — and defaulting to
   * `collection-types` meant every single type began with a doomed request whose failure
   * sometimes stuck. Collection types never noticed, because the guess happened to be right for
   * them; `api::pegadaian-home` was where it showed, as a page whose edits silently never saved.
   */
  const kind = schema?.kind === 'singleType' ? 'single-types' : 'collection-types';
  const base =
    source && schema
      ? kind === 'single-types'
        ? `/content-manager/single-types/${source.uid}`
        : `/content-manager/collection-types/${source.uid}/${source.documentId}`
      : null;

  const params = source?.locale ? { params: { locale: source.locale } } : undefined;

  useEffect(() => {
    if (!base) {
      setEntry(null);
      return;
    }

    let cancelled = false;
    setError(null);

    get<{ data: Entry }>(base, params)
      .then(({ data }) => {
        if (cancelled) return;
        setEntry(data.data);
        setDirty(false);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load entry');
      });

    return () => {
      cancelled = true;
    };
    // `base` already encodes uid, documentId and kind; locale is the only other input.
  }, [base, source?.locale, reloads, get]);

  /** Change a field locally. Nothing is sent until save — see the note on `patch` in the protocol. */
  const setField = useCallback((path: string, value: unknown) => {
    setEntry((current) => (current ? writePath(current, path, value) : current));
    setDirty(true);
  }, []);

  const valueAt = useCallback((path?: string) => readPath(entry, path), [entry]);

  const listAt = useCallback(
    (zone: string): Item[] => {
      const value = readPath(entry, zone);
      return Array.isArray(value) ? (value as Item[]) : [];
    },
    [entry]
  );

  /**
   * Structural edits: move, insert, remove.
   *
   * All three rewrite the array and mark the entry dirty; none of them talk to the server. The
   * save that follows is the same PUT any other edit makes, which is what keeps one write path
   * — a dedicated "reorder" endpoint would be a second way to change the same document, with
   * its own idea of validation and permissions.
   */
  const moveItem = useCallback(
    (zone: string, from: number, index: number): number => {
      const list = listAt(zone);

      if (from < 0 || from >= list.length) return from;

      const next = [...list];
      const [moved] = next.splice(from, 1);

      /*
       * Removing first shifts everything after it down by one, so a drop marker that pointed
       * past the old position must come back by one too. Without this, dragging a block one
       * place to the right does nothing at all — the most confusing possible no-op.
       */
      const to = from < index ? index - 1 : index;
      next.splice(to, 0, moved);

      setEntry((current) => (current ? writePath(current, zone, next) : current));
      setDirty(true);

      return to;
    },
    [listAt]
  );

  const insertItem = useCallback(
    (zone: string, item: Record<string, unknown>, index: number) => {
      const next = [...listAt(zone)];
      next.splice(Math.min(index, next.length), 0, item as Item);

      setEntry((current) => (current ? writePath(current, zone, next) : current));
      setDirty(true);
    },
    [listAt]
  );

  const removeItem = useCallback(
    (zone: string, index: number) => {
      const next = listAt(zone).filter((_, position) => position !== index);

      setEntry((current) => (current ? writePath(current, zone, next) : current));
      setDirty(true);
    },
    [listAt]
  );

  /**
   * The document as the Content Manager wants it written back.
   *
   * The whole entry minus the metadata it adds on read. Sending only the changed field looked
   * tidier and is wrong: a PUT to these endpoints replaces the document, so a partial body
   * silently clears everything it omits.
   *
   * `status` and `localizations` are read-only views the endpoint computes, and `publishedAt`
   * belongs to the publish action, not to the payload.
   */
  const body = useCallback((): Record<string, unknown> | null => {
    if (!entry) return null;

    const {
      id,
      documentId,
      createdAt,
      updatedAt,
      publishedAt,
      createdBy,
      updatedBy,
      status,
      localizations,
      ...rest
    } = entry as Record<string, unknown>;

    return rest;
  }, [entry]);

  const save = useCallback(async () => {
    if (!base || !entry) return false;

    setBusy(true);
    setError(null);

    try {
      const { data } = await put<{ data: Entry }>(base, body(), params);
      setEntry(data.data);
      setDirty(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, [base, entry, body, put]);

  const publish = useCallback(async () => {
    if (!base) return false;

    setBusy(true);
    setError(null);

    try {
      /*
       * The publish action takes the document, not an empty body.
       *
       * Strapi 5 validates the payload against the content-type on publish — a required field
       * missing from the body is a 400, so posting `{}` fails on any content-type that has one.
       * Verified against this project: `{}` returned 400 while the same body the save sends
       * returns 200.
       */
      await post<{ data: Entry }>(`${base}/actions/publish`, body() ?? {}, params);

      /*
       * Re-read the draft instead of keeping what publish returned.
       *
       * Publish answers with the **published** version of the document, and Strapi numbers a
       * document's component items separately in each version — so holding on to that response
       * leaves the panel carrying published item ids while still editing the draft. The next
       * save sends those ids back and Strapi rejects it with a 400. Verified the hard way: the
       * failure only appears on the second structural edit after a publish.
       */
      setReloads((count) => count + 1);
      setDirty(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Publish failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, [base, body, post]);

  return {
    entry,
    valueAt,
    listAt,
    setField,
    moveItem,
    insertItem,
    removeItem,
    save,
    publish,
    dirty,
    busy,
    error,
  };
};
