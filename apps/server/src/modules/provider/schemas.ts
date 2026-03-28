import { providerTypes } from '@contrix/spec-core';

const providerTypeEnum = [...providerTypes];

const providerUpsertProperties = {
  name: { type: 'string', minLength: 1, maxLength: 120 },
  type: { type: 'string', enum: providerTypeEnum },
  baseUrl: { type: 'string', minLength: 1, maxLength: 512, nullable: true },
  defaultModel: { type: 'string', minLength: 1, maxLength: 200 },
  supportsStructuredOutput: { type: 'boolean' },
  timeoutMs: { type: 'number', minimum: 1, maximum: 120000 },
  headers: {
    type: 'object',
    additionalProperties: {
      type: 'string'
    }
  },
  notes: { type: 'string', maxLength: 3000, nullable: true }
};

export const createProviderSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'type', 'apiKey', 'defaultModel'],
    properties: {
      ...providerUpsertProperties,
      apiKey: { type: 'string', minLength: 1, maxLength: 4096 }
    }
  }
} as const;

export const updateProviderSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'type', 'defaultModel'],
    properties: {
      ...providerUpsertProperties,
      apiKey: { type: 'string', minLength: 1, maxLength: 4096, nullable: true }
    }
  }
} as const;

export const providerIdParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 }
    }
  }
} as const;
