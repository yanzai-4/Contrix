import type {
  CreateProviderRequest,
  ProviderConnectionTestResponse,
  ProviderHeaders,
  ProviderSummary,
  ProviderType,
  UpdateProviderRequest
} from '@contrix/spec-core';

export interface ProviderRecord {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  apiKeyEncrypted: string;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: number;
  headers: ProviderHeaders;
  notes: string | null;
  lastConnectionTest: ProviderConnectionTestResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInsertInput {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  apiKeyEncrypted: string;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: number;
  headers: ProviderHeaders;
  notes: string | null;
  lastConnectionTest: ProviderConnectionTestResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderUpdateInput {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  apiKeyEncrypted: string;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: number;
  headers: ProviderHeaders;
  notes: string | null;
  lastConnectionTest: ProviderConnectionTestResponse | null;
  updatedAt: string;
}

export interface ProviderCreateInput {
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  apiKey: string;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: number;
  headers: ProviderHeaders;
  notes: string | null;
}

export interface ProviderUpdateNormalizedInput {
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  apiKey: string | null;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: number;
  headers: ProviderHeaders;
  notes: string | null;
}

export type ProviderCreatePayload = CreateProviderRequest;
export type ProviderUpdatePayload = UpdateProviderRequest;
export type ProviderPublicRecord = ProviderSummary;
