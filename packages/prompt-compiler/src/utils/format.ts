import { stableStringify } from '@contrix/spec-core';

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function toStablePrettyJson(value: unknown): string {
  if (value === undefined) {
    return '{}';
  }

  const stable = stableStringify(value);
  const parsed = tryParseJson(stable);

  if (parsed === null && stable !== 'null') {
    return String(value);
  }

  return JSON.stringify(parsed, null, 2);
}

export function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function normalizePromptForHash(value: string): string {
  return normalizeLineEndings(value)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function toDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return toStablePrettyJson(value);
}

