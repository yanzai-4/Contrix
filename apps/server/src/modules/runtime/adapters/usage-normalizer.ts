import type {
  CacheMetricsSource,
  RuntimeProviderType,
  RuntimeTokenUsage
} from '@contrix/runtime-core';

type ProviderUsageProfile =
  | 'openai'
  | 'openrouter'
  | 'gemini'
  | 'anthropic'
  | 'deepseek'
  | 'xai'
  | 'qwen'
  | 'minimax'
  | 'mistral'
  | 'unknown';

interface UsageNormalizationInput {
  providerType: RuntimeProviderType;
  baseUrl: string;
  response: unknown;
}

interface NumberLookupResult {
  found: boolean;
  value: number | null;
}

const RAW_USAGE_KEYS = [
  'usage',
  'usageMetadata',
  'cached_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'prompt_cache_hit_tokens',
  'prompt_cache_miss_tokens',
  'cached_prompt_text_tokens'
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readNumberPath(source: unknown, path: string[]): NumberLookupResult {
  if (!isRecord(source) || path.length === 0) {
    return { found: false, value: null };
  }

  let cursor: unknown = source;

  for (let index = 0; index < path.length; index += 1) {
    if (!isRecord(cursor)) {
      return { found: false, value: null };
    }

    const key = path[index];
    if (typeof key !== 'string') {
      return { found: false, value: null };
    }

    if (!Object.prototype.hasOwnProperty.call(cursor, key)) {
      return { found: false, value: null };
    }

    const value = cursor[key];
    if (index === path.length - 1) {
      return { found: true, value: toNumeric(value) };
    }

    cursor = value;
  }

  return { found: false, value: null };
}

function firstNumber(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function resolveHost(baseUrl: string): string {
  const normalized = (baseUrl ?? '').trim();
  if (!normalized) {
    return '';
  }

  try {
    return new URL(normalized).host.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

export function resolveProviderUsageProfile(
  providerType: RuntimeProviderType,
  baseUrl: string
): ProviderUsageProfile {
  if (providerType === 'openai') {
    return 'openai';
  }

  if (providerType === 'openrouter') {
    return 'openrouter';
  }

  if (providerType === 'anthropic') {
    return 'anthropic';
  }

  const host = resolveHost(baseUrl);
  if (!host) {
    return 'unknown';
  }

  if (host.includes('api.deepseek.com')) {
    return 'deepseek';
  }

  if (host.includes('api.x.ai')) {
    return 'xai';
  }

  if (host.includes('dashscope.aliyuncs.com')) {
    return 'qwen';
  }

  if (host.includes('api.minimax.io')) {
    return 'minimax';
  }

  if (host.includes('generativelanguage.googleapis.com') || host.includes('aiplatform.googleapis.com')) {
    return 'gemini';
  }

  if (host.includes('api.mistral.ai')) {
    return 'mistral';
  }

  if (host.includes('api.openai.com')) {
    return 'openai';
  }

  if (host.includes('openrouter.ai')) {
    return 'openrouter';
  }

  if (host.includes('api.anthropic.com')) {
    return 'anthropic';
  }

  return 'unknown';
}

function buildRawUsagePayload(responseRecord: Record<string, unknown> | null): unknown {
  if (!responseRecord) {
    return null;
  }

  const payload: Record<string, unknown> = {};

  for (const key of RAW_USAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(responseRecord, key)) {
      payload[key] = responseRecord[key];
    }
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

export function normalizeRuntimeTokenUsage(input: UsageNormalizationInput): RuntimeTokenUsage {
  const responseRecord = isRecord(input.response) ? input.response : null;
  const profile = resolveProviderUsageProfile(input.providerType, input.baseUrl);

  const inputTokens = firstNumber(
    readNumberPath(responseRecord, ['usage', 'prompt_tokens']).value,
    readNumberPath(responseRecord, ['usage', 'input_tokens']).value,
    readNumberPath(responseRecord, ['input_tokens']).value,
    readNumberPath(responseRecord, ['usageMetadata', 'promptTokenCount']).value,
    readNumberPath(responseRecord, ['usageMetadata', 'inputTokenCount']).value
  );
  const outputTokens = firstNumber(
    readNumberPath(responseRecord, ['usage', 'completion_tokens']).value,
    readNumberPath(responseRecord, ['usage', 'output_tokens']).value,
    readNumberPath(responseRecord, ['output_tokens']).value,
    readNumberPath(responseRecord, ['usageMetadata', 'candidatesTokenCount']).value,
    readNumberPath(responseRecord, ['usageMetadata', 'outputTokenCount']).value
  );
  const totalTokensRaw = firstNumber(
    readNumberPath(responseRecord, ['usage', 'total_tokens']).value,
    readNumberPath(responseRecord, ['usage', 'totalTokens']).value,
    readNumberPath(responseRecord, ['total_tokens']).value,
    readNumberPath(responseRecord, ['usageMetadata', 'totalTokenCount']).value
  );
  const totalTokens =
    totalTokensRaw !== null
      ? totalTokensRaw
      : inputTokens !== null && outputTokens !== null
        ? inputTokens + outputTokens
        : null;

  let cachedInputTokens: number | null = null;
  let cacheReadTokens: number | null = null;
  let cacheWriteTokens: number | null = null;
  let cacheMissTokens: number | null = null;
  let officialMappingRecognized = false;
  let fallbackMappingRecognized = false;

  if (profile === 'openai') {
    const cached = readNumberPath(responseRecord, ['usage', 'prompt_tokens_details', 'cached_tokens']);
    if (cached.found) {
      officialMappingRecognized = true;
      cachedInputTokens = cached.value;
    }
  } else if (profile === 'openrouter') {
    const cached = readNumberPath(responseRecord, ['usage', 'prompt_tokens_details', 'cached_tokens']);
    const cacheWrite = readNumberPath(responseRecord, ['usage', 'prompt_tokens_details', 'cache_write_tokens']);
    if (cached.found || cacheWrite.found) {
      officialMappingRecognized = true;
      cachedInputTokens = cached.value;
      cacheWriteTokens = cacheWrite.value;
    }
  } else if (profile === 'gemini') {
    const cached = readNumberPath(responseRecord, ['usageMetadata', 'cachedContentTokenCount']);
    if (cached.found) {
      officialMappingRecognized = true;
      cachedInputTokens = cached.value;
    }
  } else if (profile === 'anthropic') {
    const cacheRead = readNumberPath(responseRecord, ['usage', 'cache_read_input_tokens']);
    const cacheWrite = readNumberPath(responseRecord, ['usage', 'cache_creation_input_tokens']);
    if (cacheRead.found || cacheWrite.found) {
      officialMappingRecognized = true;
      cacheReadTokens = cacheRead.value;
      cacheWriteTokens = cacheWrite.value;
      cachedInputTokens = cacheRead.value;
    }
  } else if (profile === 'deepseek') {
    const cacheHit = readNumberPath(responseRecord, ['usage', 'prompt_cache_hit_tokens']);
    const cacheMiss = readNumberPath(responseRecord, ['usage', 'prompt_cache_miss_tokens']);
    if (cacheHit.found || cacheMiss.found) {
      officialMappingRecognized = true;
      cachedInputTokens = cacheHit.value;
      cacheMissTokens = cacheMiss.value;
    }
  } else if (profile === 'xai') {
    const xaiCached = readNumberPath(responseRecord, ['usage', 'cached_prompt_text_tokens']);
    const compatibleCached = readNumberPath(responseRecord, ['usage', 'prompt_tokens_details', 'cached_tokens']);
    if (xaiCached.found || compatibleCached.found) {
      officialMappingRecognized = true;
      cachedInputTokens = firstNumber(xaiCached.value, compatibleCached.value);
    }
  } else if (profile === 'qwen') {
    const topCached = readNumberPath(responseRecord, ['cached_tokens']);
    const nestedCached = readNumberPath(responseRecord, ['usage', 'input_tokens_details', 'cached_tokens']);
    const topCacheWrite = readNumberPath(responseRecord, ['cache_creation_input_tokens']);
    const nestedCacheWrite = readNumberPath(responseRecord, ['usage', 'cache_creation_input_tokens']);
    if (topCached.found || nestedCached.found || topCacheWrite.found || nestedCacheWrite.found) {
      officialMappingRecognized = true;
      cachedInputTokens = firstNumber(nestedCached.value, topCached.value);
      cacheWriteTokens = firstNumber(nestedCacheWrite.value, topCacheWrite.value);
    }
  } else if (profile === 'minimax') {
    const passiveCached = readNumberPath(responseRecord, ['usage', 'prompt_tokens_details', 'cached_tokens']);
    const cacheRead = readNumberPath(responseRecord, ['usage', 'cache_read_input_tokens']);
    const cacheWrite = readNumberPath(responseRecord, ['usage', 'cache_creation_input_tokens']);
    if (passiveCached.found || cacheRead.found || cacheWrite.found) {
      officialMappingRecognized = true;
      cacheReadTokens = cacheRead.value;
      cacheWriteTokens = cacheWrite.value;
      cachedInputTokens = firstNumber(cacheRead.value, passiveCached.value);
    }
  }

  if (
    !officialMappingRecognized &&
    (input.providerType === 'openai-compatible' || input.providerType === 'custom')
  ) {
    const fallbackCachedCompatible = readNumberPath(responseRecord, ['usage', 'prompt_tokens_details', 'cached_tokens']);
    const fallbackCachedInputDetail = readNumberPath(responseRecord, ['usage', 'input_tokens_details', 'cached_tokens']);
    const fallbackCachedPrompt = readNumberPath(responseRecord, ['usage', 'cached_prompt_text_tokens']);
    const fallbackCacheReadUsage = readNumberPath(responseRecord, ['usage', 'cache_read_input_tokens']);
    const fallbackCacheReadTop = readNumberPath(responseRecord, ['cache_read_input_tokens']);
    const fallbackCacheWriteUsage = readNumberPath(responseRecord, ['usage', 'cache_creation_input_tokens']);
    const fallbackCacheWriteTop = readNumberPath(responseRecord, ['cache_creation_input_tokens']);
    const fallbackCacheHitUsage = readNumberPath(responseRecord, ['usage', 'prompt_cache_hit_tokens']);
    const fallbackCacheHitTop = readNumberPath(responseRecord, ['prompt_cache_hit_tokens']);
    const fallbackCacheMissUsage = readNumberPath(responseRecord, ['usage', 'prompt_cache_miss_tokens']);
    const fallbackCacheMissTop = readNumberPath(responseRecord, ['prompt_cache_miss_tokens']);
    const fallbackTopCached = readNumberPath(responseRecord, ['cached_tokens']);

    fallbackMappingRecognized = Boolean(
      fallbackCachedCompatible.found ||
        fallbackCachedInputDetail.found ||
        fallbackCachedPrompt.found ||
        fallbackCacheReadUsage.found ||
        fallbackCacheReadTop.found ||
        fallbackCacheWriteUsage.found ||
        fallbackCacheWriteTop.found ||
        fallbackCacheHitUsage.found ||
        fallbackCacheHitTop.found ||
        fallbackCacheMissUsage.found ||
        fallbackCacheMissTop.found ||
        fallbackTopCached.found
    );

    if (fallbackMappingRecognized) {
      cacheReadTokens = firstNumber(fallbackCacheReadUsage.value, fallbackCacheReadTop.value);
      cacheWriteTokens = firstNumber(fallbackCacheWriteUsage.value, fallbackCacheWriteTop.value);
      cacheMissTokens = firstNumber(fallbackCacheMissUsage.value, fallbackCacheMissTop.value);

      cachedInputTokens = firstNumber(
        cacheReadTokens,
        fallbackCacheHitUsage.value,
        fallbackCacheHitTop.value,
        fallbackCachedPrompt.value,
        fallbackCachedCompatible.value,
        fallbackCachedInputDetail.value,
        fallbackTopCached.value
      );
    }
  }

  if (cacheReadTokens !== null) {
    cachedInputTokens = cacheReadTokens;
  }

  const cacheHitObserved = (cachedInputTokens ?? 0) > 0 || (cacheReadTokens ?? 0) > 0;
  const cacheMetricsSupported = officialMappingRecognized;
  const cacheMetricsSource: CacheMetricsSource = officialMappingRecognized
    ? 'official'
    : fallbackMappingRecognized
      ? 'fallback'
      : 'none';

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheMissTokens,
    cacheHitObserved,
    cacheMetricsSupported,
    cacheMetricsSource,
    rawUsage: buildRawUsagePayload(responseRecord)
  };
}
