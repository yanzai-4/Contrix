import type {
  ExportProjectOptions,
  ExportProjectPreflightResponse,
  ExportReadyEndpointItem,
  ExportSkippedEndpointItem,
  ExportType,
  InputMode,
  JsonSchemaObject
} from '@contrix/spec-core';
import type { EndpointSpec, EndpointSummary, ProviderType } from '@contrix/spec-core';
import type { PromptSnapshotModel } from '@contrix/spec-core';

export interface ExportProviderConfig {
  providerRef: string;
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  defaultBaseUrl: string | null;
  defaultModel: string;
  defaultTimeoutMs: number;
  staticHeaders: Record<string, string>;
  env: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    timeoutMs: string;
  };
}

export interface ExportRouteRecord {
  endpointId: string;
  endpointName: string;
  pathSlug: string;
  fullPath: string;
  routePreview: string;
  providerRef: string;
  providerType: ProviderType;
  inputMode: InputMode;
  specId: string;
  specVersion: number;
  promptHash: string;
  promptTemplate: string;
  model: string | null;
  inputJsonSchema: JsonSchemaObject | null;
  outputJsonSchema: JsonSchemaObject;
  validationPolicy: EndpointSpec['validationPolicy'];
  repairPolicy: EndpointSpec['repairPolicy'];
  structuredOutputStrategy: EndpointSpec['structuredOutputStrategy'];
  runtimePolicy: {
    timeoutMs: number | null;
    maxApiRetries: number;
    maxRepairRounds: number;
    temperature: number | null;
    topP: number | null;
  };
}

export interface ExportableEndpointContext {
  endpoint: EndpointSummary;
  providerRef: string;
  providerConfig: ExportProviderConfig;
  spec: EndpointSpec;
  promptSnapshot: PromptSnapshotModel;
  route: ExportRouteRecord;
  warnings: string[];
}

export interface ExportArtifacts {
  project: {
    id: string;
    name: string;
    description: string | null;
    apiNamespace: string;
  };
  generatedAt: string;
  spec: {
    project: {
      id: string;
      name: string;
      description: string | null;
      apiNamespace: string;
    };
    generatedAt: string;
    endpoints: Array<{
      endpointId: string;
      name: string;
      namespace: string;
      pathSlug: string;
      fullPath: string;
      specVersion: number;
      promptHash: string;
      spec: EndpointSpec;
    }>;
  };
  router: {
    projectId: string;
    projectName: string;
    namespace: string;
    routePrefix: string;
    generatedAt: string;
    routes: ExportRouteRecord[];
  };
  runtimeConfig: {
    projectName: string;
    namespace: string;
    runtime: {
      port: number;
      host: string;
      routePrefix: string;
    };
    providers: ExportProviderConfig[];
    defaults: {
      maxApiRetries: number;
      maxRepairRounds: number;
    };
  };
}

export interface ExportPreparationResult {
  preflight: ExportProjectPreflightResponse;
  contexts: ExportableEndpointContext[];
  artifacts: ExportArtifacts;
}

export interface NormalizedExportOptions {
  exportType: ExportType;
  outputDir: string | null;
  includeExamples: boolean;
  includeDocs: boolean;
  includeStandaloneRuntime: boolean;
  includeEmbeddableRuntime: boolean;
}

export interface RuntimeTemplateInput {
  routePrefix: string;
}

export interface ExportSummary {
  ready: ExportReadyEndpointItem[];
  skipped: ExportSkippedEndpointItem[];
  warnings: string[];
  blockingIssues: string[];
}

export type ExportPayload = ExportProjectOptions;
