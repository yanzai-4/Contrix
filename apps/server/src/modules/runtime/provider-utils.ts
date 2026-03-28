import type {
  EndpointSpec,
  EndpointSummary,
  ProviderType
} from '@contrix/spec-core';
import type {
  RuntimeProviderConfig,
  RuntimeProviderType,
  StructuredOutputRequestMode
} from '@contrix/runtime-core';
import type { ProviderRegistryResolved } from '../provider/registry.js';
import { RuntimeModuleError } from './errors.js';

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30000;
export const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

const DEFAULT_ANTHROPIC_MAX_TOKENS = 1024;
const ANTHROPIC_CACHE_CONTROL_HEADER = 'x-contrix-anthropic-cache-control';
const ANTHROPIC_MAX_TOKENS_HEADER = 'x-contrix-anthropic-max-tokens';
const DEFAULT_BASE_URL_BY_PROVIDER: Partial<Record<RuntimeProviderType, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com/v1'
};
const SENSITIVE_HEADER_PATTERN = /(authorization|api[-_]?key|token|secret|password)/i;

export interface ProviderEvaluation {
  ok: boolean;
  providerType: RuntimeProviderType | null;
  issue: string | null;
}

export function resolveResponseFormatMode(spec: EndpointSpec): StructuredOutputRequestMode {
  const strategy = spec.structuredOutputStrategy;
  if (!strategy.enabled) {
    return 'none';
  }

  return strategy.mode === 'provider-native' ? 'json_object' : 'none';
}

export function resolveMaxProviderCalls(maxApiRetries: number, spec: EndpointSpec): number {
  const retryFromEndpoint = Math.max(0, maxApiRetries);
  const retryFromRepair = spec.repairPolicy.enableRepairRetry
    ? Math.max(0, spec.repairPolicy.maxRepairRounds)
    : 0;
  const total = 1 + Math.max(retryFromEndpoint, retryFromRepair);

  return Math.min(3, total);
}

export function normalizeProviderType(type: ProviderType): RuntimeProviderType {
  return type;
}

export function resolveProviderBaseUrl(providerType: RuntimeProviderType, baseUrl: string | null): string {
  const normalized = baseUrl?.trim().replace(/\/+$/, '') ?? '';
  if (normalized) {
    return normalized;
  }

  const fallback = DEFAULT_BASE_URL_BY_PROVIDER[providerType];
  if (fallback) {
    return fallback;
  }

  throw new RuntimeModuleError(
    'PROVIDER_NOT_FOUND',
    'resource_load',
    `Provider baseUrl is required for provider type "${providerType}".`,
    { statusCode: 400 }
  );
}

export function resolveNamespaceFromRoutePreview(endpoint: EndpointSummary): string {
  const normalizedRoute = endpoint.routePreview.trim().replace(/^\/+|\/+$/g, '');
  const routeSegments = normalizedRoute.split('/').filter(Boolean);
  const pathSegments = endpoint.pathSlug
    .trim()
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!routeSegments.length || !pathSegments.length) {
    throw new RuntimeModuleError(
      'ENDPOINT_NOT_FOUND',
      'route_resolve',
      'Unable to resolve namespace from endpoint route preview.',
      { statusCode: 500 }
    );
  }

  const namespaceIndex = routeSegments.length - pathSegments.length - 1;
  if (namespaceIndex < 0) {
    throw new RuntimeModuleError(
      'ENDPOINT_NOT_FOUND',
      'route_resolve',
      'Unable to resolve namespace from endpoint route preview.',
      { statusCode: 500 }
    );
  }

  for (let index = 0; index < pathSegments.length; index += 1) {
    const expected = pathSegments[index] ?? '';
    const actual = routeSegments[namespaceIndex + index + 1] ?? '';
    if (expected.toLowerCase() !== actual.toLowerCase()) {
      throw new RuntimeModuleError(
        'ENDPOINT_NOT_FOUND',
        'route_resolve',
        'Unable to resolve namespace from endpoint route preview.',
        { statusCode: 500 }
      );
    }
  }

  const namespace = routeSegments[namespaceIndex] ?? '';
  if (!namespace.trim()) {
    throw new RuntimeModuleError(
      'ENDPOINT_NOT_FOUND',
      'route_resolve',
      'Unable to resolve namespace from endpoint route preview.',
      { statusCode: 500 }
    );
  }

  return namespace;
}

