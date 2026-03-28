const groupUpsertProperties = {
  name: { type: 'string', minLength: 1, maxLength: 160 },
  description: { type: 'string', maxLength: 3000, nullable: true },
  groupInstruction: { type: 'string', maxLength: 12000, nullable: true }
};

export const createGroupSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['projectId', 'name'],
    properties: {
      projectId: { type: 'string', minLength: 1 },
      ...groupUpsertProperties
    }
  }
} as const;

export const updateGroupSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: groupUpsertProperties
  }
} as const;

export const groupIdParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const groupListQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      projectId: { type: 'string', minLength: 1 }
    }
  }
} as const;
