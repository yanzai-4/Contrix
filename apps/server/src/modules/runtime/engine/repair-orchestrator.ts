import { createStableHash } from '@contrix/spec-core';
import type {
  EndpointRepairPolicy,
  EndpointStructuredOutputStrategy,
  EndpointSpecValidationPolicy,
  JsonSchemaObject
} from '@contrix/spec-core';
import type {
  AdapterInvokeResult,
  DeterministicRepairResult,
  NormalizedProviderResult,
  RetryAttemptMeta,
  RuntimeErrorStage,
  RuntimeErrorType,
  RuntimeOutputSource,
  RuntimeProviderType,
  RuntimeTokenUsage,
  StructuredOutputRequestMode,
  ValidationIssue,
  ValidationResult
} from '@contrix/runtime-core';
import { normalizeRuntimeError } from '../errors.js';
import { normalizeRuntimeTokenUsage } from '../usage-normalization.js';
import { DeterministicRepairEngine } from './deterministic-repair.js';
import { extractJsonCandidate } from './json-extractor.js';
import { buildRepairPrompt } from './repair-prompt-builder.js';
import { ValidationEngine } from './validation-engine.js';

interface InvokeProviderInput {
  prompt: string;
  providerCallIndex: number;
  responseFormatMode: StructuredOutputRequestMode;
}

export interface RuntimeOrchestratorContext {
  providerType: RuntimeProviderType;
  model: string;
  timeoutMs: number;
  promptHash: string;
  outputSchema: JsonSchemaObject;
  rules: string | null;
  validationPolicy: EndpointSpecValidationPolicy;
  repairPolicy: EndpointRepairPolicy;
  structuredOutputStrategy: EndpointStructuredOutputStrategy;
  maxProviderCalls: number;
}

interface RuntimeOrchestratorInput {
  initialPrompt: string;
  context: RuntimeOrchestratorContext;
  invokeProvider: (input: InvokeProviderInput) => Promise<AdapterInvokeResult>;
}

interface RuntimeOrchestratorSuccess {
  success: true;
  rawOutput: string;
  outputSource: RuntimeOutputSource;
  finalOutput: string;
  finalOutputJson: unknown;
  finalOutputRawText: string;
  finalOutputNormalized: unknown;
  finishReason: string | null;
  usage: RuntimeTokenUsage;
  attempts: RetryAttemptMeta[];
  normalizedProviderResult: NormalizedProviderResult;
}

interface RuntimeOrchestratorFailure {
  success: false;
  errorType: RuntimeErrorType;
  errorStage: RuntimeErrorStage;
  message: string;
  attempts: RetryAttemptMeta[];
  lastRawOutput: string | null;
  lastValidationIssues: ValidationIssue[];
}

export type RuntimeOrchestratorResult = RuntimeOrchestratorSuccess | RuntimeOrchestratorFailure;

function toRequestSummary(model: string, timeoutMs: number, providerType: RuntimeProviderType) {
  return { model, timeoutMs, providerType };
}

function toProviderResponseSummary(value: {
  statusCode?: number | null;
  finishReason?: string | null;
  rawText?: string | null;
}): RetryAttemptMeta['providerResponseSummary'] {
  return {
    statusCode: value.statusCode ?? null,
    finishReason: value.finishReason ?? null,
    hasRawText: Boolean(value.rawText && value.rawText.trim())
  };
}

function chooseResponseFormatMode(strategy: EndpointStructuredOutputStrategy): StructuredOutputRequestMode {
  if (!strategy.enabled) {
    return 'none';
  }

  return strategy.mode === 'provider-native' ? 'json_object' : 'none';
}

function parseExtractedCandidate(
  extractedText: string | null
): { candidate: unknown | null; parseError: string | null } {
  if (!extractedText) {
    return {
      candidate: null,
      parseError: 'No JSON payload could be extracted from model output.'
    };
  }

  try {
    return {
      candidate: JSON.parse(extractedText),
      parseError: null
    };
  } catch (error) {
    return {
      candidate: null,
      parseError: error instanceof Error ? error.message : 'Extracted JSON parsing failed.'
    };
  }
}

function buildParseFailureValidation(parseError: string): ValidationResult {
  return {
    success: false,
    errors: [
      {
        path: '/',
        keyword: 'json_parse',
        message: parseError,
        expected: 'valid JSON',
        actual: null,
        severity: 'error'
      }
    ]
  };
}

function buildFinalOutput(normalized: unknown): string {
  if (typeof normalized === 'string') {
    return normalized;
  }

  return JSON.stringify(normalized, null, 2);
}

