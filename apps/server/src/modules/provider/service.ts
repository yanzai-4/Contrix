import { randomUUID } from 'node:crypto';
import { providerTypes } from '@contrix/spec-core';
import type {
  ProviderConnectionTestResponse,
  ProviderSummary,
  ProviderType
} from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ProviderModuleError } from './errors.js';
import type {
  ProviderCreateInput,
  ProviderCreatePayload,
  ProviderRecord,
  ProviderUpdateNormalizedInput,
  ProviderUpdatePayload
} from './model.js';
import { ProviderRegistry } from './registry.js';
import { ProviderRepository } from './repository.js';
import { encryptApiKey } from './security.js';
import { testProviderConnectivity } from './request-client.js';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const DEFAULT_BASE_URL_BY_TYPE: Record<ProviderType, string | null> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  'openai-compatible': null,
  custom: null
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized : null;
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  const normalized = normalizeText(baseUrl);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, '');
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    throw new ProviderModuleError('INVALID_HEADERS', 400, 'Headers must be an object.');
  }

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (!key.trim()) {
      throw new ProviderModuleError('INVALID_HEADERS', 400, 'Header key cannot be empty.');
    }

    normalized[key] = String(value);
  }

  return normalized;
}

function resolveBaseUrl(type: ProviderType, explicitBaseUrl: string | null): string {
  const fallback = DEFAULT_BASE_URL_BY_TYPE[type];
  const resolved = explicitBaseUrl ?? fallback;

  if (!resolved) {
    throw new ProviderModuleError(
      'BASE_URL_REQUIRED',
      400,
      `Base URL is required for provider type "${type}".`
    );
  }

  return resolved;
}

function isUniqueNameError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }

  const message = String((error as { message: unknown }).message);
  return message.includes('idx_providers_name_unique') || message.includes('providers.name');
}

export class ProviderService {
  private readonly repository: ProviderRepository;
  private readonly registry: ProviderRegistry;

  constructor(db: SQLiteDatabase) {
    this.repository = new ProviderRepository(db);
    this.registry = new ProviderRegistry(db);
  }

  listProviders(): ProviderSummary[] {
    return this.registry.listSummaries();
  }

  getProviderById(id: string): ProviderSummary {
    const provider = this.registry.getSummary(id);

    if (!provider) {
      throw new ProviderModuleError('PROVIDER_NOT_FOUND', 404, 'Provider not found.');
    }

    return provider;
  }

  createProvider(payload: ProviderCreatePayload): ProviderSummary {
    const normalized = this.normalizeCreateInput(payload);
    this.ensureUniqueProviderName(normalized.name);

    const now = new Date().toISOString();

    try {
      const created = this.repository.create({
        id: randomUUID(),
        name: normalized.name,
        type: normalized.type,
        baseUrl: normalized.baseUrl,
        apiKeyEncrypted: encryptApiKey(normalized.apiKey),
        defaultModel: normalized.defaultModel,
        supportsStructuredOutput: normalized.supportsStructuredOutput,
        timeoutMs: normalized.timeoutMs,
        headers: normalized.headers,
        notes: normalized.notes,
        createdAt: now,
        updatedAt: now
      });

      return this.getProviderById(created.id);
    } catch (error) {
      if (isUniqueNameError(error)) {
        throw new ProviderModuleError('PROVIDER_NAME_EXISTS', 409, 'A provider with this name already exists.');
      }

      throw error;
    }
  }

  updateProvider(id: string, payload: ProviderUpdatePayload): ProviderSummary {
    const existing = this.requireExistingProvider(id);
    const normalized = this.normalizeUpdateInput(payload, existing);

    this.ensureUniqueProviderName(normalized.name, id);

    const apiKeyEncrypted = normalized.apiKey
      ? encryptApiKey(normalized.apiKey)
      : existing.apiKeyEncrypted;

    const updated = this.repository.update({
      id,
      name: normalized.name,
      type: normalized.type,
      baseUrl: normalized.baseUrl,
      apiKeyEncrypted,
      defaultModel: normalized.defaultModel,
      supportsStructuredOutput: normalized.supportsStructuredOutput,
      timeoutMs: normalized.timeoutMs,
      headers: normalized.headers,
      notes: normalized.notes,
      updatedAt: new Date().toISOString()
    });

    if (!updated) {
      throw new ProviderModuleError('PROVIDER_NOT_FOUND', 404, 'Provider not found.');
    }

    return this.getProviderById(id);
  }

  deleteProvider(id: string): void {
    this.requireExistingProvider(id);

    const deleted = this.repository.deleteById(id);

    if (!deleted) {
      throw new ProviderModuleError('PROVIDER_NOT_FOUND', 404, 'Provider not found.');
    }
  }

