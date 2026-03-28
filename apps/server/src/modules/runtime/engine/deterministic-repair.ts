import { createStableHash } from '@contrix/spec-core';
import type { EndpointSpecValidationPolicy, JsonSchemaObject } from '@contrix/spec-core';
import type {
  DeterministicRepairAction,
  DeterministicRepairResult,
  JsonExtractionResult,
  ValidationIssue
} from '@contrix/runtime-core';
import { extractJsonCandidate } from './json-extractor.js';
import { ValidationEngine } from './validation-engine.js';

interface DeterministicRepairInput {
  rawText: string;
  extraction: JsonExtractionResult | null;
  outputSchema: JsonSchemaObject;
  validationPolicy: EndpointSpecValidationPolicy;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function typeIncludes(schemaType: JsonSchemaObject['type'], target: string): boolean {
  if (typeof schemaType === 'string') {
    return schemaType === target;
  }
  if (Array.isArray(schemaType)) {
    return schemaType.includes(target as never);
  }
  return false;
}

function pickPrimaryType(schema: JsonSchemaObject): JsonSchemaObject['type'] {
  if (!Array.isArray(schema.type)) {
    return schema.type;
  }

  const withoutNull = schema.type.filter((entry) => entry !== 'null');
  return withoutNull[0] ?? schema.type[0];
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const lines = trimmed.split('\n');
    if (lines.length >= 3) {
      return lines.slice(1, -1).join('\n').trim();
    }
  }

  return text.replace(/```(?:json|JSON)?\s*([\s\S]*?)```/g, '$1').trim();
}

function replaceSmartQuotes(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

function balanceBrackets(text: string): string {
  let inString = false;
  let escaped = false;
  const expectedClosers: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      expectedClosers.push('}');
      continue;
    }

    if (char === '[') {
      expectedClosers.push(']');
      continue;
    }

    if (char === '}' || char === ']') {
      const top = expectedClosers[expectedClosers.length - 1];
      if (top === char) {
        expectedClosers.pop();
      }
    }
  }

  if (expectedClosers.length === 0) {
    return text;
  }

  return `${text}${expectedClosers.reverse().join('')}`;
}

function parseJson(value: string): { ok: true; candidate: unknown } | { ok: false; message: string } {
  try {
    return {
      ok: true,
      candidate: JSON.parse(value)
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'JSON parse failed.'
    };
  }
}

interface CoercionResult {
  value: unknown;
  changed: boolean;
}

function coercePrimitive(value: unknown, schema: JsonSchemaObject): CoercionResult {
  const primaryType = pickPrimaryType(schema);

  if (primaryType === 'number') {
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return { value: Number(value), changed: true };
    }
  }

  if (primaryType === 'integer') {
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return { value: Number.parseInt(value, 10), changed: true };
    }
  }

  if (primaryType === 'boolean') {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return { value: true, changed: true };
      }
      if (normalized === 'false') {
        return { value: false, changed: true };
      }
    }
  }

  if (typeIncludes(schema.type, 'null') && typeof value === 'string' && value.trim().toLowerCase() === 'null') {
    return { value: null, changed: true };
  }

  return { value, changed: false };
}

function normalizeFieldNamesBySchema(candidate: unknown, schema: JsonSchemaObject): CoercionResult {
  if (!isObject(candidate) || !isObject(schema.properties)) {
    return { value: candidate, changed: false };
  }

  const mutable: Record<string, unknown> = { ...candidate };
  let changed = false;
  const candidateKeys = Object.keys(mutable);

  for (const expectedKey of Object.keys(schema.properties)) {
    if (Object.prototype.hasOwnProperty.call(mutable, expectedKey)) {
      continue;
    }

    const matched = candidateKeys.find(
      (currentKey) => currentKey.toLowerCase() === expectedKey.toLowerCase()
    );

    if (!matched || matched === expectedKey) {
      continue;
    }

    mutable[expectedKey] = mutable[matched];
    delete mutable[matched];
    changed = true;
  }

  return {
    value: mutable,
    changed
  };
}

