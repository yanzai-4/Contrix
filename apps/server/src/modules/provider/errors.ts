import type { FastifyReply } from 'fastify';

export class ProviderModuleError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ProviderModuleError';
  }
}

export function normalizeProviderError(error: unknown): ProviderModuleError {
  if (error instanceof ProviderModuleError) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return new ProviderModuleError('INTERNAL_ERROR', 500, (error as { message: string }).message);
  }

  return new ProviderModuleError('INTERNAL_ERROR', 500, 'Unexpected provider registry error');
}

export function sendProviderError(reply: FastifyReply, error: unknown) {
  const normalized = normalizeProviderError(error);

  return reply.code(normalized.statusCode).send({
    error: {
      code: normalized.code,
      message: normalized.message
    }
  });
}