function toOutputSource(providerCallIndex: number, fromDeterministicRepair: boolean): RuntimeOutputSource {
  if (providerCallIndex <= 1) {
    return fromDeterministicRepair ? 'deterministic_repair' : 'provider_direct_valid';
  }

  return fromDeterministicRepair ? 'repair_retry_deterministic_repair' : 'repair_retry_valid';
}

function buildAdditionalPropertiesRepairResult(input: {
  removedAdditionalPropertyPaths: string[];
  repairedCandidate: unknown;
  validation: ValidationResult;
  extractedJsonText: string | null;
  rawText: string;
}): DeterministicRepairResult | null {
  const { removedAdditionalPropertyPaths } = input;
  if (removedAdditionalPropertyPaths.length === 0) {
    return null;
  }

  const previewPaths = removedAdditionalPropertyPaths.slice(0, 3).join(', ');
  const hiddenPathCount = removedAdditionalPropertyPaths.length - Math.min(3, removedAdditionalPropertyPaths.length);
  const hiddenSuffix = hiddenPathCount > 0 ? ` (+${hiddenPathCount} more)` : '';
  const noun = removedAdditionalPropertyPaths.length === 1 ? 'property' : 'properties';

  return {
    changed: true,
    parseSucceeded: true,
    repairedText: input.extractedJsonText ?? input.rawText,
    candidate: input.repairedCandidate,
    actions: [
      {
        type: 'remove_additional_properties',
        message: `Removed ${removedAdditionalPropertyPaths.length} additional ${noun}: ${previewPaths}${hiddenSuffix}.`
      }
    ],
    errors: [],
    validationResult: input.validation
  };
}

export class RuntimeValidationRepairOrchestrator {
  private readonly validationEngine = new ValidationEngine();

  private readonly deterministicRepairEngine = new DeterministicRepairEngine(this.validationEngine);

