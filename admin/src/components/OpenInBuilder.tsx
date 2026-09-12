import { useNavigate } from 'react-router-dom';
import { Button } from '@strapi/design-system';
import { Cursor } from '@strapi/icons';
import { unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';

import { PLUGIN_ID } from '../pluginId';
import { useSettings } from '../hooks/useSettings';

/**
 * Fill `/artikel/{slug}` from the entry being edited.
 *
 * Returns `null` when a placeholder has no value, which is the common case while an entry is
 * still being written: a slug that has not been generated yet would produce `/artikel/undefined`,
 * and opening the builder on a 404 is a worse answer than not offering the button.
 */
const resolvePattern = (pattern: string, values: Record<string, unknown>): string | null => {
  let missing = false;

  const path = pattern.replace(/\{([^}]+)\}/g, (_, field: string) => {
    const value = field.split('.').reduce<unknown>((current, key) => {
      if (current === null || current === undefined) return undefined;
      return (current as Record<string, unknown>)[key];
    }, values);

    if (value === undefined || value === null || value === '') {
      missing = true;
      return '';
    }

    return encodeURIComponent(String(value));
  });

  return missing ? null : path;
};

/**
 * "Edit visually" on the Content Manager's edit view.
 *
 * **Why this needs configuration at all.** Strapi knows the entry; only the project knows what
 * URL renders it. `/{slug}` for a page, `/artikel/{slug}` for an article, nothing at all for a
 * content-type that is never a page of its own — that mapping is a fact about the front end's
 * routing, and no amount of inspection of the schema will produce it. So the button appears only
 * for the content-types named in `entryUrls`, and stays out of the way everywhere else rather
 * than offering to open a URL that does not exist.
 *
 * The builder is opened with the entry already chosen, so the editor lands on the page they were
 * editing with its inspector pointed at it — rather than on whatever `frontendUrl` happens to be
 * and a fresh hunt for the right section.
 */
const OpenInBuilder = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { model, id, isCreatingEntry, form } = useContentManagerContext();

  const pattern = settings?.entryUrls?.[model];

  // Nothing to point at: this content-type is not a page, or the entry does not exist yet.
  if (!pattern || !settings?.frontendUrl || isCreatingEntry || !id) return null;

  const values = ((form as { values?: unknown })?.values ?? {}) as Record<string, unknown>;
  const path = resolvePattern(pattern, values);

  if (path === null) return null;

  let target: string;

  try {
    // Resolved against the origin, so a `frontendUrl` that already carries a path is ignored here.
    target = new URL(path, new URL(settings.frontendUrl).origin).toString();
  } catch {
    return null;
  }

  const open = () => {
    const params = new URLSearchParams({ url: target, uid: model, documentId: id });

    navigate(`/plugins/${PLUGIN_ID}?${params.toString()}`);
  };

  return (
    <Button variant="secondary" startIcon={<Cursor />} onClick={open} fullWidth>
      Edit visually
    </Button>
  );
};

export { OpenInBuilder };
