import { inputModes } from '@contrix/spec-core';

const endpointUpsertProperties = {
  groupId: { type: 'string', minLength: 1, nullable: true },
  providerId: { type: 'string', minLength: 1 },
  name: { type: 'string', minLength: 1, maxLength: 180 },
  pathSlug: { type: 'string', minLength: 1, maxLength: 250 },
  model: { type: 'string', maxLength: 200, nullable: true },
  endpointInstruction: { type: 'string', maxLength: 16000, nullable: true },
  description: { type: 'string', maxLength: 4000, nullable: true },
  rules: { type: 'string', maxLength: 20000, nullable: true },
  examples: { type: 'string', maxLength: 20000, nullable: true },
  tone: { type: 'string', maxLength: 1200, nullable: true },
  fallback: { type: 'string', maxLength: 12000, nullable: true },
  validation: { type: 'string', maxLength: 12000, nullable: true },
  timeoutMs: { type: 'number', minimum: 1, maximum: 120000, nullable: true },
  enableStructuredOutput: { type: 'boolean' },
  enableDeterministicRepair: { type: 'boolean' },
  maxApiRetries: { type: 'integer', minimum: 0, maximum: 10 },
  maxRepairRounds: { type: 'integer', minimum: 0, maximum: 10 },
  temperature: { type: 'number', minimum: 0, maximum: 2, nullable: true },
  topP: { type: 'number', exclusiveMinimum: 0, maximum: 1, nullable: true }
};

export const createEndpointSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['projectId', 'providerId', 'name', 'pathSlug'],
    properties: {
      projectId: { type: 'string', minLength: 1 },
      ...endpointUpsertProperties
    }
  }
} as const;

export const updateEndpointSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['providerId', 'name', 'pathSlug'],
    properties: endpointUpsertProperties
  }
} as const;

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

export const endpointListQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      projectId: { type: 'string', minLength: 1 },
      groupId: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const saveEndpointSchemaSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['inputMode', 'outputSchema'],
    properties: {
      inputMode: { type: 'string', enum: [...inputModes] },
      inputSchema: {},
      outputSchema: {}
    }
  }
} as const;
