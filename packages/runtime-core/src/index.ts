export type RuntimeStatus = 'idle' | 'running' | 'failed';

export type RuntimeProviderType =
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'openai-compatible'
  | 'custom';

export type RuntimeInputMode = 'text' | 'json';
export type RuntimeSpecStatus = 'missing' | 'current' | 'stale';
export type PromptStatus = 'missing' | 'current' | 'stale' | 'compile_error';
export type RuntimeReadinessStatus = 'ready' | 'not_ready' | 'degraded';
export type PromptCompileStatus = 'running' | 'success' | 'error';
export type RuntimeOutputSource =
  | 'provider_direct_valid'
  | 'deterministic_repair'
  | 'repair_retry_valid'
  | 'repair_retry_deterministic_repair'
  | 'fallback_auto_text'
  | 'fallback_auto_json'
  | 'fallback_manual_text'
  | 'fallback_manual_json';
export type ValidationIssueSeverity = 'error' | 'warning';
export type JsonExtractionMethod = 'direct' | 'markdown_strip' | 'json_substring' | 'failed';
export type JsonExtractionConfidence = 'high' | 'medium' | 'low';
export type RuntimeAttemptSuccessStage =
  | 'provider_raw'
  | 'json_extracted'
  | 'validated'
  | 'deterministic_repaired'
  | 'repair_retry_validated'
  | 'repair_retry_repaired';
export type RuntimeAttemptErrorStage =
  | 'provider_request'
  | 'json_extraction'
  | 'validation'
  | 'deterministic_repair'
  | 'repair_retry'
  | 'runtime';
export type RepairActionType =
  | 'strip_markdown_fence'
  | 'replace_smart_quotes'
  | 'remove_trailing_commas'
  | 'extract_json_substring'
  | 'balance_brackets'
  | 'type_coercion'
  | 'field_name_mapping';
export type StructuredOutputRequestMode = 'none' | 'json_object';
export type CacheMetricsSource = 'official' | 'fallback' | 'none';

export type RuntimeErrorType =
  | 'ENDPOINT_NOT_FOUND'
  | 'SPEC_NOT_FOUND'
  | 'PROMPT_NOT_FOUND'
  | 'PROVIDER_NOT_FOUND'
  | 'MODEL_NOT_CONFIGURED'
  | 'INPUT_MODE_MISMATCH'
  | 'PROMPT_RENDER_FAILED'
  | 'ADAPTER_NOT_IMPLEMENTED'
  | 'PROVIDER_REQUEST_FAILED'
  | 'PROVIDER_TIMEOUT'
  | 'SPEC_STALE'
  | 'PROMPT_STALE'
  | 'PROMPT_COMPILE_ERROR'
  | 'RUNTIME_NOT_READY'
  | 'PREFLIGHT_FAILED'
  | 'REQUEST_PREVIEW_FAILED'
  | 'JSON_EXTRACTION_FAILED'
  | 'OUTPUT_VALIDATION_FAILED'
  | 'DETERMINISTIC_REPAIR_FAILED'
  | 'REPAIR_RETRY_FAILED'
  | 'MAX_ATTEMPTS_EXCEEDED'
  | 'RUNTIME_PROVIDER_ERROR'
  | 'RUNTIME_TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'RUNTIME_INTERNAL_ERROR';

export type RuntimeErrorStage =
  | 'route_resolve'
  | 'resource_load'
  | 'prompt_prepare'
  | 'prompt_compile'
  | 'provider_request'
  | 'response_parse'
  | 'json_extraction'
  | 'validation'
  | 'deterministic_repair'
  | 'repair_retry'
  | 'request_validation'
  | 'preflight'
  | 'preview_request'
  | 'runtime';

export interface RuntimeTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  cacheMissTokens?: number | null;
  cacheHitObserved?: boolean;
  cacheMetricsSupported?: boolean;
  cacheMetricsSource?: CacheMetricsSource;
  rawUsage?: unknown;
}

export interface ProviderResponseMeta {
  requestId?: string | null;
  model?: string | null;
  providerType?: RuntimeProviderType;
  statusCode?: number | null;
}

export interface NormalizedProviderResult {
  rawText: string;
  finishReason?: string | null;
  usage?: RuntimeTokenUsage | null;
  rawResponse?: unknown;
  providerResponseMeta?: ProviderResponseMeta;
}

