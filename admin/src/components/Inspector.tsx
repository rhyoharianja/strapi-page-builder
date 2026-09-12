import { useMemo } from 'react';
import { Alert, Box, Button, Divider, Flex, Link, Typography } from '@strapi/design-system';
import { ExternalLink, Trash } from '@strapi/icons';

import type { StrapiSource } from '../../../shared/source';
import type { useEntry } from '../hooks/useEntry';
import {
  componentLabel,
  isEditable,
  isTextual,
  parseItemPath,
  resolveField,
  type SchemaIndex,
} from '../utils/schema';
import { BlockFields } from './BlockFields';
import { FieldInput } from './FieldInput';

interface InspectorProps {
  source: StrapiSource | null;
  label?: string;
  schemas: SchemaIndex | null;
  doc: ReturnType<typeof useEntry>;
  /** Live-patch the iframe as the editor types, so the change is visible before saving. */
  onPreview: (source: StrapiSource, value: string) => void;
  onRemoveBlock: (zone: string, index: number) => void;
}

/**
 * The right-hand panel: what was clicked, and the form that changes it.
 *
 * Two modes, decided by the annotation rather than by a toggle. A path ending in a bare index
 * came from a block's own element, so the panel shows that block — every field it has, plus the one
 * operation that only makes sense on a block, deleting it. Any other path came from a single
 * annotated field, and the panel shows just that field. Clicking a heading should not open a
 * form of eleven inputs, and clicking a card should not make you hunt for which of its fields
 * you meant.
 */
const Inspector = ({
  source,
  label,
  schemas,
  doc,
  onPreview,
  onRemoveBlock,
}: InspectorProps) => {
  const { valueAt, setField, busy, error } = doc;

  const schema = source && schemas ? schemas.contentTypes[source.uid] : undefined;
  const item = useMemo(() => parseItemPath(source?.field), [source?.field]);

  const resolved = useMemo(
    () =>
      source && schemas && !item ? resolveField(schemas, source.uid, source.field, valueAt()) : null,
    [source, schemas, item, valueAt]
  );

  if (!source) {
    return (
      <Box padding={6}>
        <Typography variant="delta">Nothing selected</Typography>
        <Box paddingTop={2}>
          <Typography variant="pi" textColor="neutral600">
            Click any annotated element in the page, or drag a block from the left.
          </Typography>
        </Box>
      </Box>
    );
  }

  const contentManagerUrl =
    schema?.kind === 'singleType'
      ? `/admin/content-manager/single-types/${source.uid}`
      : `/admin/content-manager/collection-types/${source.uid}/${source.documentId}`;

  /* ------------------------------------------------------------- block mode */

  const itemValue = item ? (valueAt(source.field) as Record<string, unknown> | undefined) : undefined;
  const componentUid = typeof itemValue?.__component === 'string' ? itemValue.__component : undefined;
  const componentSchema = componentUid ? schemas?.components[componentUid] : undefined;

  const title = item
    ? componentUid && schemas
      ? componentLabel(schemas, componentUid)
      : 'Block'
    : (label ?? schema?.info?.displayName ?? source.uid.split('.').pop() ?? source.uid);

  const change = (path: string, next: unknown, textual: boolean) => {
    setField(path, next);

    if (typeof next === 'string' && textual) {
      onPreview({ ...source, field: path }, next);
    }
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={4} padding={5} height="100%">
      <Box>
        <Typography variant="delta">{title}</Typography>
        <Box paddingTop={1}>
          <Typography variant="pi" textColor="neutral600">
            {source.uid}
            {source.locale ? ` · ${source.locale}` : ''}
          </Typography>
        </Box>
      </Box>

      <Divider />

      {error ? (
        <Alert variant="danger" title="Strapi refused the change" closeLabel="Dismiss">
          {error}
        </Alert>
      ) : null}

      {item ? (
        !componentSchema ? (
          <Alert variant="default" title="Unknown block" closeLabel="Dismiss">
            This item has no <code>__component</code> the schema recognises.
          </Alert>
        ) : (
          <Flex direction="column" alignItems="stretch" gap={3}>
            <BlockFields
              schemas={schemas!}
              attributes={componentSchema.attributes}
              basePath={source.field!}
              valueAt={(path) => valueAt(path)}
              onChange={change}
              disabled={busy}
            />

            <Box paddingTop={2}>
              <Button
                variant="danger-light"
                startIcon={<Trash />}
                disabled={busy}
                onClick={() => onRemoveBlock(item.zone, item.index)}
              >
                Remove block
              </Button>
            </Box>
          </Flex>
        )
      ) : !source.field ? (
        <Typography variant="pi" textColor="neutral600">
          This element marks the whole entry. Annotate a field with <code>data-strapi-field</code>{' '}
          to edit it here, or open the full form.
        </Typography>
      ) : !resolved ? (
        <Alert variant="default" title="Field not found" closeLabel="Dismiss">
          <code>{source.field}</code> is not in this content-type's schema. It may have been
          renamed, or the page may be running an older deploy.
        </Alert>
      ) : !isEditable(resolved.attribute) ? (
        <Alert
          variant="default"
          title={`${resolved.attribute.type} fields open in the form`}
          closeLabel="Dismiss"
        >
          Media, relations and structural fields are edited in the Content Manager, which handles
          them properly.
        </Alert>
      ) : (
        <FieldInput
          name={source.field}
          label={resolved.label}
          attribute={resolved.attribute}
          value={valueAt(source.field)}
          disabled={busy}
          onChange={(next) => change(source.field!, next, isTextual(resolved.attribute))}
        />
      )}

      <Box flex="1" />

      <Link href={contentManagerUrl} isExternal endIcon={<ExternalLink />}>
        Open in Content Manager
      </Link>
    </Flex>
  );
};

export { Inspector };
