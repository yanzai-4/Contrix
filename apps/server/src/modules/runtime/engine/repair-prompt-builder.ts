import type { EndpointSpecValidationPolicy, JsonSchemaObject } from '@contrix/spec-core';
import type { ValidationIssue } from '@contrix/runtime-core';

interface BuildRepairPromptInput {
  originalPrompt: string;
  previousRawOutput: string;
  extractedJsonText: string | null;
  validationIssues: ValidationIssue[];
  outputSchema: JsonSchemaObject;
  rules: string | null;
  validationPolicy: EndpointSpecValidationPolicy;
}

function normalizeRules(rules: string | null): string[] {
  if (!rules) {
    return [];
  }

  const trimmed = rules.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter((item) => item.length > 0);
    }
  } catch {
    // Fall through to line split mode.
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim().replace(/^[-*\d.]+\s*/, ''))
    .filter((line) => line.length > 0);
}

function summarizeIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return '- Unknown validation failure';
  }

  return issues
    .slice(0, 12)
    .map((issue, index) => `${index + 1}. ${issue.path} (${issue.keyword}): ${issue.message}`)
    .join('\n');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

export function buildRepairPrompt(input: BuildRepairPromptInput): string {
  const rules = normalizeRules(input.rules);
  const rulesBlock =
    rules.length > 0
      ? rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')
      : 'None provided.';

  const extractedJson = input.extractedJsonText ? truncate(input.extractedJsonText, 2400) : '[none]';
  const previousOutput = truncate(input.previousRawOutput, 3200);
  const validationIssueSummary = summarizeIssues(input.validationIssues);

  return [
    'SYSTEM REPAIR TASK:',
    'Your previous answer did not satisfy the output contract.',
    'Rewrite the answer so it strictly matches the schema and validation requirements.',
    '',
    'RULES:',
    '- Return valid JSON only.',
    '- Do not include markdown, code fences, or explanations.',
    '- Preserve original intent whenever possible while fixing structural issues.',
    '',
    'VALIDATION POLICY:',
    `- strictRequired: ${String(input.validationPolicy.strictRequired)}`,
    `- allowExtraFields: ${String(input.validationPolicy.allowExtraFields)}`,
    `- allowTypeCoercion: ${String(input.validationPolicy.allowTypeCoercion)}`,
    `- allowMissingOptional: ${String(input.validationPolicy.allowMissingOptional)}`,
    '',
    'RULES:',
    rulesBlock,
    '',
    'OUTPUT SCHEMA:',
    JSON.stringify(input.outputSchema, null, 2),
    '',
    'VALIDATION ERRORS:',
    validationIssueSummary,
    '',
    'PREVIOUS RAW OUTPUT:',
    previousOutput,
    '',
    'EXTRACTED JSON CANDIDATE:',
    extractedJson,
    '',
    'ORIGINAL TASK PROMPT (FOR CONTEXT):',
    truncate(input.originalPrompt, 3600),
    '',
    'RETURN ONLY THE CORRECTED JSON OBJECT OR ARRAY.'
  ].join('\n');
}
