import type { FastifyReply } from 'fastify';

export class ModuleError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ModuleError';
  }
}

export function normalizeModuleError(
  error: unknown,
  fallbackCode = 'INTERNAL_ERROR',
  fallbackMessage = 'Unexpected module error'
): ModuleError {
  if (error instanceof ModuleError) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return new ModuleError(fallbackCode, 500, (error as { message: string }).message);
  }

  return new ModuleError(fallbackCode, 500, fallbackMessage);
}

export function sendModuleError(
  reply: FastifyReply,
  error: unknown,
  fallbackCode = 'INTERNAL_ERROR',
  fallbackMessage = 'Unexpected module error'
) {
  const normalized = normalizeModuleError(error, fallbackCode, fallbackMessage);

  return reply.code(normalized.statusCode).send({
    error: {
      code: normalized.code,
      message: normalized.message
    }
  });
}
