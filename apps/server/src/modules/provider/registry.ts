import type {
  ProviderSummary,
  ProviderType
} from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import type { ProviderRecord } from './model.js';
import { ProviderRepository } from './repository.js';
import { decryptApiKey, maskApiKey } from './security.js';

const PROVIDER_DEFAULTS_BY_TYPE: Record<
  ProviderType,
  {
    baseUrl: string | null;
    supportsStreaming: boolean;
  }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    supportsStreaming: true
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    supportsStreaming: true
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    supportsStreaming: true
  },
  'openai-compatible': {
    baseUrl: null,
    supportsStreaming: true
  },
  custom: {
    baseUrl: null,
    supportsStreaming: false
  }
};

export interface ProviderRegistryResolved {
  providerKey: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  timeoutMs: number;
  maxRetries: number | null;
  headers: Record<string, string>;
  notes: string | null;
  hasApiKey: boolean;
  maskedApiKey: string;
  createdAt: string;
  updatedAt: string;
  runtimeApiKey: string | null;
}

function resolveBaseUrlByType(type: ProviderType, baseUrl: string | null): string | null {
  if (baseUrl) {
    return baseUrl;
  }

  return PROVIDER_DEFAULTS_BY_TYPE[type].baseUrl;
}

function maskSecret(apiKey: string | null): { hasApiKey: boolean; maskedApiKey: string } {
  if (!apiKey?.trim()) {
    return {
      hasApiKey: false,
      maskedApiKey: 'not-set'
    };
  }

  return {
    hasApiKey: true,
    maskedApiKey: maskApiKey(apiKey)
  };
}

function toSummary(record: ProviderRegistryResolved): ProviderSummary {
  return {
    id: record.providerKey,
    providerKey: record.providerKey,
    name: record.name,
    type: record.type,
    baseUrl: record.baseUrl,
    defaultModel: record.defaultModel,
    supportsStructuredOutput: record.supportsStructuredOutput,
    supportsStreaming: record.supportsStreaming,
    timeoutMs: record.timeoutMs,
    maxRetries: record.maxRetries,
    headers: record.headers,
    notes: record.notes,
    maskedApiKey: record.maskedApiKey,
    hasApiKey: record.hasApiKey,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function fromDbRecord(row: ProviderRecord): ProviderRegistryResolved {
  let decryptedApiKey: string | null = null;
  try {
    decryptedApiKey = decryptApiKey(row.apiKeyEncrypted);
  } catch {
    decryptedApiKey = null;
  }

  const secret = maskSecret(decryptedApiKey);
  const defaults = PROVIDER_DEFAULTS_BY_TYPE[row.type];

  return {
    providerKey: row.id,
    name: row.name,
    type: row.type,
    baseUrl: resolveBaseUrlByType(row.type, row.baseUrl),
    defaultModel: row.defaultModel,
    supportsStructuredOutput: row.supportsStructuredOutput,
    supportsStreaming: defaults.supportsStreaming,
    timeoutMs: row.timeoutMs,
    maxRetries: null,
    headers: row.headers,
    notes: row.notes,
    hasApiKey: secret.hasApiKey,
    maskedApiKey: secret.maskedApiKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    runtimeApiKey: decryptedApiKey
  };
}

export class ProviderRegistry {
  private readonly repository: ProviderRepository;

  constructor(db: SQLiteDatabase) {
    this.repository = new ProviderRepository(db);
  }

  listSummaries(): ProviderSummary[] {
    return this.listResolved().map(toSummary);
  }

  getSummary(providerReference: string): ProviderSummary | null {
    const resolved = this.resolveByKey(providerReference);
    return resolved ? toSummary(resolved) : null;
  }

  hasProvider(providerReference: string): boolean {
    return Boolean(this.resolveByKey(providerReference));
  }

  resolve(providerReference: string): ProviderRegistryResolved | null {
    const byKey = this.resolveByKey(providerReference);
    if (byKey) {
      return byKey;
    }

    const normalizedReference = providerReference.trim();
    if (!normalizedReference) {
      return null;
    }

    const providers = this.listResolved();
    const byName = providers
      .filter((provider) => provider.name.toLowerCase() === normalizedReference.toLowerCase())
      .sort((left, right) => left.providerKey.localeCompare(right.providerKey));

    return byName[0] ?? null;
  }

  resolveByKey(providerReference: string): ProviderRegistryResolved | null {
    const normalizedReference = providerReference.trim();
    if (!normalizedReference) {
      return null;
    }

    const providers = this.listResolved();

    const byKey = providers.find((provider) => provider.providerKey === normalizedReference);
    if (byKey) {
      return byKey;
    }

    const byCaseInsensitiveKey = providers.find(
      (provider) => provider.providerKey.toLowerCase() === normalizedReference.toLowerCase()
    );
    if (byCaseInsensitiveKey) {
      return byCaseInsensitiveKey;
    }

    return null;
  }

  private listResolved(): ProviderRegistryResolved[] {
    return this.repository
      .list()
      .map(fromDbRecord)
      .sort((left, right) => {
        const nameWeight = left.name.localeCompare(right.name);
        if (nameWeight !== 0) {
          return nameWeight;
        }

        return left.providerKey.localeCompare(right.providerKey);
      });
  }
}
