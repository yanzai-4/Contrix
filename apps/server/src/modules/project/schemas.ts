const projectUpsertProperties = {
  name: { type: 'string', minLength: 1, maxLength: 160 },
  description: { type: 'string', maxLength: 3000, nullable: true },
  baseInstruction: { type: 'string', maxLength: 12000, nullable: true },
  defaultProviderId: { type: 'string', minLength: 1, maxLength: 100, nullable: true },
  apiNamespace: { type: 'string', minLength: 1, maxLength: 200 }
};

export const createProjectSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'apiNamespace'],
    properties: projectUpsertProperties
  }
} as const;

export const updateProjectSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'apiNamespace'],
    properties: projectUpsertProperties
  }
} as const;

export const projectIdParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 }
    }
  }
} as const;
