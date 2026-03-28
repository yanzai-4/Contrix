import type {
  InternalSchemaNode,
  SchemaNodeType,
  SchemaObjectNode,
  SchemaPrimitiveNode
} from '@contrix/spec-core';
import { createEmptyObjectSchemaNode } from '@contrix/spec-core';

export function createSchemaNodeForType(type: SchemaNodeType): InternalSchemaNode {
  if (type === 'object') {
    return createEmptyObjectSchemaNode();
  }

  if (type === 'array') {
    return {
      type: 'array',
      items: {
        type: 'string'
      }
    };
  }

  return {
    type
  };
}

export function cloneSchemaNode<T extends InternalSchemaNode | SchemaObjectNode>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function parseEnumInput(
  rawValue: string,
  nodeType: SchemaPrimitiveNode['type']
): Array<string | number> | undefined {
  const entries = rawValue
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (entries.length === 0) {
    return undefined;
  }

  if (nodeType === 'string') {
    return entries;
  }

  if (nodeType === 'number' || nodeType === 'integer') {
    const parsed = entries.map((item) => Number(item)).filter((item) => !Number.isNaN(item));

    if (nodeType === 'integer') {
      return parsed.filter((item) => Number.isInteger(item));
    }

    return parsed;
  }

  return undefined;
}

export function formatEnumValues(node: SchemaPrimitiveNode): string {
  if (!node.enumValues || node.enumValues.length === 0) {
    return '';
  }

  return node.enumValues.join(', ');
}

export function parseTypedExample(
  rawValue: string,
  nodeType: SchemaPrimitiveNode['type']
): unknown | undefined {
  if (!rawValue.trim()) {
    return undefined;
  }

  if (nodeType === 'string') {
    return rawValue;
  }

  if (nodeType === 'boolean') {
    if (rawValue.toLowerCase() === 'true') {
      return true;
    }

    if (rawValue.toLowerCase() === 'false') {
      return false;
    }

    return rawValue;
  }

  if (nodeType === 'number' || nodeType === 'integer') {
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) {
      return rawValue;
    }

    return nodeType === 'integer' ? Math.trunc(parsed) : parsed;
  }

  return rawValue;
}
