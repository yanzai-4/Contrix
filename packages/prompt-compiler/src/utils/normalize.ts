import type { PromptCompilerExample, PromptCompilerValidationPolicy } from '../types/compiler.js';
import { normalizeText } from './format.js';

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeConstraints(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter((item): item is string => Boolean(item));
  }

  const textValue = normalizeText(value ?? undefined);
  if (!textValue) {
    return [];
  }

  const parsed = tryParseJson(textValue);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => (typeof item === 'string' ? normalizeText(item) : normalizeText(String(item))))
      .filter((item): item is string => Boolean(item));
  }

  return textValue
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter((line): line is string => Boolean(line));
}

function normalizeExample(value: unknown): PromptCompilerExample | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (!('input' in row) || !('output' in row)) {
    return null;
  }

  return {
    input: row.input,
    output: row.output
  };
}

export function normalizeExamples(value: PromptCompilerExample[] | string | null | undefined): PromptCompilerExample[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeExample(item))
      .filter((item): item is PromptCompilerExample => Boolean(item));
  }

  const textValue = normalizeText(value ?? undefined);
  if (!textValue) {
    return [];
  }

  const parsed = tryParseJson(textValue);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => normalizeExample(item))
    .filter((item): item is PromptCompilerExample => Boolean(item));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();

    if (lower === 'true') {
      return true;
    }

    if (lower === 'false') {
      return false;
    }
  }

  return fallback;
}

function readPolicyObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

export function normalizeValidationPolicy(
  value: PromptCompilerValidationPolicy | string | null | undefined
): Required<PromptCompilerValidationPolicy> {
  const policy = readPolicyObject(value);

  const strictSchema = normalizeBoolean(policy?.strictSchema, true);
  const allowCoercion = normalizeBoolean(policy?.allowCoercion, false);
  const deterministicRepair = normalizeBoolean(policy?.deterministicRepair, false);

  return {
    strictSchema,
    allowCoercion,
    deterministicRepair
  };
}

