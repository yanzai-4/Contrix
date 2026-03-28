export const runtimeRouteParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['namespace', 'pathSlug'],
    properties: {
      namespace: { type: 'string', minLength: 1, maxLength: 200 },
      pathSlug: { type: 'string', minLength: 1, maxLength: 300 }
    }
  }
} as const;

export const runtimeEndpointIdParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['endpointId'],
    properties: {
      endpointId: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const runtimeRequestBodySchema = {
  body: {
    type: 'object',
    additionalProperties: true,
    properties: {
      inputText: { type: 'string', nullable: true },
      inputJson: {},
      overrideModel: { type: 'string', nullable: true, maxLength: 200 }
    }
  }
} as const;