export function normalizeMaxApiRetries(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

export function normalizeTimeout(endpointTimeoutMs: number | null, providerTimeoutMs: number): number {
  if (typeof endpointTimeoutMs === 'number' && Number.isFinite(endpointTimeoutMs) && endpointTimeoutMs > 0) {
    return Math.floor(endpointTimeoutMs);
  }

  if (Number.isFinite(providerTimeoutMs) && providerTimeoutMs > 0) {
    return Math.floor(providerTimeoutMs);
  }

  return DEFAULT_PROVIDER_TIMEOUT_MS;
}

export function normalizeHeaderPreview(headers: Record<string, string>): Record<string, string> {
  const preview: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    preview[key] = SENSITIVE_HEADER_PATTERN.test(key) ? '****' : value;
  }

  if (!preview.Authorization && !preview.authorization) {
    preview.Authorization = 'Bearer ****';
  }

  return preview;
}

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function resolveAnthropicMaxTokensFromHeaders(headers: Record<string, string>): number {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== ANTHROPIC_MAX_TOKENS_HEADER) {
      continue;
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return DEFAULT_ANTHROPIC_MAX_TOKENS;
}

export function resolveAnthropicCacheControlEnabled(headers: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === ANTHROPIC_CACHE_CONTROL_HEADER) {
      return isTruthyFlag(value);
    }
  }

  return false;
}

export function resolveModel(
  overrideModel: string | undefined,
  endpointModel: string | null,
  providerDefaultModel: string | null
): string {
  const override = overrideModel?.trim() ?? '';
  if (override) {
    return override;
  }

  const endpoint = endpointModel?.trim() ?? '';
  if (endpoint) {
    return endpoint;
  }

  const providerModel = providerDefaultModel?.trim() ?? '';
  if (providerModel) {
    return providerModel;
  }

  throw new RuntimeModuleError(
    'MODEL_NOT_CONFIGURED',
    'resource_load',
    'No model configured. Set overrideModel, endpoint.model, or provider.defaultModel.',
    { statusCode: 400 }
  );
}

export function resolveModelMaybe(
  overrideModel: string | undefined,
  endpointModel: string | null,
  providerDefaultModel: string | null
): string | null {
  const override = overrideModel?.trim() ?? '';
  if (override) {
    return override;
  }

  const endpoint = endpointModel?.trim() ?? '';
  if (endpoint) {
    return endpoint;
  }

  const providerModel = providerDefaultModel?.trim() ?? '';
  return providerModel || null;
}

export function evaluateProviderReadiness(
  providerId: string | null,
  providerRecord: ProviderRegistryResolved | null
): ProviderEvaluation {
  if (!providerId) {
    return {
      ok: false,
      providerType: null,
      issue: 'Endpoint provider is not configured.'
    };
  }

  if (!providerRecord) {
    return {
      ok: false,
      providerType: null,
      issue: 'Provider record not found. Configure provider in Settings > Provider Settings.'
    };
  }

  try {
    const providerType = normalizeProviderType(providerRecord.type);
    const apiKey = providerRecord.runtimeApiKey ?? '';
    if (!apiKey.trim()) {
      return {
        ok: false,
        providerType,
        issue: 'Provider API key is missing. Configure it in Settings > Provider Settings.'
      };
    }

    resolveProviderBaseUrl(providerType, providerRecord.baseUrl);

    return {
      ok: true,
      providerType,
      issue: null
    };
  } catch (error) {
    return {
      ok: false,
      providerType: normalizeProviderType(providerRecord.type),
      issue: error instanceof Error ? error.message : 'Provider configuration is invalid.'
    };
  }
}

export function toRuntimeProviderConfig(providerRecord: ProviderRegistryResolved): RuntimeProviderConfig {
  const apiKey = providerRecord.runtimeApiKey ?? '';

  if (!apiKey.trim()) {
    throw new RuntimeModuleError('PROVIDER_NOT_FOUND', 'resource_load', 'Provider API key is missing.', {
      statusCode: 400
    });
  }

  const providerType = normalizeProviderType(providerRecord.type);
  const baseUrl = resolveProviderBaseUrl(providerType, providerRecord.baseUrl);

  return {
    providerId: providerRecord.providerKey,
    providerType,
    baseUrl,
    apiKey,
    headers: providerRecord.headers,
    timeoutMs: providerRecord.timeoutMs
  };
}
