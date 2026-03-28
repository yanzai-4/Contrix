import { createRequire } from 'node:module';
import type { ErrorObject } from 'ajv';
import type { EndpointSpecValidationPolicy, JsonSchemaObject } from '@contrix/spec-core';
import type { ValidationIssue, ValidationResult } from '@contrix/runtime-core';

type AjvValidateFn = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };
type AjvLike = {
  compile: (schema: unknown) => AjvValidateFn;
};
type AjvConstructor = new (options?: Record<string, unknown>) => AjvLike;

const require = createRequire(import.meta.url);
const Ajv = require('ajv').default as AjvConstructor;

interface ValidationEngineInput {
  outputSchema: JsonSchemaObject;
  candidate: unknown;
  validationPolicy: EndpointSpecValidationPolicy;
}

interface ValidationEngineOutput {
  result: ValidationResult;
  normalizedSchema: JsonSchemaObject;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function includesType(typeValue: JsonSchemaObject['type'], target: string): boolean {
  if (typeof typeValue === 'string') {
    return typeValue === target;
  }

  if (Array.isArray(typeValue)) {
    return typeValue.includes(target as never);
  }

  return false;
}

function normalizeSchemaByPolicy(
  schema: JsonSchemaObject,
  policy: EndpointSpecValidationPolicy
): JsonSchemaObject {
  const cloned = deepClone(schema);

  function walk(node: JsonSchemaObject): JsonSchemaObject {
    const next: JsonSchemaObject = { ...node };

    if (includesType(next.type, 'object')) {
      if (policy.allowExtraFields) {
        next.additionalProperties = true;
      } else if (next.additionalProperties === undefined) {
        next.additionalProperties = false;
      }

      if (next.properties) {
        const normalizedProperties: Record<string, JsonSchemaObject> = {};
        for (const [key, value] of Object.entries(next.properties)) {
          normalizedProperties[key] = walk(value);
        }
        next.properties = normalizedProperties;

        if (!policy.strictRequired) {
          delete next.required;
        } else if (!policy.allowMissingOptional) {
          next.required = Object.keys(normalizedProperties);
        }
      }
    }

    if (includesType(next.type, 'array') && next.items) {
      next.items = walk(next.items);
    }

    return next;
  }

  return walk(cloned);
}

function getValueByInstancePath(candidate: unknown, instancePath: string): unknown {
  if (!instancePath || instancePath === '/') {
    return candidate;
  }

  const segments = instancePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = candidate;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (isObject(current)) {
      current = current[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

function inferExpectedValue(error: ErrorObject): unknown {
  if ('type' in error.params) {
    return (error.params as { type?: unknown }).type ?? null;
  }
  if ('missingProperty' in error.params) {
    return (error.params as { missingProperty?: unknown }).missingProperty ?? null;
  }
  if ('allowedValues' in error.params) {
    return (error.params as { allowedValues?: unknown }).allowedValues ?? null;
  }
  if ('additionalProperty' in error.params) {
    return (error.params as { additionalProperty?: unknown }).additionalProperty ?? null;
  }

  return null;
}

function toValidationIssue(candidate: unknown, error: ErrorObject): ValidationIssue {
  const path = error.instancePath && error.instancePath.length > 0 ? error.instancePath : '/';
  const actual = getValueByInstancePath(candidate, path);

  return {
    path,
    keyword: error.keyword,
    message: error.message ?? 'Validation failed.',
    expected: inferExpectedValue(error),
    actual,
    severity: 'error'
  };
}

export class ValidationEngine {
  validateOutput(input: ValidationEngineInput): ValidationEngineOutput {
    const normalizedSchema = normalizeSchemaByPolicy(input.outputSchema, input.validationPolicy);
    const candidate = deepClone(input.candidate);
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
      coerceTypes: input.validationPolicy.allowTypeCoercion
    });
    const validate = ajv.compile(normalizedSchema);
    const success = validate(candidate);

    const errors = success
      ? []
      : (validate.errors ?? []).map((error) => toValidationIssue(candidate, error));

    return {
      result: {
        success,
        errors,
        normalizedCandidate: candidate
      },
      normalizedSchema
    };
  }
}

