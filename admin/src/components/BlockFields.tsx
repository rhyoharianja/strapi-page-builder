import { Box, Flex, Typography } from '@strapi/design-system';

import { isEditable, isTextual, type Attribute, type SchemaIndex } from '../utils/schema';
import { FieldInput } from './FieldInput';

interface BlockFieldsProps {
  schemas: SchemaIndex;
  attributes: Record<string, Attribute>;
  /** Dotted path of the thing these attributes belong to, e.g. `blocks.1`. */
  basePath: string;
  valueAt: (path: string) => unknown;
  onChange: (path: string, value: unknown, textual: boolean) => void;
  disabled?: boolean;
  depth?: number;
}

/**
 * One block's form, including the components nested inside it.
 *
 * A block is rarely flat. A hero holds a repeatable list of actions and another of stats; a
 * feature grid holds its cards. Rendering only the scalar fields would show the editor a hero
 * with a title and nothing else, and send them to the Content Manager for the half of the block
 * that actually varies.
 *
 * Recursive rather than two hand-written levels, because the shape is the schema's to decide and
 * Strapi will lift its nesting limit eventually. The depth guard is a stop against a component
 * that somehow references itself, not a modelling opinion.
 */
const BlockFields = ({
  schemas,
  attributes,
  basePath,
  valueAt,
  onChange,
  disabled,
  depth = 0,
}: BlockFieldsProps) => {
  if (depth > 4) return null;

  const entries = Object.entries(attributes);

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      {entries.map(([name, attribute]) => {
        const path = `${basePath}.${name}`;

        if (isEditable(attribute, name)) {
          return (
            <FieldInput
              key={path}
              name={path}
              label={name}
              attribute={attribute}
              value={valueAt(path)}
              disabled={disabled}
              onChange={(next) => onChange(path, next, isTextual(attribute))}
            />
          );
        }

        if (attribute.type !== 'component' || !attribute.component) return null;

        const nested = schemas.components[attribute.component];
        if (!nested) return null;

        const label = nested.info?.displayName ?? attribute.component.split('.').pop() ?? name;

        if (!attribute.repeatable) {
          return (
            <Nested key={path} title={name}>
              <BlockFields
                schemas={schemas}
                attributes={nested.attributes}
                basePath={path}
                valueAt={valueAt}
                onChange={onChange}
                disabled={disabled}
                depth={depth + 1}
              />
            </Nested>
          );
        }

        const items = Array.isArray(valueAt(path)) ? (valueAt(path) as unknown[]) : [];

        return (
          <Nested key={path} title={`${name} (${items.length})`}>
            <Flex direction="column" alignItems="stretch" gap={3}>
              {items.length === 0 ? (
                <Typography variant="pi" textColor="neutral600">
                  Empty — add items in the Content Manager.
                </Typography>
              ) : (
                items.map((_, index) => (
                  <Nested key={`${path}.${index}`} title={`${label} ${index + 1}`} subtle>
                    <BlockFields
                      schemas={schemas}
                      attributes={nested.attributes}
                      basePath={`${path}.${index}`}
                      valueAt={valueAt}
                      onChange={onChange}
                      disabled={disabled}
                      depth={depth + 1}
                    />
                  </Nested>
                ))
              )}
            </Flex>
          </Nested>
        );
      })}
    </Flex>
  );
};

/**
 * A labelled frame around a nested component.
 *
 * Plain nesting with no frame made a three-level form unreadable: with every input the same
 * width and weight, there was nothing to say which fields belonged to which action. The border
 * is the only thing carrying that structure, so it is not decoration.
 */
const Nested = ({
  title,
  subtle,
  children,
}: {
  title: string;
  subtle?: boolean;
  children: React.ReactNode;
}) => (
  <Box
    paddingLeft={3}
    style={{
      borderLeft: `2px solid var(--${subtle ? 'neutral200' : 'primary200'}, #dcdce4)`,
    }}
  >
    <Box paddingBottom={2}>
      <Typography variant="sigma" textColor="neutral600">
        {title}
      </Typography>
    </Box>
    {children}
  </Box>
);

export { BlockFields };
