import { useState } from 'react';
import {
  Button,
  Field,
  Flex,
  Modal,
  SingleSelect,
  SingleSelectOption,
  TextInput,
} from '@strapi/design-system';

import { componentLabel, type SchemaIndex } from '../utils/schema';

interface NewPageDialogProps {
  open: boolean;
  /** Content-type uids an entry can be created in — whatever the project mapped in `entryUrls`. */
  creatable: string[];
  schemas: SchemaIndex | null;
  busy: boolean;
  onCancel: () => void;
  onCreate: (uid: string, title: string) => void;
}

/**
 * Create a page without leaving the builder.
 *
 * Asks for the two things nobody can derive — which content-type, and what it is called — and
 * lets the schema supply the rest. A form that asked for every required field would be the
 * Content Manager's form, badly; the point of creating here is to get to the canvas quickly and
 * fill the page in visually.
 *
 * The content-type list comes from `entryUrls`, so this works for any content-type a project maps
 * and offers none that the builder could not then open.
 */
const NewPageDialog = ({
  open,
  creatable,
  schemas,
  busy,
  onCancel,
  onCreate,
}: NewPageDialogProps) => {
  const [uid, setUid] = useState(creatable[0] ?? '');
  const [title, setTitle] = useState('');

  const label = (value: string) =>
    schemas?.contentTypes[value]?.info?.displayName ?? value.split('.').pop() ?? value;

  void componentLabel;

  return (
    <Modal.Root open={open} onOpenChange={(next: boolean) => (next ? null : onCancel())}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>New page</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Field.Root name="uid" required>
              <Field.Label>Content type</Field.Label>
              <SingleSelect
                value={uid || creatable[0]}
                onChange={(next: string | number) => setUid(String(next))}
              >
                {creatable.map((value) => (
                  <SingleSelectOption key={value} value={value}>
                    {label(value)}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>

            {/*
              The hint text belongs on `Field.Root`, not inside `Field.Hint` — the design system's
              `Field.Hint` renders whatever the root was given and accepts no children of its own.
            */}
            <Field.Root
              name="title"
              required
              hint="The slug is generated from this. The page is created as a draft and opens in the canvas straight away — nothing is published until you publish it."
            >
              <Field.Label>Title</Field.Label>
              <TextInput
                name="title"
                value={title}
                placeholder="Beranda Promo"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
              />
              <Field.Hint />
            </Field.Root>
          </Flex>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="tertiary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!title.trim() || (!uid && !creatable[0])}
            onClick={() => onCreate(uid || creatable[0], title.trim())}
          >
            Create and open
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export { NewPageDialog };
