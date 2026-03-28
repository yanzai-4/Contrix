export const endpointIdParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const specVersionParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'version'],
    properties: {
      id: { type: 'string', minLength: 1 },
      version: { type: 'string', pattern: '^[0-9]+$' }
    }
  }
} as const;

export const specDiffQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['from', 'to'],
    properties: {
      from: { type: 'string', pattern: '^[0-9]+$' },
      to: { type: 'string', pattern: '^[0-9]+$' }
    }
  }
} as const;

export const specExportQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      version: { type: 'string', pattern: '^[0-9]+$' }
    }
  }
} as const;
