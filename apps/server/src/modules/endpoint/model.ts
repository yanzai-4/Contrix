import type {
  CreateEndpointRequest,
  EndpointSchemaDocument,
  EndpointSummary,
  InputMode,
  SpecStatus,
  UpdateEndpointRequest
} from '@contrix/spec-core';

export type EndpointRecord = EndpointSummary;

export interface EndpointInsertInput {
  id: string;
  projectId: string;
  groupId: string | null;
  providerId: string;
  name: string;
  pathSlug: string;
  model: string | null;
  endpointInstruction: string | null;
  description: string | null;
  rules: string | null;
  examples: string | null;
  tone: string | null;
  fallback: string | null;
  validation: string | null;
  timeoutMs: number | null;
  enableStructuredOutput: boolean;
  enableDeterministicRepair: boolean;
  maxApiRetries: number;
  maxRepairRounds: number;
  temperature: number | null;
  topP: number | null;
  specStatus: SpecStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointUpdateInput {
  id: string;
  groupId: string | null;
  providerId: string;
  name: string;
  pathSlug: string;
  model: string | null;
  endpointInstruction: string | null;
  description: string | null;
  rules: string | null;
  examples: string | null;
  tone: string | null;
  fallback: string | null;
  validation: string | null;
  timeoutMs: number | null;
  enableStructuredOutput: boolean;
  enableDeterministicRepair: boolean;
  maxApiRetries: number;
  maxRepairRounds: number;
  temperature: number | null;
  topP: number | null;
  specStatus: SpecStatus;
  updatedAt: string;
}

export interface EndpointListFilters {
  projectId?: string;
  groupId?: string;
}

export interface EndpointSchemaUpdateInput {
  id: string;
  inputMode: InputMode;
  inputSchema: string | null;
  outputSchema: string;
  schemaUpdatedAt: string;
  specStatus: SpecStatus;
}

export type EndpointCreatePayload = CreateEndpointRequest;
export type EndpointUpdatePayload = UpdateEndpointRequest;
export type EndpointSchemaRecord = EndpointSchemaDocument;
