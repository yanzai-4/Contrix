import type {
  RetryAttemptMeta,
  RuntimeErrorStage,
  RuntimeErrorType,
  RuntimeFailureResponse,
  RuntimeProviderType,
  ValidationIssue
} from '@contrix/runtime-core';

interface RuntimeErrorOptions {
  statusCode?: number;
  attemptCount?: number;
  retryable?: boolean;
  responseStatus?: number | null;
}

export class RuntimeModuleError extends Error {
  public readonly statusCode: number;

  public readonly attemptCount: number;

  public readonly retryable: boolean;

  public readonly responseStatus: number | null;

  constructor(
    public readonly type: RuntimeErrorType,
    public readonly stage: RuntimeErrorStage,
    message: string,
    options: RuntimeErrorOptions = {}
  ) {
    super(message);
    this.name = 'RuntimeModuleError';
    this.statusCode = options.statusCode ?? 500;
    this.attemptCount = options.attemptCount ?? 0;
    this.retryable = options.retryable ?? false;
    this.responseStatus = options.responseStatus ?? null;
  }

  withAttemptCount(attemptCount: number): RuntimeModuleError {
    return new RuntimeModuleError(this.type, this.stage, this.message, {
      statusCode: this.statusCode,
      retryable: this.retryable,
      responseStatus: this.responseStatus,
      attemptCount
    });
  }
}

export function normalizeRuntimeError(
  error: unknown,
  fallback: {
    type?: RuntimeErrorType;
    stage?: RuntimeErrorStage;
    message?: string;
    statusCode?: number;
  } = {}
): RuntimeModuleError {
  if (error instanceof RuntimeModuleError) {
    return error;
  }

  if (error instanceof Error) {
    return new RuntimeModuleError(
      fallback.type ?? 'RUNTIME_INTERNAL_ERROR',
      fallback.stage ?? 'runtime',
      error.message,
      {
        statusCode: fallback.statusCode ?? 500
      }
    );
  }

  return new RuntimeModuleError(
    fallback.type ?? 'RUNTIME_INTERNAL_ERROR',
    fallback.stage ?? 'runtime',
    fallback.message ?? 'Unexpected runtime execution error.',
    {
      statusCode: fallback.statusCode ?? 500
    }
  );
}

export function toRuntimeFailureResponse(
  error: RuntimeModuleError,
  attempts: RetryAttemptMeta[] = [],
  runId = '',
  requestId = '',
  context?: {
    endpointId?: string | null;
    providerType?: RuntimeProviderType | null;
    model?: string | null;
    specVersion?: number | null;
    promptHash?: string | null;
    lastRawOutput?: string | null;
    lastValidationIssues?: ValidationIssue[];
  }
): RuntimeFailureResponse {
  const attemptCount = error.attemptCount || attempts.length;
  const lastRawOutput = context?.lastRawOutput ?? null;
  const lastValidationIssues = context?.lastValidationIssues ?? [];
  const timestamp = new Date().toISOString();

  return {
    success: false,
    runId,
    requestId,
    error: {
      type: error.type,
      stage: error.stage,
      message: error.message,
      attemptCount,
      endpointId: context?.endpointId ?? null,
      providerType: context?.providerType ?? null,
      model: context?.model ?? null,
      specVersion: context?.specVersion ?? null,
      promptHash: context?.promptHash ?? null,
      lastRawOutput,
      lastValidationIssues,
      requestId,
      runId,
      timestamp
    },
    attemptCount,
    attempts,
    lastRawOutput,
    lastValidationIssues
  };
}
