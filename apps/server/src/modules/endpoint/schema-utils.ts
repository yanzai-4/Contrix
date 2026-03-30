import type {
  InputMode,
  InternalSchemaNode,
  SchemaArrayNode,
  SchemaEnumValue,
  SchemaFieldDefinition,
  SchemaNodeBase,
  SchemaObjectNode,
  SchemaPrimitiveNode,
  TextInputDescriptor
} from '@contrix/spec-core';
import { createEmptyObjectSchemaNode, inputModes, schemaNodeTypes } from '@contrix/spec-core';
import { ModuleError } from '../common/errors.js';

const ALLOWED_INPUT_MODES = new Set<string>(inputModes);
const ALLOWED_NODE_TYPES = new Set<string>(schemaNodeTypes);

interface SchemaNormalizationOptions {
  defaultFieldRequired?: boolean;
  disallowNullableAndDefault?: boolean;
}

function ensureObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function normalizeOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path} must be a boolean.`);
  }

  return value;
}

function normalizeCommonNodeFields(
  value: Record<string, unknown>,
  path: string,
  options: SchemaNormalizationOptions = {}
): SchemaNodeBase {
  const description = normalizeOptionalString(value.description, `${path}.description`);
  const constraints = normalizeOptionalString(value.constraints, `${path}.constraints`);
  const nullable = options.disallowNullableAndDefault
    ? undefined
    : normalizeOptionalBoolean(value.nullable, `${path}.nullable`);

  const common: SchemaNodeBase = {};

  if (description !== undefined) {
    common.description = description;
  }

  if (constraints !== undefined) {
    common.constraints = constraints;
  }

  if (nullable !== undefined) {
    common.nullable = nullable;
  }

  if ('example' in value) {
    common.example = value.example;
  }

  if (!options.disallowNullableAndDefault) {
    if ('default' in value) {
      common.default = value.default;
    }

    if ('defaultValue' in value && !('default' in value)) {
      common.default = value.defaultValue;
    }
  }

  return common;
}

function normalizeEnumValues(
  enumValuesValue: unknown,
  nodeType: SchemaPrimitiveNode['type'],
  path: string
): SchemaEnumValue[] | undefined {
  if (enumValuesValue === undefined || enumValuesValue === null) {
    return undefined;
  }

  if (!Array.isArray(enumValuesValue)) {
    throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path} must be an array.`);
  }

  if (enumValuesValue.length === 0) {
    return undefined;
  }

  if (nodeType === 'boolean') {
    throw new ModuleError(
      'INVALID_SCHEMA_STRUCTURE',
      400,
      `${path} is only supported for string/number/integer field types.`
    );
  }

  const normalized = enumValuesValue.map((item, index) => {
    if (nodeType === 'string') {
      if (typeof item !== 'string') {
        throw new ModuleError(
          'INVALID_SCHEMA_STRUCTURE',
          400,
          `${path}[${index}] must be a string for string enum fields.`
        );
      }

      return item;
    }

    if (typeof item !== 'number' || Number.isNaN(item)) {
      throw new ModuleError(
        'INVALID_SCHEMA_STRUCTURE',
        400,
        `${path}[${index}] must be a number for numeric enum fields.`
      );
    }

    if (nodeType === 'integer' && !Number.isInteger(item)) {
      throw new ModuleError(
        'INVALID_SCHEMA_STRUCTURE',
        400,
        `${path}[${index}] must be an integer for integer enum fields.`
      );
    }

    return item;
  });

  return normalized;
}

