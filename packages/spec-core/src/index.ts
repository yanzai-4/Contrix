export type SpecVersion = '0.1.0';

export type SpecId = string;

export const providerTypes = [
  'openai',
  'anthropic',
  'openrouter',
  'openai-compatible',
  'custom'
] as const;

export type ProviderType = (typeof providerTypes)[number];

export type ProviderHeaders = Record<string, string>;

export interface ProviderSummary {
  id: string;
  providerKey: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  timeoutMs: number;
  maxRetries: number | null;
  headers: ProviderHeaders;
  notes: string | null;
  maskedApiKey: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderRequest {
  name: string;
  type: ProviderType;
  baseUrl?: string | null;
  apiKey: string;
  defaultModel: string;
  supportsStructuredOutput?: boolean;
  timeoutMs?: number;
  headers?: ProviderHeaders;
  notes?: string | null;
}

export interface UpdateProviderRequest {
  name: string;
  type: ProviderType;
  baseUrl?: string | null;
  apiKey?: string | null;
  defaultModel: string;
  supportsStructuredOutput?: boolean;
  timeoutMs?: number;
  headers?: ProviderHeaders;
  notes?: string | null;
}

export interface ProviderListResponse {
  providers: ProviderSummary[];
}

export interface ProviderItemResponse {
  provider: ProviderSummary;
}

export interface ProviderDeleteResponse {
  ok: boolean;
  id: string;
}

export interface ProviderConnectionTestResponse {
  success: boolean;
  message: string;
  latencyMs: number;
  providerId: string;
  testedAt: string;
  statusCode?: number;
}

export interface ProjectSettings {
  enableObservability: boolean;
}

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type RuntimeSettingsFieldKey =
  | 'port'
  | 'routePrefix'
  | 'logLevel'
  | 'enableDebugTrace'
  | 'host';
export type RuntimeSettingsSourceValue = 'config' | `env:${string}` | 'default';
export type RuntimeSettingsRestartField = 'port' | 'routePrefix' | 'logLevel';

export interface RuntimeSettingsConfigured {
  port: number;
  routePrefix: string;
  logLevel: RuntimeLogLevel;
  enableDebugTrace: boolean;
}

export interface RuntimeSettingsEffective extends RuntimeSettingsConfigured {
  host: string;
  baseUrl: string;
}

export interface RuntimeSettingsSourceByField {
  port: RuntimeSettingsSourceValue;
  routePrefix: RuntimeSettingsSourceValue;
  logLevel: RuntimeSettingsSourceValue;
  enableDebugTrace: RuntimeSettingsSourceValue;
  host: RuntimeSettingsSourceValue;
}

export interface RuntimeSettingsResponse {
  configured: RuntimeSettingsConfigured;
  effective: RuntimeSettingsEffective;
  sourceByField: RuntimeSettingsSourceByField;
  restartRequiredFields: RuntimeSettingsRestartField[];
  deprecation: {
    legacyRuntimeAliasActive: boolean;
    message: string | null;
  };
}

export interface UpdateRuntimeSettingsRequest {
  port?: number;
  routePrefix?: string;
  logLevel?: RuntimeLogLevel;
  enableDebugTrace?: boolean;
}

export interface ProjectSummary extends ProjectSettings {
  id: string;
  name: string;
  description: string | null;
  baseInstruction: string | null;
  defaultProviderId: string | null;
  defaultProviderName: string | null;
  apiNamespace: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string | null;
  baseInstruction?: string | null;
  defaultProviderId?: string | null;
  apiNamespace: string;
}

export interface UpdateProjectRequest {
  name: string;
  description?: string | null;
  baseInstruction?: string | null;
  defaultProviderId?: string | null;
  apiNamespace: string;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
}

export interface ProjectItemResponse {
  project: ProjectSummary;
}

export interface ProjectDeleteResponse {
  ok: boolean;
  id: string;
}

export interface GroupSummary {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  groupInstruction: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupRequest {
  projectId: string;
  name: string;
  description?: string | null;
  groupInstruction?: string | null;
}

export interface UpdateGroupRequest {
  name: string;
  description?: string | null;
  groupInstruction?: string | null;
}

export interface GroupListResponse {
  groups: GroupSummary[];
}

export interface GroupItemResponse {
  group: GroupSummary;
}

export interface GroupDeleteResponse {
  ok: boolean;
  id: string;
}

export const specStatuses = ['missing', 'current', 'stale'] as const;
export type SpecStatus = (typeof specStatuses)[number];

export interface EndpointRuntimeOptions {
  enableStructuredOutput: boolean;
  enableDeterministicRepair: boolean;
  maxApiRetries: number;
  maxRepairRounds: number;
  temperature: number | null;
  topP: number | null;
}

export interface EndpointSummary extends EndpointRuntimeOptions {
  id: string;
  projectId: string;
  groupId: string | null;
  providerId: string | null;
  providerName: string | null;
  groupName: string | null;
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
  routePreview: string;
  specStatus: SpecStatus;
  createdAt: string;
  updatedAt: string;
}

export const endpointFallbackModes = ['auto_text', 'auto_json', 'manual'] as const;
export type EndpointFallbackMode = (typeof endpointFallbackModes)[number];

export interface EndpointFallbackConfig {
  enabled: boolean;
  mode: EndpointFallbackMode;
  manualContent?: string | null;
}

export interface CreateEndpointRequest extends Partial<EndpointRuntimeOptions> {
  projectId: string;
  groupId?: string | null;
  providerId: string;
  name: string;
  pathSlug: string;
  model?: string | null;
  endpointInstruction?: string | null;
  description?: string | null;
  rules?: string | null;
  examples?: string | null;
  tone?: string | null;
  fallback?: string | null;
  validation?: string | null;
  timeoutMs?: number | null;
}

export interface UpdateEndpointRequest extends Partial<EndpointRuntimeOptions> {
  groupId?: string | null;
  providerId: string;
  name: string;
  pathSlug: string;
  model?: string | null;
  endpointInstruction?: string | null;
  description?: string | null;
  rules?: string | null;
  examples?: string | null;
  tone?: string | null;
  fallback?: string | null;
  validation?: string | null;
  timeoutMs?: number | null;
}

export interface EndpointListResponse {
  endpoints: EndpointSummary[];
}

export interface EndpointItemResponse {
  endpoint: EndpointSummary;
}

export interface EndpointDeleteResponse {
  ok: boolean;
  id: string;
}

export interface ProjectDetailResponse {
  project: ProjectSummary;
  groups: GroupSummary[];
  endpoints: EndpointSummary[];
}

export const inputModes = ['text', 'json'] as const;
export type InputMode = (typeof inputModes)[number];

export const schemaEditorModes = ['builder', 'raw-json'] as const;
export type SchemaEditorMode = (typeof schemaEditorModes)[number];

export const schemaNodeTypes = [
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array'
] as const;

export type SchemaNodeType = (typeof schemaNodeTypes)[number];
export type SchemaEnumValue = string | number;

export interface SchemaNodeBase {
  description?: string | null;
  constraints?: string | null;
  example?: unknown;
  nullable?: boolean;
  default?: unknown;
}

export interface SchemaFieldDefinition {
  key: string;
  required: boolean;
  node: InternalSchemaNode;
}

export interface SchemaObjectNode extends SchemaNodeBase {
  type: 'object';
  allowAdditionalProperties?: boolean;
  properties: SchemaFieldDefinition[];
}

export interface SchemaArrayNode extends SchemaNodeBase {
  type: 'array';
  items: InternalSchemaNode;
}

export interface SchemaPrimitiveNode extends SchemaNodeBase {
  type: 'string' | 'number' | 'integer' | 'boolean';
  enumValues?: SchemaEnumValue[];
}

export type InternalSchemaNode = SchemaObjectNode | SchemaArrayNode | SchemaPrimitiveNode;

export interface TextInputDescriptor {
  description?: string | null;
  inputGuidance?: string | null;
  example?: string | null;
}

export interface EndpointSchemaDocument {
  endpointId: string;
  inputMode: InputMode;
  inputSchema: SchemaObjectNode | TextInputDescriptor | null;
  outputSchema: SchemaObjectNode;
  schemaUpdatedAt: string | null;
}

export interface EndpointSchemaItemResponse {
  schema: EndpointSchemaDocument;
}

export interface SaveEndpointSchemaRequest {
  inputMode: InputMode;
  inputSchema?: unknown;
  outputSchema: unknown;
}

export interface ValidateEndpointSchemaRequest {
  kind: 'input' | 'output';
  payload: unknown;
}

export interface SchemaValidationIssue {
  path: string;
  message: string;
  keyword: string;
}

export interface ValidateEndpointSchemaResponse {
  endpointId: string;
  kind: 'input' | 'output';
  success: boolean;
  errors: SchemaValidationIssue[];
  validatedAt: string;
  normalizedSchema?: JsonSchemaObject;
}

export type JsonSchemaTypeName =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

export interface JsonSchemaObject {
  type?: JsonSchemaTypeName | JsonSchemaTypeName[];
  description?: string;
  default?: unknown;
  enum?: Array<string | number | null>;
  example?: unknown;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject;
  additionalProperties?: boolean;
}

export interface EndpointSpecValidationPolicy {
  strictRequired: boolean;
  allowExtraFields: boolean;
  allowTypeCoercion: boolean;
  allowMissingOptional: boolean;
}

export type StructuredOutputMode = 'provider-native' | 'json-instruction' | 'hybrid';

export interface EndpointStructuredOutputStrategy {
  mode: StructuredOutputMode;
  enabled: boolean;
}

export interface EndpointStrictnessPolicy {
  mode: 'balanced' | 'strict';
  requireOutputSchema: boolean;
  requireInputSchemaWhenJson: boolean;
  allowAdditionalProperties: boolean;
}

export interface EndpointRepairPolicy {
  enableDeterministicRepair: boolean;
  enableRepairRetry: boolean;
  maxRepairRounds: number;
}

export interface EndpointProviderCapability {
  providerId: string | null;
  providerName: string | null;
  providerType: ProviderType | null;
  supportsStructuredOutput: boolean;
  defaultModel: string | null;
  baseUrl: string | null;
  timeoutMs: number | null;
}

export interface EndpointPromptGenerationMeta {
  specCoreVersion: SpecVersion;
  specBuilderVersion: string;
  generatedFromStatus: SpecStatus;
  routePreview: string;
  resolvedModel: string | null;
}

export interface EndpointProjectSourceSnapshot {
  id: string;
  name: string;
  description: string | null;
  baseInstruction: string | null;
  defaultProviderId: string | null;
  apiNamespace: string;
  settings: ProjectSettings;
  updatedAt: string;
}

export interface EndpointGroupSourceSnapshot {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  groupInstruction: string | null;
  updatedAt: string;
}

export interface EndpointSourceSnapshot {
  id: string;
  projectId: string;
  groupId: string | null;
  providerId: string | null;
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
  runtimeOptions: EndpointRuntimeOptions;
  routePreview: string;
  specStatus: SpecStatus;
  updatedAt: string;
}

export interface EndpointSchemaSourceSnapshot {
  inputMode: InputMode;
  inputSchema: SchemaObjectNode | TextInputDescriptor | null;
  outputSchema: SchemaObjectNode;
  schemaUpdatedAt: string | null;
}

export interface EndpointProviderSourceSnapshot {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  defaultModel: string;
  supportsStructuredOutput: boolean;
  timeoutMs: number;
}

export interface EndpointSpecSourceSnapshot {
  project: EndpointProjectSourceSnapshot;
  group: EndpointGroupSourceSnapshot | null;
  endpoint: EndpointSourceSnapshot;
  schema: EndpointSchemaSourceSnapshot;
  provider: EndpointProviderSourceSnapshot | null;
}

export interface EndpointSpecInstructions {
  base: string | null;
  group: string | null;
  endpoint: string | null;
}

export interface EndpointSpecInputSection {
  mode: InputMode;
  schema: SchemaObjectNode | TextInputDescriptor | null;
}

export interface EndpointSpecOutputSection {
  schema: SchemaObjectNode;
}

export interface EndpointSpecContent {
  sourceSnapshot: EndpointSpecSourceSnapshot;
  instructions: EndpointSpecInstructions;
  description: string | null;
  rules: string | null;
  examples: string | null;
  tone: string | null;
  fallback: string | null;
  validationPolicy: EndpointSpecValidationPolicy;
  input: EndpointSpecInputSection;
  output: EndpointSpecOutputSection;
  structuredOutputStrategy: EndpointStructuredOutputStrategy;
  strictnessPolicy: EndpointStrictnessPolicy;
  repairPolicy: EndpointRepairPolicy;
  providerCapability: EndpointProviderCapability;
  promptGenerationMeta: EndpointPromptGenerationMeta;
}

export interface EndpointSpec extends EndpointSpecContent {
  id: string;
  endpointId: string;
  version: number;
  generatedAt: string;
  hash: string;
}

export interface EndpointEffectiveSpecInstructions {
  base?: string;
  group?: string;
  endpoint?: string;
  merged?: string;
}

export interface EndpointEffectiveSpecInputSection {
  mode: InputMode;
  schema?: JsonSchemaObject | TextInputDescriptor;
}

export interface EndpointEffectiveSpecOutputSection {
  schema: JsonSchemaObject;
}

export interface EndpointEffectiveSpecFieldSummary {
  path: string;
  type: string;
  required?: boolean;
  description?: string;
  constraints?: string;
  example?: unknown;
  enumValues?: SchemaEnumValue[];
  nullable?: boolean;
}

export interface EndpointEffectiveSpecContractSummary {
  input: string;
  output: string;
}

export interface EndpointEffectiveSpecFallbackPolicy {
  enabled: boolean;
  mode: EndpointFallbackMode;
  manualContent?: string;
}

export interface EndpointEffectiveSpec {
  instructions: EndpointEffectiveSpecInstructions;
  tone?: string;
  input: EndpointEffectiveSpecInputSection;
  output: EndpointEffectiveSpecOutputSection;
  fieldRules: string[];
  outputRules: string[];
  outputConstraints: string[];
  outputExample: unknown;
  outputExampleKind: 'semantic' | 'placeholder';
  structuredOutput?: EndpointStructuredOutputStrategy;
  fallback: EndpointEffectiveSpecFallbackPolicy;
  validation: EndpointSpecValidationPolicy;
  repair: EndpointRepairPolicy;
  contractSummary: EndpointEffectiveSpecContractSummary;
}

export interface EndpointEffectiveSpecBuildInput {
  instructions: EndpointSpecInstructions;
  description?: string | null;
  rules?: string | null;
  examples?: string | null;
  tone?: string | null;
  fallback?: string | null;
  validationPolicy: EndpointSpecValidationPolicy;
  input: EndpointSpecInputSection;
  output: EndpointSpecOutputSection;
  structuredOutputStrategy: EndpointStructuredOutputStrategy;
  strictnessPolicy: EndpointStrictnessPolicy;
  repairPolicy: EndpointRepairPolicy;
}

export interface EndpointSpecBuildMetadata {
  specId: string;
  endpointId: string;
  version: number;
  generatedAt: string;
  hash: string;
  providerCapability?: EndpointProviderCapability;
  promptGenerationMeta?: EndpointPromptGenerationMeta;
  triggerReason?: SpecTriggerReason;
}

export interface EndpointSpecLayered {
  effectiveSpec: EndpointEffectiveSpec;
  metadata: EndpointSpecBuildMetadata;
  sourceSnapshot?: EndpointSpecSourceSnapshot;
}

export const specTriggerReasons = [
  'initial',
  'project_updated',
  'group_updated',
  'endpoint_updated',
  'schema_updated',
  'manual_regenerate',
  'system_rebuild'
] as const;

export type SpecTriggerReason = (typeof specTriggerReasons)[number];

export interface EndpointSpecVersionSummary {
  id: string;
  endpointId: string;
  version: number;
  hash: string;
  createdAt: string;
  triggerReason: SpecTriggerReason;
  isCurrent: boolean;
}

export interface EndpointSpecVersionRecord extends EndpointSpecVersionSummary {
  spec: EndpointSpec;
}

export type SpecDiffChangeType = 'added' | 'removed' | 'changed';

export interface SpecDiffEntry {
  path: string;
  changeType: SpecDiffChangeType;
  fromValue?: unknown;
  toValue?: unknown;
}

export interface SpecDiffResult {
  changedKeys: string[];
  summary: string;
  entries: SpecDiffEntry[];
}

export interface EndpointSpecCurrentResponse {
  endpointId: string;
  currentSpec: EndpointSpec;
  currentEffectiveSpec: EndpointEffectiveSpec;
  currentSpecMetadata: EndpointSpecBuildMetadata;
  currentSpecLayered: EndpointSpecLayered;
  isStale: boolean;
  currentVersion: number;
  lastGeneratedAt: string | null;
}

export interface EndpointSpecRegenerateResponse extends EndpointSpecCurrentResponse {
  createdNewVersion: boolean;
  triggerReason: SpecTriggerReason;
}

export interface EndpointSpecVersionsResponse {
  endpointId: string;
  versions: EndpointSpecVersionSummary[];
}

export interface EndpointSpecVersionItemResponse {
  endpointId: string;
  version: number;
  spec: EndpointSpec;
  effectiveSpec: EndpointEffectiveSpec;
  specMetadata: EndpointSpecBuildMetadata;
  specLayered: EndpointSpecLayered;
  isCurrent: boolean;
}

export interface EndpointSpecDiffResponse {
  endpointId: string;
  fromVersion: number;
  toVersion: number;
  changedKeys: string[];
  diffSummary: string;
  diff: SpecDiffEntry[];
}

export interface EndpointSpecExportResponse {
  endpointId: string;
  version: number;
  spec: EndpointSpec;
  effectiveSpec: EndpointEffectiveSpec;
  specMetadata: EndpointSpecBuildMetadata;
  specLayered: EndpointSpecLayered;
}

export interface PromptSections {
  instructionBlock: string;
  schemaBlock: string;
  constraintsBlock: string;
  examplesBlock: string;
  toneBlock: string;
  fallbackBlock: string;
  validationBlock: string;
}

export interface PromptCompileResult {
  template: string;
  hash: string;
  sections: PromptSections;
}

export interface PromptRenderRequest {
  inputText?: string;
  inputJson?: unknown;
}

export interface PromptSnapshotModel {
  id: string;
  specId: string;
  specVersion: number;
  promptHash: string;
  promptText: string;
  sections: PromptSections;
  createdAt: string;
}

export interface PromptPreviewResponse {
  endpointId: string;
  specId: string;
  specVersion: number;
  promptHash: string;
  promptTemplate: string;
  sections: PromptSections;
  fromCache: boolean;
  isStale: boolean;
  warning: string | null;
}

export interface PromptRenderResponse {
  endpointId: string;
  specVersion: number;
  promptHash: string;
  finalPrompt: string;
}

export const exportTypes = [
  'runtime-config-pack',
  'standalone-runtime-bundle',
  'embeddable-runtime-package'
] as const;

export type ExportType = (typeof exportTypes)[number];

export interface ExportProjectOptions {
  exportType?: ExportType;
  outputDir?: string | null;
  includeExamples?: boolean;
  includeDocs?: boolean;
  includeStandaloneRuntime?: boolean;
  includeEmbeddableRuntime?: boolean;
}

export interface ExportReadyEndpointItem {
  endpointId: string;
  endpointName: string;
  pathSlug: string;
  routePreview: string;
  providerRef: string;
  inputMode: InputMode;
  specVersion: number;
  promptHash: string;
  warnings: string[];
}

export interface ExportSkippedEndpointItem {
  endpointId: string;
  endpointName: string;
  reasons: string[];
}

export interface ExportProjectPreflightResponse {
  projectId: string;
  projectName: string;
  namespace: string;
  totalEndpoints: number;
  exportReady: boolean;
  readyEndpoints: ExportReadyEndpointItem[];
  skippedEndpoints: ExportSkippedEndpointItem[];
  warnings: string[];
  blockingIssues: string[];
}

export interface ExportProjectResponse {
  success: boolean;
  projectId: string;
  exportPath: string;
  exportType: ExportType;
  exportedFiles: string[];
  warnings: string[];
}

export function createEmptyObjectSchemaNode(): SchemaObjectNode {
  return {
    type: 'object',
    allowAdditionalProperties: false,
    properties: []
  };
}

export function createDefaultEndpointSchema(endpointId: string): EndpointSchemaDocument {
  return {
    endpointId,
    inputMode: 'json',
    inputSchema: createEmptyObjectSchemaNode(),
    outputSchema: createEmptyObjectSchemaNode(),
    schemaUpdatedAt: null
  };
}

export function buildRuntimeRoutePreview(apiNamespace: string, pathSlug: string, routePrefix = '/runtime'): string {
  const namespace = apiNamespace.trim().replace(/^\/+|\/+$/g, '');
  const slug = pathSlug.trim().replace(/^\/+|\/+$/g, '');
  const normalizedPrefixRaw = routePrefix.trim() || '/runtime';
  const withoutTrailing = normalizedPrefixRaw.replace(/\/+$/, '');
  const prefix = withoutTrailing ? withoutTrailing.replace(/^\/?/, '/') : '/';
  return `${prefix === '/' ? '' : prefix}/${namespace}/${slug}`;
}

function withNullableType(
  type: JsonSchemaTypeName,
  nullable: boolean | undefined
): JsonSchemaTypeName | JsonSchemaTypeName[] {
  return nullable ? [type, 'null'] : type;
}

export function schemaNodeToJsonSchema(node: InternalSchemaNode): JsonSchemaObject {
  const description = node.description?.trim() || undefined;
  const nullable = Boolean(node.nullable);
  const common: Pick<JsonSchemaObject, 'description' | 'default'> = {
    description,
    default: node.default
  };

  if (node.type === 'object') {
    const properties: Record<string, JsonSchemaObject> = {};
    const required: string[] = [];

    for (const field of node.properties) {
      properties[field.key] = schemaNodeToJsonSchema(field.node);

      if (field.required) {
        required.push(field.key);
      }
    }

    return {
      type: 'object',
      additionalProperties: node.allowAdditionalProperties ?? false,
      properties,
      required: required.length > 0 ? required : undefined,
      ...common
    };
  }

  if (node.type === 'array') {
    return {
      type: withNullableType('array', nullable),
      items: schemaNodeToJsonSchema(node.items),
      ...common
    };
  }

  const enumValues: Array<string | number | null> | undefined = node.enumValues?.length
    ? [...node.enumValues]
    : undefined;

  if (nullable && enumValues && !enumValues.includes(null)) {
    enumValues.push(null);
  }

  return {
    type: withNullableType(node.type, nullable),
    enum: enumValues,
    ...common
  };
}

function normalizeForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item));
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    const keys = Object.keys(objectValue).sort((a, b) => a.localeCompare(b));

    for (const key of keys) {
      normalized[key] = normalizeForStableStringify(objectValue[key]);
    }

    return normalized;
  }

  return value;
}

