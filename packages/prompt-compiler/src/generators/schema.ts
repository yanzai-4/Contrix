import { toStablePrettyJson } from '../utils/format.js';

export function generateSchemaBlock(params: {
  inputSchema: unknown;
  outputSchema: unknown;
  inputMode: 'json' | 'text';
}): string {
  const inputFormat = toStablePrettyJson(
    params.inputMode === 'json' ? toPromptFormatSchema(params.inputSchema) : { type: 'string' }
  );
  const outputFormat = toStablePrettyJson(toPromptFormatSchema(params.outputSchema));

  return ['INPUT FORMAT:', inputFormat, '', 'OUTPUT FORMAT:', outputFormat].join('\n');
}

function toPromptFormatSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { type: 'object', additionalProperties: false };
  }

  const schema = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  if ('type' in schema) {
    next.type = schema.type;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    next.enum = [...schema.enum];
  }

  if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'))) {
    const sourceProperties =
      schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, unknown>)
        : {};
    const properties: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(sourceProperties)) {
      properties[key] = toPromptFormatSchema(child);
    }

    next.properties = properties;

    if (Array.isArray(schema.required) && schema.required.length > 0) {
      next.required = [...schema.required];
    }

    if (typeof schema.additionalProperties === 'boolean') {
      next.additionalProperties = schema.additionalProperties;
    }
  }

  if (schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))) {
    next.items = toPromptFormatSchema(schema.items);
  }

  return next;
}
