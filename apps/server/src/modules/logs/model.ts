import type {
  CacheMetricsSource,
  PromptStatus,
  RuntimeErrorStage,
  RuntimeErrorType,
  RuntimeInputMode,
  RuntimeOutputSource,
  RuntimeProviderType,
  RuntimeReadinessStatus,
  RuntimeResponse,
  RuntimeSpecStatus,
  RuntimeTokenUsage
} from '@contrix/runtime-core';

export interface CallLogRecord {
  id: string;
  runId: string;
  requestId: string;
  projectKey: string | null;
  projectName: string | null;
  endpointKey: string | null;
  endpointName: string | null;
  providerKey: string | null;
  providerLabel: string | null;
  model: string | null;
  success: boolean;
  outputSource: RuntimeOutputSource | null;
  structuredOutputTriggered: boolean;
  repairTriggered: boolean;
  apiCallCount: number;
  attemptCount: number;
  repairCount: number;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  cacheMissTokens: number | null;
  cacheHitObserved: boolean | null;
  cacheMetricsSupported: boolean | null;
  cacheMetricsSource: CacheMetricsSource | null;
  rawUsage: unknown | null;
  errorType: RuntimeErrorType | null;
  failureStage: RuntimeErrorStage | null;
  promptHash: string | null;
  inputPreview: string | null;
  outputPreview: string | null;
  debugSnapshotAvailable: boolean;
  createdAt: string;
}

export interface CallLogDebugSnapshotRecord {
  id: string;
  callLogId: string;
  payload: RuntimeResponse | unknown;
  createdAt: string;
}

export interface CallLogListFilters {
  project?: string;
  endpoint?: string;
  provider?: string;
  success?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export interface CallLogInsertInput {
  call: CallLogRecord;
  debugSnapshot: CallLogDebugSnapshotRecord | null;
}

export interface RuntimeLogWriteContext {
  runId: string;
  requestId: string;
  projectId: string | null;
  projectName: string | null;
  groupId: string | null;
  groupName: string | null;
  endpointId: string | null;
  endpointName: string | null;
  namespace: string | null;
  pathSlug: string | null;
  providerId: string | null;
  providerName: string | null;
  providerType: RuntimeProviderType | null;
  model: string | null;
  specId: string | null;
  specVersion: number | null;
  promptSnapshotId: string | null;
  promptHash: string | null;
  inputMode: RuntimeInputMode | null;
  specStatus: RuntimeSpecStatus | null;
  promptStatus: PromptStatus | null;
  runtimeReadiness: RuntimeReadinessStatus | null;
  routePreview: string | null;
  structuredOutputTriggered: boolean;
  inputText: string | null;
  inputJson: unknown;
  renderedPrompt: string | null;
}

export interface RuntimeLogWritePayload {
  context: RuntimeLogWriteContext;
  response: RuntimeResponse;
  usage: RuntimeTokenUsage;
}