export function compactSpecValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return undefined as T;
  }

  if (Array.isArray(value)) {
    const compacted = value
      .map((item) => compactSpecValue(item))
      .filter((item) => item !== undefined);
    return compacted as T;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const target: Record<string, unknown> = {};

    Object.entries(source).forEach(([key, current]) => {
      const compacted = compactSpecValue(current);
      if (compacted !== undefined) {
        target[key] = compacted;
      }
    });

    return target as T;
  }

  return value;
}

function normalizeSpecText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : undefined;
}

function normalizeInstructionWording(value: string | null | undefined): string | undefined {
  const normalized = normalizeSpecText(value);
  if (!normalized) {
    return undefined;
  }

  return normalized
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function normalizeSpaceSeparatedText(value: string): string {
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function toRuleLines(value: string | null | undefined): string[] {
  const normalized = normalizeSpecText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function dedupeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function buildMergedInstructionBlock(input: { instructions: EndpointSpecInstructions }): string | undefined {
  const sections: string[] = [];
  const base = normalizeInstructionWording(input.instructions.base);
  const group = normalizeInstructionWording(input.instructions.group);
  const endpoint = normalizeInstructionWording(input.instructions.endpoint);

  if (base) {
    sections.push(`[Base Instruction]\n${base}`);
  }

  if (group) {
    sections.push(`[Group Instruction]\n${group}`);
  }

  if (endpoint) {
    sections.push(`[Endpoint Instruction]\n${endpoint}`);
  }

  if (sections.length === 0) {
    return undefined;
  }

  return sections.join('\n\n');
}

function schemaNodeTypeLabel(node: InternalSchemaNode): string {
  if (node.type === 'array') {
    return `array<${schemaNodeTypeLabel(node.items)}>`;
  }

  return node.type;
}

function toFieldPath(segments: string[]): string {
  if (segments.length === 0) {
    return '/';
  }

  return `/${segments.join('/')}`;
}

function toFieldSummary(
  pathSegments: string[],
  node: InternalSchemaNode,
  required: boolean | undefined
): EndpointEffectiveSpecFieldSummary {
  const summary: EndpointEffectiveSpecFieldSummary = {
    path: toFieldPath(pathSegments),
    type: schemaNodeTypeLabel(node),
    required
  };

  if (node.description?.trim()) {
    summary.description = node.description.trim();
  }

  if (node.constraints?.trim()) {
    summary.constraints = node.constraints.trim();
  }

  if (node.example !== undefined) {
    summary.example = node.example;
  }

  if (node.type === 'string' || node.type === 'number' || node.type === 'integer') {
    if (node.enumValues?.length) {
      summary.enumValues = [...node.enumValues];
    }
  }

  if (node.nullable !== undefined) {
    summary.nullable = Boolean(node.nullable);
  }

  return compactSpecValue(summary);
}

function collectFieldSummaries(
  node: InternalSchemaNode,
  pathSegments: string[],
  required: boolean | undefined,
  bucket: EndpointEffectiveSpecFieldSummary[]
): void {
  bucket.push(toFieldSummary(pathSegments, node, required));

  if (node.type === 'object') {
    for (const field of node.properties) {
      collectFieldSummaries(field.node, [...pathSegments, field.key], field.required, bucket);
    }
    return;
  }

  if (node.type === 'array') {
    collectFieldSummaries(node.items, [...pathSegments, '[]'], undefined, bucket);
  }
}

function collectObjectFieldSummaries(node: SchemaObjectNode): EndpointEffectiveSpecFieldSummary[] {
  const result: EndpointEffectiveSpecFieldSummary[] = [];

  for (const field of node.properties) {
    collectFieldSummaries(field.node, [field.key], field.required, result);
  }

  return result;
}

function summarizeFieldCollection(fields: EndpointEffectiveSpecFieldSummary[], mode: InputMode | 'output'): string {
  if (fields.length === 0) {
    return mode === 'output'
      ? 'No output fields are defined in the contract.'
      : 'No structured input fields are defined.';
  }

  const requiredCount = fields.filter((field) => field.required).length;
  const sectionName = mode === 'output' ? 'Output' : 'Input';
  return `${sectionName} has ${fields.length} field(s), ${requiredCount} required.`;
}

interface OutputExampleResult {
  value: unknown;
  kind: 'semantic' | 'placeholder';
}

function resolveSemanticStringValue(fieldName: string): { value: string; semantic: boolean } {
  const normalized = fieldName.trim();
  const lower = normalized.toLowerCase();

  if (/flag|emoji|icon/.test(lower)) {
    return { value: '&#127482;&#127480;', semantic: true };
  }

  if (/html\s*dec|decimal\s*code/.test(lower)) {
    return { value: '&#127482;&#127480;', semantic: true };
  }

  if (/date|timestamp|time/.test(lower)) {
    return { value: '2026-01-15', semantic: true };
  }

  if (/email/.test(lower)) {
    return { value: 'alex@example.com', semantic: true };
  }

  if (/url|uri|website|link/.test(lower)) {
    return { value: 'https://example.com/resource', semantic: true };
  }

  if (/country/.test(lower)) {
    return { value: 'United States', semantic: true };
  }

  if (/language/.test(lower)) {
    return { value: 'English', semantic: true };
  }

  if (/currency/.test(lower)) {
    return { value: 'USD', semantic: true };
  }

  if (/status|state/.test(lower)) {
    return { value: 'active', semantic: true };
  }

  if (/name|title|label/.test(lower)) {
    return { value: 'Example Name', semantic: true };
  }

  if (/summary|description|detail|notes?/.test(lower)) {
    return { value: 'Concise summary of the result.', semantic: true };
  }

  if (/code|iso/.test(lower)) {
    return { value: 'US', semantic: true };
  }

  if (/phone/.test(lower)) {
    return { value: '+1-202-555-0147', semantic: true };
  }

  if (/id$|_id$|id_/.test(lower)) {
    return { value: 'item_123', semantic: true };
  }

  return {
    value: normalized.length > 0 ? `example-${normalized.replace(/\s+/g, '-').toLowerCase()}` : 'example-value',
    semantic: false
  };
}

function resolveSemanticNumberValue(fieldName: string, integer: boolean): { value: number; semantic: boolean } {
  const normalized = fieldName.trim().toLowerCase();

  if (/year/.test(normalized)) {
    return { value: 2026, semantic: true };
  }

  if (/population/.test(normalized)) {
    return { value: 335000000, semantic: true };
  }

  if (/price|amount|total|cost/.test(normalized)) {
    return { value: integer ? 120 : 120.5, semantic: true };
  }

  if (/percent|ratio|rate|score|confidence/.test(normalized)) {
    return { value: integer ? 85 : 0.87, semantic: true };
  }

  if (/count|quantity|size|length|items?/.test(normalized)) {
    return { value: 3, semantic: true };
  }

  return { value: integer ? 1 : 1.0, semantic: false };
}

function synthesizeExampleFromNode(node: InternalSchemaNode, pathSegments: string[] = []): OutputExampleResult {
  if (node.example !== undefined) {
    return { value: node.example, kind: 'semantic' };
  }

  if (node.default !== undefined) {
    return { value: node.default, kind: 'semantic' };
  }

  if (node.type === 'object') {
    const value: Record<string, unknown> = {};
    let hasSemantic = false;

    for (const field of node.properties) {
      const next = synthesizeExampleFromNode(field.node, [...pathSegments, field.key]);
      value[field.key] = next.value;
      if (next.kind === 'semantic') {
        hasSemantic = true;
      }
    }

    return {
      value,
      kind: hasSemantic ? 'semantic' : 'placeholder'
    };
  }

  if (node.type === 'array') {
    const item = synthesizeExampleFromNode(node.items, [...pathSegments, 'item']);
    return {
      value: [item.value],
      kind: item.kind
    };
  }

  if (node.enumValues?.length) {
    return {
      value: node.enumValues[0],
      kind: 'semantic'
    };
  }

  const fieldName = pathSegments[pathSegments.length - 1] ?? '';

  if (node.type === 'string') {
    const resolved = resolveSemanticStringValue(fieldName);
    return {
      value: resolved.value,
      kind: resolved.semantic ? 'semantic' : 'placeholder'
    };
  }

  if (node.type === 'number' || node.type === 'integer') {
    const resolved = resolveSemanticNumberValue(fieldName, node.type === 'integer');
    return {
      value: resolved.value,
      kind: resolved.semantic ? 'semantic' : 'placeholder'
    };
  }

  return {
    value: true,
    kind: 'placeholder'
  };
}

function parseExamplesOutputOverride(rawExamples: string | null | undefined): OutputExampleResult | undefined {
  const normalized = normalizeSpecText(rawExamples);
  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (Array.isArray(parsed)) {
      const first = parsed.find((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) as
        | Record<string, unknown>
        | undefined;
      if (first && 'output' in first) {
        return { value: first.output, kind: 'semantic' };
      }
      return undefined;
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const objectValue = parsed as Record<string, unknown>;
      if ('output' in objectValue) {
        return { value: objectValue.output, kind: 'semantic' };
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function formatFieldPath(pathSegments: string[]): string {
  return pathSegments
    .map((segment) => (segment === 'item' ? '[]' : segment))
    .join('.')
    .replace(/\.\[\]/g, '[]');
}

function buildFieldConstraintSentence(pathSegments: string[], constraint: string): string {
  const fieldPath = formatFieldPath(pathSegments);
  const normalized = normalizeSpaceSeparatedText(constraint);

  if (/chinese/i.test(normalized)) {
    return `\`${fieldPath}\` must be in Chinese.`;
  }

  if (/yyyy[-/]?mm[-/]?dd|iso[- ]?8601/i.test(normalized)) {
    return `\`${fieldPath}\` must use YYYY-MM-DD format.`;
  }

  return `\`${fieldPath}\` must satisfy: ${normalized}.`;
}

function collectFieldConstraintLines(
  node: InternalSchemaNode,
  pathSegments: string[],
  output: string[]
): void {
  if (node.constraints?.trim()) {
    output.push(buildFieldConstraintSentence(pathSegments, node.constraints));
  }

  if (
    (node.type === 'string' || node.type === 'number' || node.type === 'integer') &&
    node.enumValues &&
    node.enumValues.length > 0
  ) {
    const fieldPath = formatFieldPath(pathSegments);
    output.push(`\`${fieldPath}\` must be one of: ${node.enumValues.map((item) => JSON.stringify(item)).join(', ')}.`);
  }

  if (node.type === 'object') {
    for (const field of node.properties) {
      collectFieldConstraintLines(field.node, [...pathSegments, field.key], output);
    }
    return;
  }

  if (node.type === 'array') {
    collectFieldConstraintLines(node.items, [...pathSegments, 'item'], output);
  }
}

function buildFieldRules(outputSchema: SchemaObjectNode): string[] {
  const rules: string[] = [];

  for (const field of outputSchema.properties) {
    collectFieldConstraintLines(field.node, [field.key], rules);
  }

  return dedupeStringList(rules);
}

function buildOutputRules(input: {
  rules: string | null | undefined;
  allowAdditionalProperties: boolean;
}): string[] {
  const baseRules = [
    'Return only valid JSON.',
    input.allowAdditionalProperties
      ? 'Prefer schema fields and add extra fields only when the task explicitly requires them.'
      : 'Do not add extra fields.',
    'Do not include markdown or explanation text.'
  ];

  return dedupeStringList([...toRuleLines(input.rules), ...baseRules]);
}

function buildEffectiveSpecFallback(fallbackRaw: string | null | undefined): EndpointEffectiveSpecFallbackPolicy {
  const fallbackConfig = parseEndpointFallbackConfig(fallbackRaw);

  if (!fallbackConfig) {
    return {
      enabled: true,
      mode: 'auto_json'
    };
  }

  return compactSpecValue({
    enabled: true,
    mode: fallbackConfig.mode,
    manualContent:
      fallbackConfig.mode === 'manual'
        ? normalizeSpecText(fallbackConfig.manualContent ?? undefined)
        : undefined
  });
}

function determineOutputExample(
  outputSchema: SchemaObjectNode,
  rawExamples: string | null | undefined
): OutputExampleResult {
  const override = parseExamplesOutputOverride(rawExamples);
  if (override) {
    return override;
  }

  return synthesizeExampleFromNode(outputSchema);
}

export function buildEffectiveSpec(guiState: EndpointEffectiveSpecBuildInput): EndpointEffectiveSpec {
  const normalizedInstructions: EndpointEffectiveSpecInstructions = {
    base: normalizeInstructionWording(guiState.instructions.base),
    group: normalizeInstructionWording(guiState.instructions.group),
    endpoint: normalizeInstructionWording(guiState.instructions.endpoint)
  };

  const mergedInstruction = buildMergedInstructionBlock({
    instructions: guiState.instructions
  });

  if (mergedInstruction) {
    normalizedInstructions.merged = mergedInstruction;
  }

  const outputFields = collectObjectFieldSummaries(guiState.output.schema);
  const inputJsonNode =
    guiState.input.mode === 'json' &&
    guiState.input.schema &&
    typeof guiState.input.schema === 'object' &&
    'type' in guiState.input.schema &&
    guiState.input.schema.type === 'object'
      ? guiState.input.schema
      : undefined;
  const inputJsonSchema = inputJsonNode ? schemaNodeToJsonSchema(inputJsonNode) : null;
  const outputJsonSchema = schemaNodeToJsonSchema(guiState.output.schema);
  const inputFields = inputJsonNode ? collectObjectFieldSummaries(inputJsonNode) : [];
  const inputTextDescriptor =
    guiState.input.mode === 'text' &&
    guiState.input.schema &&
    typeof guiState.input.schema === 'object' &&
    !('type' in guiState.input.schema)
      ? guiState.input.schema
      : undefined;

  if (guiState.input.mode === 'text') {
    inputFields.push(
      compactSpecValue({
        path: '/inputText',
        type: 'string',
        required: true,
        description: normalizeSpecText(inputTextDescriptor?.description),
        example: inputTextDescriptor?.example ?? undefined
      })
    );
  }

  const outputExampleResult = determineOutputExample(guiState.output.schema, guiState.examples);
  const fieldRules = buildFieldRules(guiState.output.schema);
  const outputRules = buildOutputRules({
    rules: guiState.rules,
    allowAdditionalProperties: guiState.validationPolicy.allowExtraFields
  });
  const outputConstraints = dedupeStringList([...fieldRules, ...outputRules]);
  const fallback = buildEffectiveSpecFallback(guiState.fallback);

  const inputSummary =
    inputJsonNode
      ? summarizeFieldCollection(inputFields, 'json')
      : normalizeSpecText(inputTextDescriptor?.description) || 'Input uses free-form text mode.';
  const outputSummary = summarizeFieldCollection(outputFields, 'output');
  const normalizedInputSchema =
    guiState.input.mode === 'json'
      ? inputJsonSchema ?? undefined
      : compactSpecValue({
          description: normalizeSpecText(inputTextDescriptor?.description),
          inputGuidance: normalizeSpecText(inputTextDescriptor?.inputGuidance),
          example: normalizeSpecText(inputTextDescriptor?.example)
        });
  const structuredOutput =
    guiState.structuredOutputStrategy.enabled ? guiState.structuredOutputStrategy : undefined;

  const raw: EndpointEffectiveSpec = {
    instructions: normalizedInstructions,
    tone: normalizeSpecText(guiState.tone),
    input: {
      mode: guiState.input.mode,
      schema: normalizedInputSchema
    },
    output: {
      schema: outputJsonSchema
    },
    fieldRules,
    outputRules,
    outputConstraints,
    outputExample: outputExampleResult.value,
    outputExampleKind: outputExampleResult.kind,
    structuredOutput,
    fallback,
    validation: guiState.validationPolicy,
    repair: guiState.repairPolicy,
    contractSummary: {
      input: inputSummary,
      output: outputSummary
    }
  };

  return compactSpecValue(raw);
}

export function toEndpointEffectiveSpec(spec: EndpointSpec): EndpointEffectiveSpec {
  return buildEffectiveSpec({
    instructions: spec.instructions,
    description: spec.description,
    rules: spec.rules,
    examples: spec.examples,
    tone: spec.tone,
    fallback: spec.fallback,
    validationPolicy: spec.validationPolicy,
    input: spec.input,
    output: spec.output,
    structuredOutputStrategy: spec.structuredOutputStrategy,
    strictnessPolicy: spec.strictnessPolicy,
    repairPolicy: spec.repairPolicy
  });
}

export function toEndpointSpecBuildMetadata(
  spec: EndpointSpec,
  options?: {
    triggerReason?: SpecTriggerReason;
    includeInternal?: boolean;
  }
): EndpointSpecBuildMetadata {
  const metadata: EndpointSpecBuildMetadata = {
    specId: spec.id,
    endpointId: spec.endpointId,
    version: spec.version,
    generatedAt: spec.generatedAt,
    hash: spec.hash
  };

  if (options?.triggerReason) {
    metadata.triggerReason = options.triggerReason;
  }

  if (options?.includeInternal) {
    metadata.providerCapability = spec.providerCapability;
    metadata.promptGenerationMeta = spec.promptGenerationMeta;
  }

  return compactSpecValue(metadata);
}

export function toEndpointSpecLayered(
  spec: EndpointSpec,
  options?: {
    triggerReason?: SpecTriggerReason;
    includeSourceSnapshot?: boolean;
    includeInternalMetadata?: boolean;
  }
): EndpointSpecLayered {
  const layered: EndpointSpecLayered = {
    effectiveSpec: toEndpointEffectiveSpec(spec),
    metadata: toEndpointSpecBuildMetadata(spec, {
      triggerReason: options?.triggerReason,
      includeInternal: options?.includeInternalMetadata ?? true
    }),
    sourceSnapshot: options?.includeSourceSnapshot ? spec.sourceSnapshot : undefined
  };

  return compactSpecValue(layered);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value));
}

export function createStableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash.toString(16).padStart(16, '0');
}

export function buildDefaultValidationPolicy(
  allowExtraFields: boolean
): EndpointSpecValidationPolicy {
  return {
    strictRequired: true,
    allowExtraFields,
    allowTypeCoercion: false,
    allowMissingOptional: true
  };
}

export function buildDefaultStructuredOutputStrategy(options: {
  endpointEnabled?: boolean;
  providerSupportsStructuredOutput: boolean;
  hasOutputSchema?: boolean;
}): EndpointStructuredOutputStrategy {
  const hasOutputSchema = options.hasOutputSchema ?? true;
  const canUseProviderNative = options.providerSupportsStructuredOutput && hasOutputSchema;

  if (canUseProviderNative) {
    return {
      enabled: true,
      mode: 'provider-native'
    };
  }

  return {
    enabled: hasOutputSchema,
    mode: 'json-instruction'
  };
}

export function buildDefaultStrictnessPolicy(options: {
  allowAdditionalProperties: boolean;
  inputMode: InputMode;
}): EndpointStrictnessPolicy {
  const allowAdditionalProperties = options.allowAdditionalProperties;

  return {
    mode: allowAdditionalProperties ? 'balanced' : 'strict',
    requireOutputSchema: true,
    requireInputSchemaWhenJson: options.inputMode === 'json',
    allowAdditionalProperties
  };
}

export function buildDefaultRepairPolicy(options: {
  enableDeterministicRepair: boolean;
  maxRepairRounds: number;
}): EndpointRepairPolicy {
  return {
    enableDeterministicRepair: options.enableDeterministicRepair,
    enableRepairRetry: options.maxRepairRounds > 0,
    maxRepairRounds: options.maxRepairRounds
  };
}

export function createEndpointSpecHash(content: EndpointSpecContent): string {
  return createStableHash(pickComparableSpecContent(content));
}

export function pickComparableSpecContent(spec: EndpointSpec | EndpointSpecContent): EndpointSpecContent {
  const normalizedGroup = spec.sourceSnapshot.group
    ? {
        ...spec.sourceSnapshot.group,
        updatedAt: '__normalized__'
      }
    : null;

  const normalizedSourceSnapshot: EndpointSpecSourceSnapshot = {
    ...spec.sourceSnapshot,
    project: {
      ...spec.sourceSnapshot.project,
      updatedAt: '__normalized__'
    },
    group: normalizedGroup,
    endpoint: {
      ...spec.sourceSnapshot.endpoint,
      specStatus: 'current',
      updatedAt: '__normalized__'
    },
    schema: {
      ...spec.sourceSnapshot.schema,
      schemaUpdatedAt: null
    }
  };

  return {
    sourceSnapshot: normalizedSourceSnapshot,
    instructions: spec.instructions,
    description: spec.description,
    rules: spec.rules,
    examples: spec.examples,
    tone: spec.tone,
    fallback: spec.fallback,
    validationPolicy: spec.validationPolicy,
    input: spec.input,
    output: spec.output,
    structuredOutputStrategy: spec.structuredOutputStrategy,
    strictnessPolicy: spec.strictnessPolicy,
    repairPolicy: spec.repairPolicy,
    providerCapability: spec.providerCapability,
    promptGenerationMeta: {
      ...spec.promptGenerationMeta,
      generatedFromStatus: 'current'
    }
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function joinPath(basePath: string, segment: string): string {
  if (!basePath || basePath === '/') {
    return `/${segment}`;
  }

  return `${basePath}/${segment}`;
}

function diffUnknownValues(
  fromValue: unknown,
  toValue: unknown,
  path: string,
  entries: SpecDiffEntry[]
): void {
  if (fromValue === undefined && toValue === undefined) {
    return;
  }

  if (fromValue === undefined) {
    entries.push({ path, changeType: 'added', toValue });
    return;
  }

  if (toValue === undefined) {
    entries.push({ path, changeType: 'removed', fromValue });
    return;
  }

  if (isPlainObject(fromValue) && isPlainObject(toValue)) {
    const keySet = new Set<string>([...Object.keys(fromValue), ...Object.keys(toValue)]);
    const keys = [...keySet].sort((a, b) => a.localeCompare(b));

    for (const key of keys) {
      diffUnknownValues(fromValue[key], toValue[key], joinPath(path, key), entries);
    }

    return;
  }

  if (Array.isArray(fromValue) && Array.isArray(toValue)) {
    const maxLength = Math.max(fromValue.length, toValue.length);

    for (let index = 0; index < maxLength; index += 1) {
      diffUnknownValues(fromValue[index], toValue[index], joinPath(path, String(index)), entries);
    }

    return;
  }

  if (!areValuesEqual(fromValue, toValue)) {
    entries.push({
      path,
      changeType: 'changed',
      fromValue,
      toValue
    });
  }
}

function getTopLevelKeyFromPath(path: string): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const [firstSegment] = normalized.split('/');
  return firstSegment || 'root';
}

export function diffEndpointSpecs(
  fromSpec: EndpointSpec | EndpointSpecContent,
  toSpec: EndpointSpec | EndpointSpecContent
): SpecDiffResult {
  const fromContent =
    'id' in fromSpec ? toEndpointEffectiveSpec(fromSpec as EndpointSpec) : pickComparableSpecContent(fromSpec);
  const toContent =
    'id' in toSpec ? toEndpointEffectiveSpec(toSpec as EndpointSpec) : pickComparableSpecContent(toSpec);
  const entries: SpecDiffEntry[] = [];

  diffUnknownValues(fromContent, toContent, '/', entries);

  const changedKeys = [...new Set(entries.map((entry) => getTopLevelKeyFromPath(entry.path)))].sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    changedKeys,
    summary: `${entries.length} change(s) across ${changedKeys.length} top-level key(s).`,
    entries
  };
}

export function resolveSpecExportFileName(endpointId: string, version: number): string {
  return `endpoint-${endpointId}-spec-v${version}.json`;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

function normalizeFallbackMode(value: unknown): EndpointFallbackMode | null {
  if (value === 'manual' || value === 'manual_json' || value === 'manual_text') {
    return 'manual';
  }

  if (
    value === 'auto_text' ||
    value === 'text'
  ) {
    return 'auto_text';
  }

  if (
    value === 'auto_json' ||
    value === 'json'
  ) {
    return 'auto_json';
  }

  return null;
}

function normalizeFallbackManualContent(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return value.trim() ? value : null;
}

export function parseEndpointFallbackConfig(raw: string | null | undefined): EndpointFallbackConfig | null {
  const normalizedRaw = raw?.trim() ?? '';

  if (!normalizedRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalizedRaw) as unknown;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const parsedObject = parsed as Record<string, unknown>;
      const mode =
        normalizeFallbackMode(parsedObject.mode) ??
        normalizeFallbackMode(parsedObject.type);
      const manualContent =
        normalizeFallbackManualContent(parsedObject.manualContent) ??
        normalizeFallbackManualContent(parsedObject.content) ??
        normalizeFallbackManualContent(parsedObject.value);

      if (mode) {
        const enabled = typeof parsedObject.enabled === 'boolean' ? parsedObject.enabled : true;
        return enabled
          ? {
              enabled: true,
              mode,
              ...(mode === 'manual' ? { manualContent } : {})
            }
          : null;
      }

      if (manualContent) {
        return {
          enabled: true,
          mode: 'manual',
          manualContent
        };
      }

      return {
        enabled: true,
        mode: 'auto_json'
      };
    }

    if (Array.isArray(parsed)) {
      return {
        enabled: true,
        mode: 'auto_json'
      };
    }

    const modeFromPrimitive = normalizeFallbackMode(parsed);
    if (modeFromPrimitive) {
      return {
        enabled: true,
        mode: modeFromPrimitive
      };
    }

    return {
      enabled: true,
      mode: 'auto_text'
    };
  } catch {
    return {
      enabled: true,
      mode: 'auto_text'
    };
  }
}

export function serializeEndpointFallbackConfig(config: EndpointFallbackConfig | null | undefined): string | null {
  if (!config || !config.enabled) {
    return null;
  }

  const normalizedMode = normalizeFallbackMode(config.mode) ?? 'auto_json';
  const manualContent = normalizedMode === 'manual' ? normalizeFallbackManualContent(config.manualContent) : null;

  return JSON.stringify({
    enabled: true,
    mode: normalizedMode,
    ...(normalizedMode === 'manual' ? { manualContent } : {})
  });
}
