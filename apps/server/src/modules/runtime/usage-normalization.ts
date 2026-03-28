import type { RuntimeTokenUsage } from '@contrix/runtime-core';

export function normalizeRuntimeTokenUsage(
  usage: RuntimeTokenUsage | null | undefined
): RuntimeTokenUsage {
  const cachedInputTokens = usage?.cachedInputTokens ?? null;
  const cacheReadTokens = usage?.cacheReadTokens ?? null;

  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    cachedInputTokens,
    cacheReadTokens,
    cacheWriteTokens: usage?.cacheWriteTokens ?? null,
    cacheMissTokens: usage?.cacheMissTokens ?? null,
    cacheHitObserved:
      typeof usage?.cacheHitObserved === 'boolean'
        ? usage.cacheHitObserved
        : (cachedInputTokens ?? 0) > 0 || (cacheReadTokens ?? 0) > 0,
    cacheMetricsSupported: usage?.cacheMetricsSupported ?? false,
    cacheMetricsSource: usage?.cacheMetricsSource ?? 'none',
    rawUsage: usage?.rawUsage ?? null
  };
}
