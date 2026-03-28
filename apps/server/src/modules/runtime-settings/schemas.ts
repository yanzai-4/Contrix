export const runtimeSettingsUpdateBodySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      port: { type: 'integer', minimum: 1, maximum: 65535 },
      routePrefix: { type: 'string', minLength: 1, maxLength: 200 },
      logLevel: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
      enableDebugTrace: { type: 'boolean' }
    }
  }
} as const;
