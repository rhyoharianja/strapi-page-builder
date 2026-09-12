import { Button, Flex } from '@strapi/design-system';
import { Check, Upload } from '@strapi/icons';

interface DocumentActionsProps {
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onPublish: () => void;
}

/**
 * Save and Publish, always reachable.
 *
 * They used to live inside the inspector, which renders nothing until a block is selected — and
 * the commonest way to change a page is to *drag*, which selects nothing. An editor could reorder
 * a page and then find no way to publish it without first clicking some unrelated block.
 *
 * These act on the document, not on the selection, so they belong outside anything the selection
 * controls.
 */
const DocumentActions = ({ dirty, busy, onSave, onPublish }: DocumentActionsProps) => (
  <Flex gap={2} padding={4} paddingBottom={0}>
    <Button startIcon={<Check />} disabled={!dirty || busy} loading={busy} onClick={onSave} fullWidth>
      Save
    </Button>
    <Button variant="secondary" startIcon={<Upload />} disabled={busy} onClick={onPublish} fullWidth>
      Publish
    </Button>
  </Flex>
);

export { DocumentActions };