  async execute(input: RuntimeOrchestratorInput): Promise<RuntimeOrchestratorResult> {
    const attempts: RetryAttemptMeta[] = [];
    const maxProviderCalls = Math.min(3, Math.max(1, input.context.maxProviderCalls));
    const responseFormatMode = chooseResponseFormatMode(input.context.structuredOutputStrategy);
    let currentPrompt = input.initialPrompt;
    let currentRepairPrompt: string | null = null;
    let lastRawOutput: string | null = null;
    let lastValidationIssues: ValidationIssue[] = [];

    for (let providerCallIndex = 1; providerCallIndex <= maxProviderCalls; providerCallIndex += 1) {
      const startedAt = new Date().toISOString();
      const startedAtMs = Date.now();
      const renderedPromptHash = createStableHash(currentPrompt);

      try {
        const providerResult = await input.invokeProvider({
          prompt: currentPrompt,
          providerCallIndex,
          responseFormatMode
        });
        const finishedAt = new Date().toISOString();
        const latencyMs = Date.now() - startedAtMs;
        const rawText = providerResult.rawText ?? '';
        lastRawOutput = rawText;

        const extraction = extractJsonCandidate(rawText);
        const parsed = parseExtractedCandidate(extraction.extractedText);
        const validationOutput = parsed.candidate
          ? this.validationEngine.validateOutput({
              outputSchema: input.context.outputSchema,
              candidate: parsed.candidate,
              validationPolicy: input.context.validationPolicy
            })
          : {
              result: buildParseFailureValidation(parsed.parseError ?? 'Extracted JSON parsing failed.'),
              normalizationMeta: {
                removedAdditionalPropertyPaths: []
              }
            };
        const validation = validationOutput.result;
        const additionalPropertiesRepair = buildAdditionalPropertiesRepairResult({
          removedAdditionalPropertyPaths: validationOutput.normalizationMeta.removedAdditionalPropertyPaths,
          repairedCandidate: validation.normalizedCandidate ?? parsed.candidate,
          validation,
          extractedJsonText: extraction.extractedText,
          rawText
        });

        if (validation.success) {
          const normalizedCandidate = validation.normalizedCandidate ?? parsed.candidate;
          const outputSource = toOutputSource(providerCallIndex, Boolean(additionalPropertiesRepair));
          const attempt: RetryAttemptMeta = {
            attemptIndex: attempts.length + 1,
            providerCallIndex,
            startedAt,
            finishedAt,
            latencyMs,
            renderedPromptHash,
            rawProviderText: rawText,
            jsonExtraction: extraction,
            validationResult: validation,
            deterministicRepairResult: additionalPropertiesRepair,
            repairPromptUsed: currentRepairPrompt,
            successStage: additionalPropertiesRepair
              ? providerCallIndex > 1
                ? 'repair_retry_repaired'
                : 'deterministic_repaired'
              : providerCallIndex > 1
                ? 'repair_retry_validated'
                : 'validated',
            errorStage: null,
            retryTriggered: false,
            timeoutTriggered: false,
            requestSummary: toRequestSummary(
              input.context.model,
              input.context.timeoutMs,
              input.context.providerType
            ),
            providerResponseSummary: toProviderResponseSummary({
              statusCode: providerResult.providerResponseMeta?.statusCode ?? null,
              finishReason: providerResult.finishReason ?? null,
              rawText
            })
          };

          attempts.push(attempt);

          const normalizedProviderResult: NormalizedProviderResult = {
            rawText,
            finishReason: providerResult.finishReason ?? null,
            usage: normalizeRuntimeTokenUsage(providerResult.usage),
            rawResponse: providerResult.rawResponse,
            providerResponseMeta: {
              requestId: providerResult.providerResponseMeta?.requestId ?? null,
              model: providerResult.model,
              providerType: providerResult.providerType,
              statusCode: providerResult.providerResponseMeta?.statusCode ?? null
            }
          };

          return {
            success: true,
            rawOutput: rawText,
            outputSource,
            finalOutput: buildFinalOutput(normalizedCandidate),
            finalOutputJson: normalizedCandidate,
            finalOutputRawText: rawText,
            finalOutputNormalized: normalizedCandidate,
            finishReason: providerResult.finishReason ?? null,
            usage: normalizeRuntimeTokenUsage(providerResult.usage),
            attempts,
            normalizedProviderResult
          };
        }

        const deterministicRepair = input.context.repairPolicy.enableDeterministicRepair
          ? this.deterministicRepairEngine.repair({
              rawText,
              extraction,
              outputSchema: input.context.outputSchema,
              validationPolicy: input.context.validationPolicy
            })
          : null;
        const deterministicValidation = deterministicRepair?.validationResult ?? null;

        if (deterministicValidation?.success) {
          const repairedCandidate =
            deterministicValidation.normalizedCandidate ?? deterministicRepair?.candidate ?? null;
          const outputSource = toOutputSource(providerCallIndex, true);

          const attempt: RetryAttemptMeta = {
            attemptIndex: attempts.length + 1,
            providerCallIndex,
            startedAt,
            finishedAt,
            latencyMs,
            renderedPromptHash,
            rawProviderText: rawText,
            jsonExtraction: extraction,
            validationResult: validation,
            deterministicRepairResult: deterministicRepair,
            repairPromptUsed: currentRepairPrompt,
            successStage: providerCallIndex > 1 ? 'repair_retry_repaired' : 'deterministic_repaired',
            errorStage: null,
            retryTriggered: false,
            timeoutTriggered: false,
            requestSummary: toRequestSummary(
              input.context.model,
              input.context.timeoutMs,
              input.context.providerType
            ),
            providerResponseSummary: toProviderResponseSummary({
              statusCode: providerResult.providerResponseMeta?.statusCode ?? null,
              finishReason: providerResult.finishReason ?? null,
              rawText
            })
          };

          attempts.push(attempt);

          const normalizedProviderResult: NormalizedProviderResult = {
            rawText,
            finishReason: providerResult.finishReason ?? null,
            usage: normalizeRuntimeTokenUsage(providerResult.usage),
            rawResponse: providerResult.rawResponse,
            providerResponseMeta: {
              requestId: providerResult.providerResponseMeta?.requestId ?? null,
              model: providerResult.model,
              providerType: providerResult.providerType,
              statusCode: providerResult.providerResponseMeta?.statusCode ?? null
            }
          };

          return {
            success: true,
            rawOutput: rawText,
            outputSource,
            finalOutput: buildFinalOutput(repairedCandidate),
            finalOutputJson: repairedCandidate,
            finalOutputRawText: rawText,
            finalOutputNormalized: repairedCandidate,
            finishReason: providerResult.finishReason ?? null,
            usage: normalizeRuntimeTokenUsage(providerResult.usage),
            attempts,
            normalizedProviderResult
          };
        }

        lastValidationIssues =
          deterministicValidation?.errors.length
            ? deterministicValidation.errors
            : validation.errors;

        const shouldRepairRetry =
          input.context.repairPolicy.enableRepairRetry && providerCallIndex < maxProviderCalls;
        currentRepairPrompt = shouldRepairRetry
          ? buildRepairPrompt({
              originalPrompt: input.initialPrompt,
              previousRawOutput: rawText,
              extractedJsonText: extraction.extractedText,
              validationIssues: lastValidationIssues,
              outputSchema: input.context.outputSchema,
              rules: input.context.rules,
              validationPolicy: input.context.validationPolicy
            })
          : null;

        const attempt: RetryAttemptMeta = {
          attemptIndex: attempts.length + 1,
          providerCallIndex,
          startedAt,
          finishedAt,
          latencyMs,
          renderedPromptHash,
          rawProviderText: rawText,
          jsonExtraction: extraction,
          validationResult: validation,
          deterministicRepairResult: deterministicRepair ?? null,
          repairPromptUsed: currentRepairPrompt,
          successStage: null,
          errorStage: shouldRepairRetry ? 'repair_retry' : 'validation',
          retryTriggered: shouldRepairRetry,
          timeoutTriggered: false,
          requestSummary: toRequestSummary(
            input.context.model,
            input.context.timeoutMs,
            input.context.providerType
          ),
          providerResponseSummary: toProviderResponseSummary({
            statusCode: providerResult.providerResponseMeta?.statusCode ?? null,
            finishReason: providerResult.finishReason ?? null,
            rawText
          }),
          errorType: shouldRepairRetry
            ? 'REPAIR_RETRY_FAILED'
            : deterministicRepair
              ? 'DETERMINISTIC_REPAIR_FAILED'
              : 'OUTPUT_VALIDATION_FAILED',
          message: shouldRepairRetry
            ? 'Validation failed; generated repair prompt for retry.'
            : 'Output validation failed after deterministic repair.'
        };

        attempts.push(attempt);

        if (shouldRepairRetry && currentRepairPrompt) {
          currentPrompt = currentRepairPrompt;
          continue;
        }

        return {
          success: false,
          errorType: deterministicRepair ? 'DETERMINISTIC_REPAIR_FAILED' : 'OUTPUT_VALIDATION_FAILED',
          errorStage: deterministicRepair ? 'deterministic_repair' : 'validation',
          message: deterministicRepair
            ? 'Deterministic repair could not produce schema-valid output.'
            : 'Output did not match schema and repair retry is disabled.',
          attempts,
          lastRawOutput,
          lastValidationIssues
        };
      } catch (error) {
        const normalized = normalizeRuntimeError(error, {
          type: 'RUNTIME_PROVIDER_ERROR',
          stage: 'provider_request',
          message: 'Provider request failed.',
          statusCode: 502
        });

        const finishedAt = new Date().toISOString();
        const latencyMs = Date.now() - startedAtMs;
        const shouldRetry = providerCallIndex < maxProviderCalls;

        attempts.push({
          attemptIndex: attempts.length + 1,
          providerCallIndex,
          startedAt,
          finishedAt,
          latencyMs,
          renderedPromptHash,
          rawProviderText: null,
          jsonExtraction: null,
          validationResult: null,
          deterministicRepairResult: null,
          repairPromptUsed: currentRepairPrompt,
          successStage: null,
          errorStage: 'provider_request',
          retryTriggered: shouldRetry,
          timeoutTriggered: normalized.type === 'PROVIDER_TIMEOUT' || normalized.type === 'RUNTIME_TIMEOUT',
          requestSummary: toRequestSummary(
            input.context.model,
            input.context.timeoutMs,
            input.context.providerType
          ),
          providerResponseSummary: toProviderResponseSummary({
            statusCode: normalized.responseStatus ?? normalized.statusCode,
            finishReason: null,
            rawText: null
          }),
          errorType: normalized.type,
          message: normalized.message
        });

        if (shouldRetry) {
          continue;
        }

        return {
          success: false,
          errorType: normalized.type === 'PROVIDER_TIMEOUT' ? 'RUNTIME_TIMEOUT' : 'RUNTIME_PROVIDER_ERROR',
          errorStage: normalized.stage,
          message: normalized.message,
          attempts,
          lastRawOutput,
          lastValidationIssues
        };
      }
    }

    return {
      success: false,
      errorType: 'MAX_ATTEMPTS_EXCEEDED',
      errorStage: 'repair_retry',
      message: 'Maximum runtime provider attempts reached without valid output.',
      attempts,
      lastRawOutput,
      lastValidationIssues
    };
  }
}
