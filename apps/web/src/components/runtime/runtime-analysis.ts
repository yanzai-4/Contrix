import type { RetryAttemptMeta, RuntimeInputMode, RuntimeResponse } from '@contrix/runtime-core';
import { runRuntimeByEndpoint } from '../../services/api';
import { buildRuntimeRequestPayload } from '../../utils/runtimeRequestPayload';

export type DiffLineState = 'same' | 'removed' | 'added';

export interface DiffLine {
  text: string;
  state: DiffLineState;
}

interface RunSample {
  success: boolean;
  latencyMs: number;
  totalTokens: number | null;
  retryTriggered: boolean;
  repairTriggered: boolean;
  outputKey: string | null;
  outputPreview: string | null;
}

interface OutputGroup {
  key: string;
  count: number;
  preview: string;
}

export interface StabilitySummary {
  totalRuns: number;
  successCount: number;
  successRate: number;
  uniqueOutputCount: number;
  repeatedOutputCount: number;
  mostCommonOutputCount: number;
  mostCommonOutputRatio: number;
  mostCommonOutputPreview: string | null;
  averageLatencyMs: number | null;
  averageTokens: number | null;
  retryOccurrenceCount: number;
  repairOccurrenceCount: number;
  outputGroups: OutputGroup[];
}

export interface CompareModelResult {
  model: string;
  summary: StabilitySummary;
}

export interface SharedOutputOverlap {
  key: string;
  preview: string;
  modelMatches: Array<{
    model: string;
    count: number;
    ratio: number;
  }>;
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function summarizeInline(value: string | null | undefined, maxLength = 180): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '-';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return '-';
  }

  return value.toLocaleString();
}

export function formatLatency(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return `${value}ms`;
}

export function isFailedAttempt(attempt: RetryAttemptMeta): boolean {
  if (attempt.errorStage || attempt.errorType) {
    return true;
  }

  if (attempt.validationResult && !attempt.validationResult.success) {
    return true;
  }

  return false;
}

export function buildLineDiff(
  beforeText: string,
  afterText: string
): { beforeLines: DiffLine[]; afterLines: DiffLine[] } {
  const beforeLinesRaw = beforeText.split('\n');
  const afterLinesRaw = afterText.split('\n');
  const normalize = (line: string) => line.trim();
  const beforeSet = new Set(beforeLinesRaw.map(normalize).filter(Boolean));
  const afterSet = new Set(afterLinesRaw.map(normalize).filter(Boolean));

  return {
    beforeLines: beforeLinesRaw.map((line) => {
      const normalized = normalize(line);
      if (!normalized) {
        return { text: line, state: 'same' as const };
      }

      return {
        text: line,
        state: afterSet.has(normalized) ? 'same' : 'removed'
      };
    }),
    afterLines: afterLinesRaw.map((line) => {
      const normalized = normalize(line);
      if (!normalized) {
        return { text: line, state: 'same' as const };
      }

      return {
        text: line,
        state: beforeSet.has(normalized) ? 'same' : 'added'
      };
    })
  };
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected runtime execution error.';
}

function toPreview(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item));
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
    const normalized: Record<string, unknown> = {};

    for (const key of keys) {
      normalized[key] = normalizeForStableStringify(source[key]);
    }

    return normalized;
  }

  return value;
}

function toStableOutputKey(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value));
}