function normalizeSchemaField(
  value: unknown,
  path: string,
  options: SchemaNormalizationOptions = {}
): SchemaFieldDefinition {
  const objectValue = ensureObject(value, path);
  const key = normalizeOptionalString(objectValue.key, `${path}.key`);

  if (!key) {
    throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path}.key is required.`);
  }

  const requiredValue = objectValue.required;
  const required =
    requiredValue === undefined || requiredValue === null
      ? Boolean(options.defaultFieldRequired)
      : normalizeOptionalBoolean(requiredValue, `${path}.required`);

  if (required === undefined) {
    throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path}.required must be boolean.`);
  }

  if (objectValue.node === undefined) {
    throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path}.node is required.`);
  }

  return {
    key,
    required,
    node: normalizeInternalSchemaNode(objectValue.node, `${path}.node`, options)
  };
}

export function normalizeInternalSchemaNode(
  value: unknown,
  path = 'schema',
  options: SchemaNormalizationOptions = {}
): InternalSchemaNode {
  const objectValue = ensureObject(value, path);
  const typeValue = objectValue.type;

  if (typeof typeValue !== 'string' || !ALLOWED_NODE_TYPES.has(typeValue)) {
    throw new ModuleError(
      'INVALID_SCHEMA_STRUCTURE',
      400,
      `${path}.type must be one of: ${schemaNodeTypes.join(', ')}.`
    );
  }

  const common = normalizeCommonNodeFields(objectValue, path, options);

  if (typeValue === 'object') {
    if (!Array.isArray(objectValue.properties)) {
      throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path}.properties must be an array.`);
    }

    const properties = objectValue.properties.map((property, index) =>
      normalizeSchemaField(property, `${path}.properties[${index}]`, options)
    );
    const allowAdditionalProperties = normalizeOptionalBoolean(
      objectValue.allowAdditionalProperties,
      `${path}.allowAdditionalProperties`
    );
    const keys = new Set<string>();

    for (const field of properties) {
      const lowerKey = field.key.toLowerCase();
      if (keys.has(lowerKey)) {
        throw new ModuleError(
          'INVALID_SCHEMA_STRUCTURE',
          400,
          `${path}.properties contains duplicate key "${field.key}".`
        );
      }

      keys.add(lowerKey);
    }

    const node: SchemaObjectNode = {
      type: 'object',
      properties,
      allowAdditionalProperties
    };

    return node;
  }

  if (typeValue === 'array') {
    if (objectValue.items === undefined) {
      throw new ModuleError('INVALID_SCHEMA_STRUCTURE', 400, `${path}.items is required for array type.`);
    }

    const node: SchemaArrayNode = {
      type: 'array',
      items: normalizeInternalSchemaNode(objectValue.items, `${path}.items`, options),
      ...common
    };

    return node;
  }

  const primitiveType = typeValue as SchemaPrimitiveNode['type'];
  const enumValues = normalizeEnumValues(objectValue.enumValues, primitiveType, `${path}.enumValues`);

  const primitiveNode: SchemaPrimitiveNode = {
    type: primitiveType,
    ...common
  };

  if (enumValues && enumValues.length > 0) {
    primitiveNode.enumValues = enumValues;
  }

  return primitiveNode;
}

export function normalizeTextInputDescriptor(value: unknown): TextInputDescriptor | null {
  if (value === undefined || value === null) {
    return null;
  }

  const objectValue = ensureObject(value, 'inputSchema');
  const description = normalizeOptionalString(objectValue.description, 'inputSchema.description');
  const inputGuidance = normalizeOptionalString(objectValue.inputGuidance, 'inputSchema.inputGuidance');
  const example = normalizeOptionalString(objectValue.example, 'inputSchema.example');

  if (!description && !inputGuidance && !example) {
    return null;
  }

  const descriptor: TextInputDescriptor = {};

  if (description) {
    descriptor.description = description;
  }

  if (inputGuidance) {
    descriptor.inputGuidance = inputGuidance;
  }

  if (example) {
    descriptor.example = example;
  }

  return descriptor;
}

export function normalizeInputMode(value: unknown): InputMode {
  if (typeof value !== 'string' || !ALLOWED_INPUT_MODES.has(value)) {
    throw new ModuleError('INVALID_INPUT_MODE', 400, `inputMode must be one of: ${inputModes.join(', ')}.`);
  }

  return value as InputMode;
}

export function normalizeOutputSchema(value: unknown): SchemaObjectNode {
  const node = normalizeInternalSchemaNode(value, 'outputSchema', {
    defaultFieldRequired: true,
    disallowNullableAndDefault: true
  });

  if (node.type !== 'object') {
    throw new ModuleError('INVALID_OUTPUT_SCHEMA', 400, 'outputSchema root type must be object.');
  }

  return {
    ...node,
    allowAdditionalProperties: true
  };
}

export function normalizeInputSchemaForMode(
  inputMode: InputMode,
  inputSchema: unknown
): SchemaObjectNode | TextInputDescriptor | null {
  if (inputMode === 'text') {
    return normalizeTextInputDescriptor(inputSchema);
  }

  if (inputSchema === undefined || inputSchema === null) {
    throw new ModuleError('INVALID_INPUT_SCHEMA', 400, 'inputSchema is required when inputMode is json.');
  }

  const node = normalizeInternalSchemaNode(inputSchema, 'inputSchema');

  if (node.type !== 'object') {
    throw new ModuleError('INVALID_INPUT_SCHEMA', 400, 'inputSchema root type must be object for json mode.');
  }

  return node;
}

export function parseStoredInputSchema(
  inputMode: InputMode,
  rawInputSchema: string | null
): SchemaObjectNode | TextInputDescriptor | null {
  if (!rawInputSchema) {
    return inputMode === 'json' ? createEmptyObjectSchemaNode() : null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawInputSchema);
  } catch {
    throw new ModuleError('INVALID_STORED_SCHEMA', 500, 'Stored input schema is not valid JSON.');
  }

  return normalizeInputSchemaForMode(inputMode, parsed);
}

export function parseStoredOutputSchema(rawOutputSchema: string | null): SchemaObjectNode {
  if (!rawOutputSchema) {
    return createEmptyObjectSchemaNode();
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawOutputSchema);
  } catch {
    throw new ModuleError('INVALID_STORED_SCHEMA', 500, 'Stored output schema is not valid JSON.');
  }

  return normalizeOutputSchema(parsed);
}
