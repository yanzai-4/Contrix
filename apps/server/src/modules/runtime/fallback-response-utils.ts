import type { RuntimeErrorStage, RuntimeErrorType, ValidationIssue } from '@contrix/runtime-core';

interface FallbackMessageBundleInput {
  errorType: RuntimeErrorType;
  errorStage: RuntimeErrorStage;
  message: string;
  validationIssues: ValidationIssue[];
}

export interface FallbackMessageBundle {
  reason: string;
  errorType: string;
  errorStage: string;
  detail: string;
}

export function formatLocalTimestamp(input: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())} ${pad(input.getHours())}:${pad(input.getMinutes())}:${pad(input.getSeconds())}`;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function fieldNameFromIssuePath(path: string | null | undefined): string | null {
  const normalized = (path ?? '').trim();
  if (!normalized || normalized === '/') {
    return null;
  }

  const segments = normalized
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeJsonPointerSegment(segment));

  if (!segments.length) {
    return null;
  }

  const last = segments[segments.length - 1] ?? '';
  if (/^\d+$/.test(last)) {
    const parent = segments[segments.length - 2];
    return parent ? parent : 'item';
  }

  return last || null;
}

function describeExpectedType(expected: unknown): string {
  if (expected === 'string') {
    return 'a string';
  }
  if (expected === 'number') {
    return 'a number';
  }
  if (expected === 'integer') {
    return 'an integer';
  }
  if (expected === 'boolean') {
    return 'a boolean';
  }
  if (expected === 'array') {
    return 'an array';
  }
  if (expected === 'object') {
    return 'an object';
  }
  if (typeof expected === 'string' && expected.trim()) {
    return expected.trim();
  }

  return 'a valid value';
}

function withPeriod(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function looksInternalPath(text: string): boolean {
  return /\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+/.test(text);
}

function humanizeValidationIssue(issue: ValidationIssue): string | null {
  const fieldName = fieldNameFromIssuePath(issue.path);

  if (issue.keyword === 'required') {
    const missingField = typeof issue.expected === 'string' && issue.expected.trim() ? issue.expected.trim() : fieldName;
    if (missingField) {
      return `The '${missingField}' field is required.`;
    }
    return 'A required field is missing.';
  }

  if (issue.keyword === 'type') {
    if (fieldName) {
      return `The '${fieldName}' field must be ${describeExpectedType(issue.expected)}.`;
    }
    return `The output must be ${describeExpectedType(issue.expected)}.`;
  }

  if (issue.keyword === 'additionalProperties') {
    const invalidField = typeof issue.expected === 'string' && issue.expected.trim() ? issue.expected.trim() : null;
    if (invalidField) {
      return `The '${invalidField}' field is not allowed.`;
    }
    return 'The output includes unsupported fields.';
  }

  if (fieldName && issue.message) {
    return withPeriod(`The '${fieldName}' field ${issue.message}`);
  }

  if (issue.message) {
    return withPeriod(issue.message);
  }

  return null;
}

function mapFallbackPrimaryReason(
  errorType: RuntimeErrorType,
  errorStage: RuntimeErrorStage,
  message: string
): string {
  if (
    errorType === 'OUTPUT_VALIDATION_FAILED' ||
    errorType === 'DETERMINISTIC_REPAIR_FAILED' ||
    errorType === 'REPAIR_RETRY_FAILED' ||
    errorType === 'MAX_ATTEMPTS_EXCEEDED'
  ) {
    return 'Output validation failed.';
  }

  if (errorType === 'RUNTIME_TIMEOUT' || errorType === 'PROVIDER_TIMEOUT') {
    return 'Request timed out.';
  }

  if (
    errorType === 'RUNTIME_PROVIDER_ERROR' ||
    errorType === 'PROVIDER_REQUEST_FAILED' ||
    errorStage === 'provider_request'
  ) {
    return 'Provider request failed.';
  }

  if (errorType === 'VALIDATION_ERROR' || errorType === 'INPUT_MODE_MISMATCH') {
    return 'Input validation failed.';
  }

  if (errorType === 'RUNTIME_NOT_READY') {
    return 'Runtime is not ready.';
  }

  return withPeriod(message.trim()) || 'Runtime execution failed.';
}

export function buildFallbackMessageBundle(input: FallbackMessageBundleInput): FallbackMessageBundle {
  const reason = mapFallbackPrimaryReason(input.errorType, input.errorStage, input.message);
  const humanizedValidation = input.validationIssues.map((issue) => humanizeValidationIssue(issue)).find(Boolean) ?? null;

  let detail = humanizedValidation;
  if (!detail) {
    const normalizedMessage = withPeriod(input.message.trim());
    detail = normalizedMessage && !looksInternalPath(normalizedMessage)
      ? normalizedMessage
      : 'The response did not match the expected output contract.';
  }

  return {
    reason: withPeriod(reason),
    errorType: input.errorType,
    errorStage: input.errorStage,
    detail
  };
}

export function buildFallbackTextPayload(input: {
  timestamp: string;
  path: string;
  reason: string;
  detail: string;
}): string {
  const lines = [
    `[Contrix] [${input.timestamp}]`,
    `Reason: ${input.reason}`,
    `Detail: ${input.detail}`,
    `Path  : ${input.path}`
  ];

  const [header, ...rest] = lines;
  return [header, ...rest.map((line) => `\t${line}`)].join('\n');
}
