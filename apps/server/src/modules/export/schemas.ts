export const exportProjectParamsSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['projectId'],
    properties: {
      projectId: { type: 'string', minLength: 1 }
    }
  }
} as const;

export const exportProjectBodySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      exportType: {
        type: 'string',
        enum: ['runtime-config-pack', 'standalone-runtime-bundle', 'embeddable-runtime-package']
      },
      outputDir: { type: 'string', minLength: 1, nullable: true },
      includeExamples: { type: 'boolean', nullable: true },
      includeDocs: { type: 'boolean', nullable: true },
      includeStandaloneRuntime: { type: 'boolean', nullable: true },
      includeEmbeddableRuntime: { type: 'boolean', nullable: true }
    }
  }
} as const;