export interface RuntimeError {
  type: RuntimeErrorType;
  message: string;
  stage: RuntimeErrorStage;
  attemptCount: number;
}

export interface RuntimeFailureError extends RuntimeError {
  endpointId: string | null;
  providerType: RuntimeProviderType | null;
  model: string | null;
  specVersion: number | null;
  promptHash: string | null;
  lastRawOutput: string | null;
  lastValidationIssues: ValidationIssue[];
  requestId: string;
  runId: string;
  timestamp: string;
}

export interface RuntimeFallbackMeta {
  mode: 'auto_text' | 'auto_json' | 'manual';
  sourceErrorType: RuntimeErrorType;
  sourceErrorStage: RuntimeErrorStage;
  sourceMessage: string;
  manualContentType?: 'json' | 'text' | 'empty';
  messages: {
    reason: string;
    errorType: string;
    errorStage: string;
    detail: string;
  };
  timestamp: string;
}

export interface RuntimeReadinessCheckMap {
  endpoint: boolean;
  provider: boolean;
  spec: boolean;
  prompt: boolean;
  model: boolean;
  inputMode: boolean;
}

export interface RuntimeReadinessResult {
  status: RuntimeReadinessStatus;
  checks: RuntimeReadinessCheckMap;
  issues: string[];
}

export interface ValidationIssue {
  path: string;
  keyword: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
  severity: ValidationIssueSeverity;
}

export interface ValidationResult {
  success: boolean;
  errors: ValidationIssue[];
  normalizedCandidate?: unknown;
}

export interface JsonExtractionResult {
  extractedText: string | null;
  method: JsonExtractionMethod;
  confidence: JsonExtractionConfidence;
  parseSucceeded: boolean;
  parseError: string | null;
}

export interface DeterministicRepairAction {
  type: RepairActionType;
  message: string;
}

export interface DeterministicRepairResult {
  changed: boolean;
  parseSucceeded: boolean;
  repairedText: string | null;
  candidate: unknown | null;
  actions: DeterministicRepairAction[];
  errors: string[];
  validationResult: ValidationResult | null;
}

export interface RetryAttemptMeta {
  attemptIndex: number;
  providerCallIndex: number;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  renderedPromptHash: string;
  rawProviderText: string | null;
  jsonExtraction: JsonExtractionResult | null;
  validationResult: ValidationResult | null;
  deterministicRepairResult: DeterministicRepairResult | null;
  repairPromptUsed: string | null;
  successStage: RuntimeAttemptSuccessStage | null;
  errorStage: RuntimeAttemptErrorStage | null;
  retryTriggered: boolean;
  timeoutTriggered: boolean;
  requestSummary: {
    model: string;
    timeoutMs: number;
    providerType: RuntimeProviderType;
  };
  providerResponseSummary: {
    statusCode?: number | null;
    finishReason?: string | null;
    hasRawText: boolean;
  };
  errorType?: RuntimeErrorType;
  message?: string;
}

export interface RuntimeRequest {
  inputText?: string;
  inputJson?: unknown;
  overrideModel?: string;
}

