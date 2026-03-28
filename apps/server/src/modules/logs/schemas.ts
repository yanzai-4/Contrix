export const callLogIdParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const callLogListQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      project: { type: 'string', minLength: 1 },
      endpoint: { type: 'string', minLength: 1 },
      provider: { type: 'string', minLength: 1 },
      success: {
        anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['true', 'false'] }]
      },
      dateFrom: { type: 'string', minLength: 1 },
      dateTo: { type: 'string', minLength: 1 },
      page: {
        anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', pattern: '^[0-9]+$' }]
      },
      pageSize: {
        anyOf: [{ type: 'integer', minimum: 1, maximum: 100 }, { type: 'string', pattern: '^[0-9]+$' }]
      }
    }
  }
} as const;

export const callLogCleanupBodySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['window'],
    properties: {
      window: {
        type: 'string',
        enum: ['7d', '1m', '3m', 'all']
      },
      dryRun: { type: 'boolean' }
    }
  }
} as const;