function coerceBySchema(candidate: unknown, schema: JsonSchemaObject): CoercionResult {
  if (typeIncludes(schema.type, 'object') && isObject(candidate) && schema.properties) {
    const mapped = normalizeFieldNamesBySchema(candidate, schema);
    const base = isObject(mapped.value) ? mapped.value : {};
    let changed = mapped.changed;
    const next: Record<string, unknown> = { ...base };

    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        continue;
      }

      const coerced = coerceBySchema(next[key], childSchema);
      next[key] = coerced.value;
      changed = changed || coerced.changed;
    }

    return { value: next, changed };
  }

  if (typeIncludes(schema.type, 'array') && Array.isArray(candidate) && schema.items) {
    let changed = false;
    const next = candidate.map((item) => {
      const coerced = coerceBySchema(item, schema.items as JsonSchemaObject);
      changed = changed || coerced.changed;
      return coerced.value;
    });
    return { value: next, changed };
  }

  return coercePrimitive(candidate, schema);
}

function issueFromParseError(message: string): ValidationIssue {
  return {
    path: '/',
    keyword: 'json_parse',
    message,
    expected: 'valid JSON',
    actual: null,
    severity: 'error'
  };
}

export class DeterministicRepairEngine {
  constructor(private readonly validationEngine: ValidationEngine) {}

  repair(input: DeterministicRepairInput): DeterministicRepairResult {
    const actions: DeterministicRepairAction[] = [];
    const errors: string[] = [];
    const baseText = input.extraction?.extractedText ?? input.rawText;
    let repairedText = baseText;
    let changed = false;

    const stripped = stripMarkdownFences(repairedText);
    if (stripped !== repairedText) {
      repairedText = stripped;
      changed = true;
      actions.push({
        type: 'strip_markdown_fence',
        message: 'Removed markdown code fences from model output.'
      });
    }

    const smartQuoteFixed = replaceSmartQuotes(repairedText);
    if (smartQuoteFixed !== repairedText) {
      repairedText = smartQuoteFixed;
      changed = true;
      actions.push({
        type: 'replace_smart_quotes',
        message: 'Normalized smart quotes into standard ASCII quotes.'
      });
    }

    const commaFixed = removeTrailingCommas(repairedText);
    if (commaFixed !== repairedText) {
      repairedText = commaFixed;
      changed = true;
      actions.push({
        type: 'remove_trailing_commas',
        message: 'Removed trailing commas from object/array literals.'
      });
    }

    const balanced = balanceBrackets(repairedText);
    if (balanced !== repairedText) {
      repairedText = balanced;
      changed = true;
      actions.push({
        type: 'balance_brackets',
        message: 'Balanced missing trailing brackets/braces.'
      });
    }

    let parse = parseJson(repairedText);

    if (!parse.ok) {
      const extracted = extractJsonCandidate(repairedText);
      if (extracted.extractedText && extracted.extractedText !== repairedText) {
        repairedText = extracted.extractedText;
        parse = parseJson(repairedText);
        changed = true;
        actions.push({
          type: 'extract_json_substring',
          message: 'Extracted the most likely JSON substring from provider text.'
        });
      }
    }

    if (!parse.ok) {
      errors.push(parse.message);
      return {
        changed,
        parseSucceeded: false,
        repairedText,
        candidate: null,
        actions,
        errors,
        validationResult: {
          success: false,
          errors: [issueFromParseError(parse.message)]
        }
      };
    }

    let candidate = parse.candidate;

    const beforeCoercionHash = createStableHash(candidate);
    if (input.validationPolicy.allowTypeCoercion) {
      const coerced = coerceBySchema(candidate, input.outputSchema);
      candidate = coerced.value;
      if (coerced.changed) {
        changed = true;
        actions.push({
          type: 'type_coercion',
          message: 'Coerced primitive values using output schema types.'
        });
      }
    }

    const afterCoercionHash = createStableHash(candidate);
    if (afterCoercionHash !== beforeCoercionHash && !actions.some((action) => action.type === 'type_coercion')) {
      actions.push({
        type: 'type_coercion',
        message: 'Adjusted candidate values to fit output schema.'
      });
    }

    const fieldMapped = normalizeFieldNamesBySchema(candidate, input.outputSchema);
    if (fieldMapped.changed) {
      candidate = fieldMapped.value;
      changed = true;
      actions.push({
        type: 'field_name_mapping',
        message: 'Mapped field names using case-insensitive schema property matching.'
      });
    }

    const validation = this.validationEngine.validateOutput({
      outputSchema: input.outputSchema,
      candidate,
      validationPolicy: input.validationPolicy
    });

    if (!validation.result.success) {
      errors.push(...validation.result.errors.map((issue) => `${issue.path} ${issue.message}`));
    }

    return {
      changed,
      parseSucceeded: true,
      repairedText,
      candidate: validation.result.normalizedCandidate ?? candidate,
      actions,
      errors,
      validationResult: validation.result
    };
  }
}

