import { randomUUID } from 'node:crypto';
import type {
  RuntimeFailureResponse,
  RuntimeResponse,
  RuntimeSuccessResponse,
  RuntimeTokenUsage
} from '@contrix/runtime-core';
import type { ProviderSummary } from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ProjectRepository } from '../project/repository.js';
import { ProviderRegistry } from '../provider/registry.js';
import { normalizeRuntimeTokenUsage } from '../runtime/usage-normalization.js';
import { CallLogRepository } from './repository.js';
import type {
  CallLogDebugSnapshotRecord,
  RuntimeLogWriteContext,
  RuntimeLogWritePayload
} from './model.js';

const SUMMARY_LIMIT = 320;
const DEEP_DEBUG_ENABLED =
  process.env.CONTRIX_ENABLE_DEEP_DEBUG_LOGS === '1' || process.env.CONTRIX_ENABLE_DEEP_DEBUG_LOGS === 'true';

function truncateText(value: string | null | undefined, maxLength = SUMMARY_LIMIT): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[truncated]`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

function summarizeInput(context: RuntimeLogWriteContext): string | null {
  if (context.inputMode === 'text') {
    return truncateText(context.inputText);
  }

  if (context.inputMode === 'json' && context.inputJson !== undefined) {
    return truncateText(safeJsonStringify(context.inputJson));
  }

  if (context.inputText) {
    return truncateText(context.inputText);
  }

  if (context.inputJson !== undefined) {
    return truncateText(safeJsonStringify(context.inputJson));
  }

  return null;
}

function summarizeOutput(response: RuntimeResponse): string | null {
  if (response.success) {
    const jsonSummary = truncateText(safeJsonStringify(response.finalOutputJson));
    if (jsonSummary) {
      return jsonSummary;
    }

    return truncateText(response.finalOutputRawText ?? response.rawOutput);
  }

  if (response.lastRawOutput) {
    return truncateText(response.lastRawOutput);
  }

  return truncateText(response.error.message);
}

function calculateRepairCount(response: RuntimeResponse): number {
  return response.attempts.filter((attempt) => {
    if (attempt.repairPromptUsed) {
      return true;
    }

    return Boolean(
      attempt.deterministicRepairResult &&
        (attempt.deterministicRepairResult.changed || attempt.deterministicRepairResult.actions.length > 0)
    );
  }).length;
}

function calculateApiCallCount(response: RuntimeResponse): number {
  if (response.attempts.length === 0) {
    return 0;
  }

  return response.attempts.reduce(
    (maxValue, attempt) => Math.max(maxValue, Math.max(0, attempt.providerCallIndex)),
    0
  );
}

function calculateLatencyMs(response: RuntimeResponse): number | null {
  if (response.attempts.length === 0) {
    return null;
  }

  return response.attempts.reduce((total, attempt) => total + Math.max(0, attempt.latencyMs), 0);
}

function toFailure(response: RuntimeResponse): RuntimeFailureResponse | null {
  return response.success ? null : response;
}

function toSuccess(response: RuntimeResponse): RuntimeSuccessResponse | null {
  return response.success ? response : null;
}

function sanitizeProviderLabel(record: ProviderSummary | null): string | null {
  return record?.name ?? null;
}

function buildDebugSnapshot(input: {
  callLogId: string;
  createdAt: string;
  context: RuntimeLogWriteContext;
  response: RuntimeResponse;
  usage: RuntimeTokenUsage;
}): CallLogDebugSnapshotRecord | null {
  if (!DEEP_DEBUG_ENABLED) {
    return null;
  }

  return {
    id: randomUUID(),
    callLogId: input.callLogId,
    payload: {
      context: {
        runId: input.context.runId,
        requestId: input.context.requestId,
        inputMode: input.context.inputMode,
        inputText: input.context.inputText,
        inputJson: input.context.inputJson,
        renderedPrompt: input.context.renderedPrompt,
        promptHash: input.context.promptHash,
        model: input.context.model,
        providerId: input.context.providerId,
        providerName: input.context.providerName,
        endpointId: input.context.endpointId,
        endpointName: input.context.endpointName,
        namespace: input.context.namespace,
        pathSlug: input.context.pathSlug
      },
      response: input.response,
      usage: input.usage
    },
    createdAt: input.createdAt
  };
}

export class CallLogWriter {
  private readonly logsRepository: CallLogRepository;
  private readonly projectRepository: ProjectRepository;
  private readonly providerRegistry: ProviderRegistry;

  constructor(db: SQLiteDatabase) {
    this.logsRepository = new CallLogRepository(db);
    this.projectRepository = new ProjectRepository(db);
    this.providerRegistry = new ProviderRegistry(db);
  }

  writeRuntimeLog(payload: RuntimeLogWritePayload): string {
    const { context, response } = payload;
    const now = new Date().toISOString();
    const callLogId = randomUUID();
    const success = toSuccess(response);
    const failure = toFailure(response);
    const usage = normalizeRuntimeTokenUsage(payload.usage ?? success?.usage);
    const project = context.projectId ? this.projectRepository.findById(context.projectId) : null;
    const providerRecord = context.providerId ? this.providerRegistry.getSummary(context.providerId) : null;
    const repairCount = calculateRepairCount(response);
    const apiCallCount = calculateApiCallCount(response);
    const latencyMs = calculateLatencyMs(response);

    const debugSnapshot = buildDebugSnapshot({
      callLogId,
      createdAt: now,
      context,
      response,
      usage
    });

    this.logsRepository.insert({
      call: {
        id: callLogId,
        runId: context.runId,
        requestId: context.requestId,
        projectKey: context.projectId,
        projectName: context.projectName ?? project?.name ?? null,
        endpointKey: context.endpointId,
        endpointName: context.endpointName,
        providerKey: context.providerId,
        providerLabel: context.providerName ?? sanitizeProviderLabel(providerRecord),
        model: context.model,
        success: response.success,
        outputSource: success?.outputSource ?? null,
        structuredOutputTriggered: context.structuredOutputTriggered,
        repairTriggered: repairCount > 0,
        apiCallCount,
        attemptCount: response.attemptCount,
        repairCount,
        latencyMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        cachedTokens: usage.cachedInputTokens ?? null,
        cacheReadTokens: usage.cacheReadTokens ?? null,
        cacheWriteTokens: usage.cacheWriteTokens ?? null,
        cacheMissTokens: usage.cacheMissTokens ?? null,
        cacheHitObserved: usage.cacheHitObserved ?? false,
        cacheMetricsSupported: usage.cacheMetricsSupported ?? false,
        cacheMetricsSource: usage.cacheMetricsSource ?? 'none',
        rawUsage: usage.rawUsage ?? null,
        errorType: failure?.error.type ?? null,
        failureStage: failure?.error.stage ?? null,
        promptHash: context.promptHash,
        inputPreview: summarizeInput(context),
        outputPreview: summarizeOutput(response),
        debugSnapshotAvailable: debugSnapshot !== null,
        createdAt: now
      },
      debugSnapshot
    });

    return callLogId;
  }
}
