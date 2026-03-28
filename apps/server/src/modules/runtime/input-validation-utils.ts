import type { ErrorObject } from 'ajv';
import type { RuntimeInputMode, RuntimeRequest } from '@contrix/runtime-core';
import type { JsonSchemaObject } from '@contrix/spec-core';
import { RuntimeModuleError } from './errors.js';

export function includesObjectType(typeValue: JsonSchemaObject['type']): boolean {
  if (typeValue === 'object') {
    return true;
  }

  if (Array.isArray(typeValue)) {
    return typeValue.includes('object');
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isRecordObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
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

function schemaDeclaresProperty(schema: JsonSchemaObject | null, key: string): boolean {
  if (!schema || !includesObjectType(schema.type) || !schema.properties) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(schema.properties, key);
}

export function resolveJsonModePayload(
  request: RuntimeRequest,
  inputSchemaJson: JsonSchemaObject | null
): Record<string, unknown> | null {
  const schemaUsesInputJsonField = schemaDeclaresProperty(inputSchemaJson, 'inputJson');
  const requestKeys = Object.keys(request);
  const looksLikeLegacyWrapper =
    requestKeys.length > 0 &&
    requestKeys.every((key) => key === 'inputJson' || key === 'overrideModel');

  if (isRecord(request.inputJson) && !schemaUsesInputJsonField && looksLikeLegacyWrapper) {
    return request.inputJson;
  }

  if (request.inputJson !== undefined && request.inputJson !== null && !schemaUsesInputJsonField) {
    return null;
  }

  if (!isRecord(request)) {
    return null;
  }

  const directPayload: Record<string, unknown> = { ...request };
  delete directPayload.inputJson;

  if (!schemaDeclaresProperty(inputSchemaJson, 'overrideModel')) {
    delete directPayload.overrideModel;
  }

  if (!schemaDeclaresProperty(inputSchemaJson, 'inputText')) {
    delete directPayload.inputText;
  }

  return directPayload;
}

export function formatInputValidationError(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return 'Input JSON does not match the endpoint contract.';
  }

  const first = errors[0];
  if (!first) {
    return 'Input JSON does not match the endpoint contract.';
  }

  if (first.keyword === 'required') {
    const missingProperty = (first.params as { missingProperty?: string }).missingProperty ?? 'unknown';
    return `The '${missingProperty}' field is required.`;
  }

  if (first.keyword === 'type') {
    const expectedType = (first.params as { type?: string }).type;
    const fieldName = fieldNameFromIssuePath(first.instancePath);
    if (fieldName) {
      return `The '${fieldName}' field must be ${describeExpectedType(expectedType)}.`;
    }

    return `Input must be ${describeExpectedType(expectedType)}.`;
  }

  if (first.keyword === 'additionalProperties') {
    const additionalProperty = (first.params as { additionalProperty?: string }).additionalProperty;
    if (additionalProperty) {
      return `The '${additionalProperty}' field is not allowed.`;
    }

    return 'Input includes unsupported fields.';
  }

  const fieldName = fieldNameFromIssuePath(first.instancePath);
  if (fieldName && first.message) {
    return withPeriod(`The '${fieldName}' field ${first.message}`);
  }

  return 'Input JSON does not match the endpoint contract.';
}

export function ensureInputMode(mode: string): RuntimeInputMode {
  if (mode === 'text' || mode === 'json') {
    return mode;
  }

  throw new RuntimeModuleError('SPEC_NOT_FOUND', 'resource_load', `Unsupported spec input mode "${mode}".`, {
    statusCode: 400
  });
}

export function resolveInputSchemaJson(
  inputMode: RuntimeInputMode,
  sourceSchema: unknown
): JsonSchemaObject | null {
  if (inputMode !== 'json') {
    return null;
  }

  if (!sourceSchema || typeof sourceSchema !== 'object' || !('type' in sourceSchema)) {
    return null;
  }

  return sourceSchema as JsonSchemaObject;
}