  async testProviderConnection(id: string): Promise<ProviderConnectionTestResponse> {
    const provider = this.registry.resolveByKey(id);

    if (!provider) {
      throw new ProviderModuleError('PROVIDER_NOT_FOUND', 404, 'Provider not found.');
    }

    const apiKey = provider.runtimeApiKey?.trim();
    if (!apiKey) {
      throw new ProviderModuleError(
        'API_KEY_MISSING',
        400,
        'Provider API key is not configured. Set it in Settings > Provider Settings.'
      );
    }

    const baseUrl = resolveBaseUrl(provider.type, provider.baseUrl);

    return testProviderConnectivity({
      providerId: provider.providerKey,
      type: provider.type,
      baseUrl,
      apiKey,
      timeoutMs: provider.timeoutMs,
      headers: provider.headers
    });
  }

  private requireExistingProvider(id: string): ProviderRecord {
    const record = this.repository.findById(id);
    if (!record) {
      throw new ProviderModuleError('PROVIDER_NOT_FOUND', 404, 'Provider not found.');
    }

    return record;
  }

  private ensureUniqueProviderName(name: string, currentProviderId?: string): void {
    const normalizedName = name.trim().toLowerCase();
    const conflict = this.registry
      .listSummaries()
      .find(
        (provider) =>
          provider.name.trim().toLowerCase() === normalizedName && provider.id !== currentProviderId
      );

    if (conflict) {
      throw new ProviderModuleError(
        'PROVIDER_NAME_EXISTS',
        409,
        'A provider with this name already exists.'
      );
    }
  }

  private normalizeCreateInput(payload: ProviderCreatePayload): ProviderCreateInput {
    const name = payload.name?.trim();

    if (!name) {
      throw new ProviderModuleError('INVALID_NAME', 400, 'Provider name is required.');
    }

    const type = payload.type;
    if (!type || !providerTypes.includes(type)) {
      throw new ProviderModuleError('INVALID_TYPE', 400, 'Provider type is invalid.');
    }

    const apiKey = payload.apiKey?.trim();
    if (!apiKey) {
      throw new ProviderModuleError('API_KEY_MISSING', 400, 'API key is required.');
    }

    const defaultModel = payload.defaultModel?.trim();
    if (!defaultModel) {
      throw new ProviderModuleError('DEFAULT_MODEL_REQUIRED', 400, 'Default model is required.');
    }

    const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ProviderModuleError('INVALID_TIMEOUT', 400, 'timeoutMs must be a positive number.');
    }

    if (timeoutMs > MAX_TIMEOUT_MS) {
      throw new ProviderModuleError(
        'INVALID_TIMEOUT',
        400,
        `timeoutMs must be less than or equal to ${MAX_TIMEOUT_MS}.`
      );
    }

    const supportsStructuredOutput = Boolean(payload.supportsStructuredOutput);
    const headers = payload.headers ? normalizeHeaders(payload.headers) : {};
    const notes = normalizeText(payload.notes);
    const baseUrl = normalizeBaseUrl(payload.baseUrl);

    if ((type === 'openai-compatible' || type === 'custom') && !baseUrl) {
      throw new ProviderModuleError(
        'BASE_URL_REQUIRED',
        400,
        `Base URL is required for provider type "${type}".`
      );
    }

    return {
      name,
      type,
      baseUrl,
      apiKey,
      defaultModel,
      supportsStructuredOutput,
      timeoutMs: Math.floor(timeoutMs),
      headers,
      notes
    };
  }

  private normalizeUpdateInput(
    payload: ProviderUpdatePayload,
    existing: ProviderRecord
  ): ProviderUpdateNormalizedInput {
    const name = payload.name?.trim();
    if (!name) {
      throw new ProviderModuleError('INVALID_NAME', 400, 'Provider name is required.');
    }

    const type = payload.type;
    if (!type || !providerTypes.includes(type)) {
      throw new ProviderModuleError('INVALID_TYPE', 400, 'Provider type is invalid.');
    }

    const apiKey = payload.apiKey?.trim() || null;
    const defaultModel = payload.defaultModel?.trim();
    if (!defaultModel) {
      throw new ProviderModuleError('DEFAULT_MODEL_REQUIRED', 400, 'Default model is required.');
    }

    const timeoutMs = payload.timeoutMs ?? existing.timeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ProviderModuleError('INVALID_TIMEOUT', 400, 'timeoutMs must be a positive number.');
    }

    if (timeoutMs > MAX_TIMEOUT_MS) {
      throw new ProviderModuleError(
        'INVALID_TIMEOUT',
        400,
        `timeoutMs must be less than or equal to ${MAX_TIMEOUT_MS}.`
      );
    }

    const supportsStructuredOutput =
      payload.supportsStructuredOutput === undefined
        ? existing.supportsStructuredOutput
        : Boolean(payload.supportsStructuredOutput);
    const headers = payload.headers ? normalizeHeaders(payload.headers) : existing.headers;
    const notes = normalizeText(payload.notes);
    const baseUrl = normalizeBaseUrl(payload.baseUrl);

    if ((type === 'openai-compatible' || type === 'custom') && !baseUrl) {
      throw new ProviderModuleError(
        'BASE_URL_REQUIRED',
        400,
        `Base URL is required for provider type "${type}".`
      );
    }

    return {
      name,
      type,
      baseUrl,
      apiKey,
      defaultModel,
      supportsStructuredOutput,
      timeoutMs: Math.floor(timeoutMs),
      headers,
      notes
    };
  }
}
