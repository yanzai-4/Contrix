export const promptEndpointIdParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['endpointId'],
    properties: {
      endpointId: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const promptStateParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const promptRenderBodySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      inputText: { type: 'string', nullable: true },
      inputJson: {}
    }
  }
} as const;