function average(numbers: number[]): number | null {
  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function toRunSample(response: RuntimeResponse): RunSample {
  const attempts = response.attempts ?? [];
  const latencyMs = attempts.reduce((total, attempt) => total + attempt.latencyMs, 0);
  const retryTriggered = attempts.some((attempt) => attempt.retryTriggered);
  const repairTriggered = attempts.some(
    (attempt) => Boolean(attempt.deterministicRepairResult) || Boolean(attempt.repairPromptUsed)
  );

  if (response.success) {
    return {
      success: true,
      latencyMs,
      totalTokens: typeof response.usage.totalTokens === 'number' ? response.usage.totalTokens : null,
      retryTriggered,
      repairTriggered,
      outputKey: toStableOutputKey(response.finalOutputJson),
      outputPreview: toPreview(response.finalOutputJson)
    };
  }

  return {
    success: false,
    latencyMs,
    totalTokens: null,
    retryTriggered,
    repairTriggered,
    outputKey: null,
    outputPreview: response.error.message
  };
}

function summarizeRuns(runs: RunSample[]): StabilitySummary {
  const totalRuns = runs.length;
  const successfulRuns = runs.filter((run) => run.success && run.outputKey);
  const successCount = successfulRuns.length;
  const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;
  const frequency = new Map<string, { count: number; preview: string }>();

  for (const run of successfulRuns) {
    if (!run.outputKey) {
      continue;
    }
    const current = frequency.get(run.outputKey);
    if (current) {
      current.count += 1;
      continue;
    }

    frequency.set(run.outputKey, {
      count: 1,
      preview: run.outputPreview ?? ''
    });
  }

  const outputGroups = Array.from(frequency.entries())
    .map(([key, value]) => ({
      key,
      count: value.count,
      preview: value.preview
    }))
    .sort((a, b) => b.count - a.count);

  const uniqueOutputCount = outputGroups.length;
  const repeatedOutputCount = Math.max(0, successCount - uniqueOutputCount);
  const mostCommon = outputGroups[0] ?? null;
  const mostCommonOutputCount = mostCommon?.count ?? 0;
  const mostCommonOutputRatio = totalRuns > 0 ? (mostCommonOutputCount / totalRuns) * 100 : 0;

  const averageLatencyMs = average(runs.map((run) => run.latencyMs));
  const tokens = runs.map((run) => run.totalTokens).filter((value): value is number => typeof value === 'number');
  const averageTokens = average(tokens);

  return {
    totalRuns,
    successCount,
    successRate,
    uniqueOutputCount,
    repeatedOutputCount,
    mostCommonOutputCount,
    mostCommonOutputRatio,
    mostCommonOutputPreview: mostCommon?.preview ?? null,
    averageLatencyMs,
    averageTokens,
    retryOccurrenceCount: runs.filter((run) => run.retryTriggered).length,
    repairOccurrenceCount: runs.filter((run) => run.repairTriggered).length,
    outputGroups
  };
}

export async function runSeries(
  endpointId: string,
  inputMode: RuntimeInputMode,
  inputText: string,
  inputJsonText: string,
  overrideModel: string | null,
  totalRuns: number,
  onProgress: (currentRun: number) => void
): Promise<StabilitySummary> {
  const payload = buildRuntimeRequestPayload(inputMode, inputText, inputJsonText, overrideModel);
  const runs: RunSample[] = [];

  for (let runIndex = 1; runIndex <= totalRuns; runIndex += 1) {
    onProgress(runIndex);
    try {
      const response = await runRuntimeByEndpoint(endpointId, payload);
      runs.push(toRunSample(response));
    } catch (error) {
      runs.push({
        success: false,
        latencyMs: 0,
        totalTokens: null,
        retryTriggered: false,
        repairTriggered: false,
        outputKey: null,
        outputPreview: toErrorMessage(error)
      });
    }
  }

  return summarizeRuns(runs);
}

export function computeSharedOutputOverlap(results: CompareModelResult[]): SharedOutputOverlap | null {
  if (results.length < 2) {
    return null;
  }

  const sharedMap = new Map<
    string,
    {
      preview: string;
      modelMatches: Array<{ model: string; count: number; ratio: number }>;
    }
  >();

  for (const result of results) {
    for (const group of result.summary.outputGroups) {
      const ratio = result.summary.totalRuns > 0 ? (group.count / result.summary.totalRuns) * 100 : 0;
      const current = sharedMap.get(group.key);
      if (current) {
        current.modelMatches.push({
          model: result.model,
          count: group.count,
          ratio
        });
      } else {
        sharedMap.set(group.key, {
          preview: group.preview,
          modelMatches: [
            {
              model: result.model,
              count: group.count,
              ratio
            }
          ]
        });
      }
    }
  }

  const candidates = Array.from(sharedMap.entries())
    .map(([key, value]) => ({
      key,
      preview: value.preview,
      modelMatches: value.modelMatches.sort((a, b) => b.ratio - a.ratio)
    }))
    .filter((item) => item.modelMatches.length >= 2)
    .sort((a, b) => {
      if (b.modelMatches.length !== a.modelMatches.length) {
        return b.modelMatches.length - a.modelMatches.length;
      }
      const aAvg = a.modelMatches.reduce((sum, item) => sum + item.ratio, 0) / a.modelMatches.length;
      const bAvg = b.modelMatches.reduce((sum, item) => sum + item.ratio, 0) / b.modelMatches.length;
      return bAvg - aAvg;
    });

  return candidates[0] ?? null;
}

export function countSharedOutputGroups(results: CompareModelResult[]): number {
  if (results.length < 2) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const result of results) {
    for (const group of result.summary.outputGroups) {
      counts.set(group.key, (counts.get(group.key) ?? 0) + 1);
    }
  }

  return Array.from(counts.values()).filter((value) => value >= 2).length;
}
