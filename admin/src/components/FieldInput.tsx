import {
  Field,
  NumberInput,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  TextInput,
  Toggle,
} from '@strapi/design-system';

import type { Attribute } from '../utils/schema';

interface FieldInputProps {
  name: string;
  label: string;
  attribute: Attribute;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}

/**
 * One input for one attribute.
 *
 * A small hand-written switch rather than the Content Manager's own field renderer, because
 * that renderer is bound to the Content Manager's form context — it reads and writes a form
 * state this page does not have, and mounting it outside that context is not a supported use.
 * The switch stays honest by covering only the scalar types (`EDITABLE_TYPES`); anything the
 * inspector cannot render truthfully is handed to the real form instead of approximated here.
 */
const FieldInput = ({ name, label, attribute, value, disabled, onChange }: FieldInputProps) => {
  const shared = { name, disabled };

  const input = () => {
    switch (attribute.type) {
      case 'text':
      case 'richtext':
        return (
          <Textarea
            {...shared}
            rows={attribute.type === 'richtext' ? 10 : 4}
            value={typeof value === 'string' ? value : ''}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
          />
        );

      case 'integer':
      case 'biginteger':
      case 'float':
      case 'decimal':
        return (
          <NumberInput
            {...shared}
            value={typeof value === 'number' ? value : undefined}
            onValueChange={(next?: number) => onChange(next ?? null)}
          />
        );

      case 'boolean':
        return (
          <Toggle
            {...shared}
            checked={value === true}
            onLabel="True"
            offLabel="False"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
          />
        );

      case 'enumeration':
        return (
          <SingleSelect
            {...shared}
            value={typeof value === 'string' ? value : undefined}
            onChange={(next: string | number) => onChange(String(next))}
          >
            {(attribute.enum ?? []).map((option) => (
              <SingleSelectOption key={option} value={option}>
                {option}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        );

      default:
        return (
          <TextInput
            {...shared}
            value={typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          />
        );
    }
  };

  return (
    <Field.Root name={name} required={attribute.required}>
      <Field.Label>{label}</Field.Label>
      {input()}
    </Field.Root>
  );
};

export { FieldInput };
