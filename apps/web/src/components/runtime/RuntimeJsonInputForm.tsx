import { useEffect, useMemo, useState } from 'react';
import type { JsonSchemaObject } from '@contrix/spec-core';

interface RuntimeJsonInputFormProps {
  schema: JsonSchemaObject;
  valueText: string;
  onChangeValueText: (next: string) => void;
}

type SchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';

function resolveSchemaType(schema: JsonSchemaObject): SchemaType {
  const raw = schema.type;

  if (Array.isArray(raw)) {
    const candidate = raw.find((item) => item !== 'null');
    if (candidate === 'object' || candidate === 'array' || candidate === 'string' || candidate === 'number' || candidate === 'integer' || candidate === 'boolean') {
      return candidate;
    }
  }

  if (raw === 'object' || raw === 'array' || raw === 'string' || raw === 'number' || raw === 'integer' || raw === 'boolean') {
    return raw;
  }

  return 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRootDraft(valueText: string): Record<string, unknown> {
  if (!valueText.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(valueText) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function setNestedValue(root: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const head = path[0];
  if (!head) {
    return root;
  }

  const rest = path.slice(1);
  const next = { ...root };

  if (rest.length === 0) {
    next[head] = value;
    return next;
  }

  const child = isRecord(next[head]) ? (next[head] as Record<string, unknown>) : {};
  next[head] = setNestedValue(child, rest, value);
  return next;
}

function buildPayloadFromSchema(schema: JsonSchemaObject, value: unknown, required: boolean): unknown {
  const schemaType = resolveSchemaType(schema);

  if (schemaType === 'object') {
    const properties = isRecord(schema.properties) ? (schema.properties as Record<string, JsonSchemaObject>) : {};
    const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
    const source = isRecord(value) ? value : {};
    const target: Record<string, unknown> = {};

    for (const [key, childSchema] of Object.entries(properties)) {
      const childValue = buildPayloadFromSchema(childSchema, source[key], requiredSet.has(key));
      if (childValue !== undefined) {
        target[key] = childValue;
      }
    }

    if (Object.keys(target).length === 0 && !required) {
      return undefined;
    }

    return target;
  }

  if (schemaType === 'array') {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }

    return required ? [] : undefined;
  }

  if (schemaType === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return undefined;
  }

  if (schemaType === 'number' || schemaType === 'integer') {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return undefined;
    }

    return schemaType === 'integer' ? Math.trunc(numeric) : numeric;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.includes(value as never) ? value : undefined;
  }

  if (typeof value === 'string') {
    if (!value.trim() && !required) {
      return undefined;
    }

    return value;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  return String(value);
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function toArrayText(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === 'string') {
    return value;
  }

  return '[]';
}

function RuntimeJsonFieldEditor(props: {
  schema: JsonSchemaObject;
  path: string[];
  value: unknown;
  required: boolean;
  onChangeValue: (path: string[], value: unknown) => void;
}) {
  const { schema, path, value, required, onChangeValue } = props;
  const schemaType = resolveSchemaType(schema);
  const pathLabel = path.join('.');

  if (schemaType === 'object') {
    const properties = isRecord(schema.properties) ? (schema.properties as Record<string, JsonSchemaObject>) : {};
    const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
    const objectValue = isRecord(value) ? value : {};

    return (
      <section className="schema-field-card">
        <div className="schema-row">
          <p className="meta-line">
            <strong>{pathLabel}</strong> <code>object</code>
          </p>
          <p className="meta-line">{required ? 'required' : 'optional'}</p>
        </div>
        {schema.description ? <p className="meta-line">{schema.description}</p> : null}
        <div className="schema-children">
          {Object.entries(properties).map(([key, childSchema]) => (
            <RuntimeJsonFieldEditor
              key={`${pathLabel}.${key}`}
              schema={childSchema}
              path={[...path, key]}
              value={objectValue[key]}
              required={requiredSet.has(key)}
              onChangeValue={onChangeValue}
            />
          ))}
        </div>
      </section>
    );
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const selectedIndex = schema.enum.findIndex((item) => item === value);

    return (
      <label className="schema-field-card">
        <span className="meta-line">
          <strong>{pathLabel}</strong> <code>{schemaType}</code> {required ? '(required)' : '(optional)'}
        </span>
        {schema.description ? <span className="meta-line">{schema.description}</span> : null}
        <select
          value={selectedIndex >= 0 ? String(selectedIndex) : ''}
          onChange={(event) => {
            const index = event.target.value === '' ? -1 : Number(event.target.value);
            onChangeValue(path, index >= 0 ? schema.enum?.[index] : undefined);
          }}
        >
          <option value="">{required ? 'Select a value' : 'Unset (optional)'}</option>
          {schema.enum.map((item, index) => (
            <option key={`${pathLabel}-${index}`} value={String(index)}>
              {JSON.stringify(item)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (schemaType === 'boolean') {
    return (
      <label className="schema-field-card">
        <span className="meta-line">
          <strong>{pathLabel}</strong> <code>boolean</code> {required ? '(required)' : '(optional)'}
        </span>
        {schema.description ? <span className="meta-line">{schema.description}</span> : null}
        <select
          value={typeof value === 'boolean' ? String(value) : ''}
          onChange={(event) => {
            if (event.target.value === 'true') {
              onChangeValue(path, true);
              return;
            }

            if (event.target.value === 'false') {
              onChangeValue(path, false);
              return;
            }

            onChangeValue(path, undefined);
          }}
        >
          <option value="">{required ? 'Select true/false' : 'Unset (optional)'}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }

  if (schemaType === 'number' || schemaType === 'integer') {
    return (
      <label className="schema-field-card">
        <span className="meta-line">
          <strong>{pathLabel}</strong> <code>{schemaType}</code> {required ? '(required)' : '(optional)'}
        </span>
        {schema.description ? <span className="meta-line">{schema.description}</span> : null}
        <input
          type="number"
          step={schemaType === 'integer' ? 1 : 'any'}
          value={toStringValue(value)}
          onChange={(event) => onChangeValue(path, event.target.value)}
          placeholder={required ? 'Enter a number' : 'Optional'}
        />
      </label>
    );
  }

  if (schemaType === 'array') {
    return (
      <label className="schema-field-card">
        <span className="meta-line">
          <strong>{pathLabel}</strong> <code>array</code> {required ? '(required)' : '(optional)'}
        </span>
        {schema.description ? <span className="meta-line">{schema.description}</span> : null}
        <textarea
          className="json-editor"
          rows={6}
          value={toArrayText(value)}
          onChange={(event) => onChangeValue(path, event.target.value)}
          placeholder="Enter a JSON array"
        />
      </label>
    );
  }

  return (
    <label className="schema-field-card">
      <span className="meta-line">
        <strong>{pathLabel}</strong> <code>string</code> {required ? '(required)' : '(optional)'}
      </span>
      {schema.description ? <span className="meta-line">{schema.description}</span> : null}
      <input
        value={toStringValue(value)}
        onChange={(event) => onChangeValue(path, event.target.value)}
        placeholder={required ? 'Enter a value' : 'Optional'}
      />
    </label>
  );
}

export function RuntimeJsonInputForm({ schema, valueText, onChangeValueText }: RuntimeJsonInputFormProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => normalizeRootDraft(valueText));

  useEffect(() => {
    setDraft(normalizeRootDraft(valueText));
  }, [valueText]);

  const rootType = useMemo(() => resolveSchemaType(schema), [schema]);

  const updateValue = (path: string[], nextValue: unknown) => {
    setDraft((current) => {
      const nextDraft = setNestedValue(current, path, nextValue);
      const payload = buildPayloadFromSchema(schema, nextDraft, true);
      const output = isRecord(payload) ? payload : {};
      onChangeValueText(JSON.stringify(output, null, 2));
      return nextDraft;
    });
  };

  if (rootType !== 'object') {
    return (
      <section className="schema-field-card">
        <p className="meta-line">Input schema root is not an object. Use raw JSON input.</p>
        <textarea className="json-editor" rows={12} value={valueText} onChange={(event) => onChangeValueText(event.target.value)} />
      </section>
    );
  }

  const properties = isRecord(schema.properties) ? (schema.properties as Record<string, JsonSchemaObject>) : {};
  const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);

  return (
    <section className="schema-grid">
      {Object.entries(properties).map(([key, fieldSchema]) => (
        <RuntimeJsonFieldEditor
          key={key}
          schema={fieldSchema}
          path={[key]}
          value={draft[key]}
          required={requiredSet.has(key)}
          onChangeValue={updateValue}
        />
      ))}
    </section>
  );
}