export interface RuntimeProviderConfig {
  providerId: string;
  providerType: RuntimeProviderType;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

export interface AdapterResponseFormat {
  mode: StructuredOutputRequestMode;
}

export interface AdapterInvokeRequest {
  provider: RuntimeProviderConfig;
  model: string;
  prompt: string;
  timeoutMs: number;
  temperature?: number | null;
  topP?: number | null;
  responseFormat?: AdapterResponseFormat;
  attemptIndex: number;
}

export interface AdapterInvokeResult extends NormalizedProviderResult {
  model: string;
  providerType: RuntimeProviderType;
}

export interface RuntimeResolvedEndpoint {
  endpointId: string;
  endpointName: string;
  namespace: string;
  pathSlug: string;
  routePreview: string;
  inputMode: RuntimeInputMode;
  providerId: string;
  providerType: RuntimeProviderType;
  model: string;
  timeoutMs: number;
  maxApiRetries: number;
  specId: string;
  specVersion: number;
  promptSnapshotId: string;
  promptHash: string;
}

export interface RuntimeExecutionContext {
  runId: string;
  requestId: string;
  endpointId: string;
  namespace: string;
  pathSlug: string;
  providerId: string;
  providerType: RuntimeProviderType;
  resolvedModel: string;
  specId: string;
  specVersion: number;
  promptSnapshotId: string;
  promptHash: string;
  inputMode: RuntimeInputMode;
  startedAt: string;
}

export interface EndpointRuntimeState {
  endpointId: string;
  currentSpecId: string | null;
  currentSpecVersion: number | null;
  specStatus: RuntimeSpecStatus;
  currentPromptSnapshotId: string | null;
  currentPromptHash: string | null;
  promptStatus: PromptStatus;
  lastPromptCompiledAt: string | null;
  lastPromptCompileError: string | null;
  runtimeReadiness: RuntimeReadinessStatus;
  lastRuntimeCheckedAt: string | null;
  updatedAt: string;
}

export interface PromptCompileRunRecord {
  id: string;
  endpointId: string;
  specId: string | null;
  specVersion: number | null;
  status: PromptCompileStatus;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  promptSnapshotId: string | null;
  promptHash: string | null;
  triggerReason: string;
  createdAt: string;
}

export interface PromptStateResponse {
  endpointId: string;
  currentSpecId: string | null;
  currentSpecVersion: number | null;
  specStatus: RuntimeSpecStatus;
  currentPromptSnapshotId: string | null;
  currentPromptHash: string | null;
  promptStatus: PromptStatus;
  lastPromptCompiledAt: string | null;
  lastPromptCompileError: string | null;
  runtimeReadiness: RuntimeReadinessStatus;
  lastRuntimeCheckedAt: string | null;
}

export interface PromptCompileResponse {
  endpointId: string;
  compileStatus: PromptCompileStatus;
  compileRunId: string;
  promptState: PromptStateResponse;
  snapshotId: string | null;
  promptHash: string | null;
  specId: string | null;
  specVersion: number | null;
  error: string | null;
}

export interface RuntimePreflightResponse {
  endpointId: string;
  endpointName: string;
  namespace: string;
  pathSlug: string;
  providerId: string | null;
  providerType: RuntimeProviderType | null;
  resolvedModel: string | null;
  currentSpecId: string | null;
  currentSpecVersion: number | null;
  currentPromptSnapshotId: string | null;
  currentPromptHash: string | null;
  specStatus: RuntimeSpecStatus;
  promptStatus: PromptStatus;
  runtimeReadiness: RuntimeReadinessStatus;
  checks: RuntimeReadinessCheckMap;
  issues: string[];
  inputMode: RuntimeInputMode | null;
  routePreview: string;
  checkedAt: string;
}

export interface RuntimeRequestPreviewResponse {
  endpointId: string;
  endpointName: string;
  namespace: string;
  pathSlug: string;
  routePreview: string;
  providerId: string;
  providerType: RuntimeProviderType;
  resolvedModel: string;
  currentSpecId: string;
  currentSpecVersion: number;
  currentPromptSnapshotId: string;
  currentPromptHash: string;
  inputMode: RuntimeInputMode;
  renderedPrompt: string;
  adapterRequestPayloadPreview: {
    url: string;
    method: 'POST';
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  timeoutMs: number;
  maxApiRetries: number;
  checkedAt: string;
}

export interface RuntimeSuccessResponse {
  success: true;
  runId: string;
  requestId: string;
  endpointId: string;
  endpointName: string;
  namespace: string;
  pathSlug: string;
  routePreview: string;
  providerId: string;
  providerType: RuntimeProviderType;
  model: string;
  specId: string;
  specVersion: number;
  promptSnapshotId: string;
  promptHash: string;
  inputMode: RuntimeInputMode;
  runtimeReadinessAtExecution: RuntimeReadinessStatus;
  outputSource: RuntimeOutputSource;
  finalOutput: string;
  finalOutputJson: unknown;
  finalOutputRawText: string;
  finalOutputNormalized: unknown;
  rawOutput: string;
  attemptCount: number;
  finishReason: string | null;
  usage: RuntimeTokenUsage;
  attempts: RetryAttemptMeta[];
  normalizedProviderResult: NormalizedProviderResult;
  executionContext: RuntimeExecutionContext;
  fallbackMeta?: RuntimeFallbackMeta;
  callLogId?: string | null;
  logWriteFailed?: boolean;
  logWriteError?: string | null;
}

export interface RuntimeFailureResponse {
  success: false;
  runId: string;
  requestId: string;
  error: RuntimeFailureError;
  attemptCount: number;
  attempts: RetryAttemptMeta[];
  lastRawOutput: string | null;
  lastValidationIssues: ValidationIssue[];
  callLogId?: string | null;
  logWriteFailed?: boolean;
  logWriteError?: string | null;
}

export type RuntimeResponse = RuntimeSuccessResponse | RuntimeFailureResponse;

export interface RuntimeMetaResponse {
  endpointId: string;
  endpointName: string;
  namespace: string;
  pathSlug: string;
  routePreview: string;
  providerId: string | null;
  providerType: RuntimeProviderType | null;
  model: string | null;
  inputMode: RuntimeInputMode | null;
  specId: string | null;
  specVersion: number | null;
  promptSnapshotId: string | null;
  promptHash: string | null;
  specStatus: RuntimeSpecStatus;
  promptStatus: PromptStatus;
  runtimeReadiness: RuntimeReadinessStatus;
  timeoutMs: number;
  maxApiRetries: number;
}

export interface RuntimeRenderPromptResult {
  finalPrompt: string;
  usedInputMode: RuntimeInputMode;
}

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

export interface CallLogDebugSnapshot {
  id: string;
  callLogId: string;
  payload: unknown;
  createdAt: string;
}

export interface CallLogListQuery {
  project?: string;
  endpoint?: string;
  provider?: string;
  success?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface CallLogListResponse {
  items: CallLogRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CallLogItemResponse {
  call: CallLogRecord;
}

export interface CallLogDebugSnapshotResponse {
  callLogId: string;
  snapshot: CallLogDebugSnapshot | null;
}

export type CallLogCleanupWindow = '7d' | '1m' | '3m' | 'all';

export interface CallLogCleanupRequest {
  window: CallLogCleanupWindow;
  dryRun?: boolean;
}

export interface CallLogCleanupResponse {
  window: CallLogCleanupWindow;
  cutoffAt: string;
  dryRun: boolean;
  matchedCount: number;
  deletedCount: number;
}

export interface MetricsOverviewResponse {
  totalCalls: number;
  totalSuccessCalls: number;
  totalFailedCalls: number;
  successRate: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCachedInputTokens: number;
  totalRepairCount: number;
  totalProjectsActive: number;
  totalEndpointsActive: number;
  totalProvidersActive: number;
}

export interface MetricsTimeseriesPoint {
  bucketStart: string;
  bucketLabel: string;
  date: string;
  calls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  retryCount: number;
}

export type MetricsTimeseriesBucket = 'hour' | 'day';

export interface MetricsTimeseriesSummary {
  calls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  retryCount: number;
}

export interface MetricsTimeseriesResponse {
  range: string;
  bucket: MetricsTimeseriesBucket;
  window: {
    startAt: string;
    endAt: string;
    bucketCount: number;
  };
  summary: MetricsTimeseriesSummary;
  previousSummary: MetricsTimeseriesSummary;
  points: MetricsTimeseriesPoint[];
}

export interface MetricsProviderBreakdownItem {
  providerId: string | null;
  providerName: string | null;
  providerType: RuntimeProviderType | null;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  failedCalls: number;
  retryCount: number;
}

export interface MetricsModelBreakdownItem {
  model: string | null;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  failedCalls: number;
  retryCount: number;
}

export interface MetricsProjectBreakdownItem {
  projectId: string | null;
  projectName: string | null;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  failedCalls: number;
  retryCount: number;
}

export interface MetricsEndpointBreakdownItem {
  endpointId: string | null;
  projectId: string | null;
  endpointName: string | null;
  projectName: string | null;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  failedCalls: number;
  retryCount: number;
}

export interface MetricsBreakdownResponse {
  providers: MetricsProviderBreakdownItem[];
  models: MetricsModelBreakdownItem[];
  projects: MetricsProjectBreakdownItem[];
  endpoints: MetricsEndpointBreakdownItem[];
}

export function createRuntimePlaceholder(): { status: RuntimeStatus } {
  return { status: 'idle' };
}
