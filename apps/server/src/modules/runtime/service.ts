import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { renderPromptTemplate } from '@contrix/prompt-compiler';
import { parseEndpointFallbackConfig } from '@contrix/spec-core';
import { buildRuntimeRoutePreview } from '@contrix/spec-core';
import type { ErrorObject } from 'ajv';
import type {
  RuntimeFailureResponse,
  RuntimeInputMode,
  RuntimeMetaResponse,
  RuntimePreflightResponse,
  RuntimeProviderConfig,
  RuntimeProviderType,
  RuntimeReadinessCheckMap,
  RuntimeReadinessStatus,
  RuntimeRenderPromptResult,
  RuntimeRequest,
  RuntimeRequestPreviewResponse,
  RuntimeResponse,
  RuntimeErrorStage,
  RuntimeErrorType,
  RuntimeFallbackMeta,
  ValidationIssue,
  RuntimeSuccessResponse
} from '@contrix/runtime-core';
import type {
  EndpointEffectiveSpec,
  EndpointFallbackConfig,
  EndpointSpec,
  JsonSchemaObject,
  EndpointSummary
} from '@contrix/spec-core';
import { isSilentModeEnabled } from '../../config/silent-mode.js';
import type { SQLiteDatabase } from '../../db/types.js';
import { EndpointRepository } from '../endpoint/repository.js';
import type { RuntimeLogWriteContext } from '../logs/model.js';
import { CallLogWriter } from '../logs/writer.js';
import { PromptRepository } from '../prompt/repository.js';
import { ProjectRepository } from '../project/repository.js';
import { ProviderRegistry } from '../provider/registry.js';
import { RuntimeSettingsService } from '../runtime-settings/service.js';
import { SpecService } from '../spec/service.js';
import { RuntimeModuleError, normalizeRuntimeError, toRuntimeFailureResponse } from './errors.js';
import { resolveAdapter } from './adapters/resolver.js';
import { RuntimeValidationRepairOrchestrator } from './engine/repair-orchestrator.js';
import {
  buildFallbackMessageBundle,
  buildFallbackTextPayload,
  formatLocalTimestamp
} from './fallback-response-utils.js';
import {
  ensureInputMode,
  formatInputValidationError,
  includesObjectType,
  isRecordObject,
  resolveInputSchemaJson,
  resolveJsonModePayload
} from './input-validation-utils.js';
import {
  DEFAULT_ANTHROPIC_VERSION,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  evaluateProviderReadiness,
  normalizeHeaderPreview,
  normalizeMaxApiRetries,
  normalizeTimeout,
  resolveAnthropicCacheControlEnabled,
  resolveAnthropicMaxTokensFromHeaders,
  resolveMaxProviderCalls,
  resolveModel,
  resolveModelMaybe,
  resolveNamespaceFromRoutePreview,
  resolveResponseFormatMode,
  toRuntimeProviderConfig
} from './provider-utils.js';
import { RuntimeStateRepository } from './state-repository.js';
import { normalizeRuntimeTokenUsage } from './usage-normalization.js';

interface RuntimeLoadedContext {
  endpoint: EndpointSummary;
  namespace: string;
  pathSlug: string;
  provider: RuntimeProviderConfig;
  model: string;
  timeoutMs: number;
  maxApiRetries: number;
  specId: string;
  specVersion: number;
  promptSnapshotId: string;
  promptHash: string;
  promptTemplate: string;
  inputMode: RuntimeInputMode;
  inputSchemaJson: JsonSchemaObject | null;
  runtimeReadinessAtExecution: RuntimeReadinessStatus;
  currentSpec: EndpointSpec;
  currentEffectiveSpec: EndpointEffectiveSpec;
  outputSchemaJson: JsonSchemaObject;
}

type AjvValidateFn = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };
type AjvLike = {
  compile: (schema: unknown) => AjvValidateFn;
};
type AjvConstructor = new (options?: Record<string, unknown>) => AjvLike;
const require = createRequire(import.meta.url);
const Ajv = require('ajv').default as AjvConstructor;

export class RuntimeService {
  private readonly endpointRepository: EndpointRepository;
  private readonly projectRepository: ProjectRepository;
  private readonly providerRegistry: ProviderRegistry;
  private readonly specService: SpecService;
  private readonly promptRepository: PromptRepository;
  private readonly runtimeStateRepository: RuntimeStateRepository;
  private readonly callLogWriter: CallLogWriter;
  private readonly runtimeSettingsService: RuntimeSettingsService;

  constructor(db: SQLiteDatabase, runtimeSettingsService?: RuntimeSettingsService) {
    this.endpointRepository = new EndpointRepository(db);
    this.projectRepository = new ProjectRepository(db);
    this.providerRegistry = new ProviderRegistry(db);
    this.specService = new SpecService(db);
    this.promptRepository = new PromptRepository(db);
    this.runtimeStateRepository = new RuntimeStateRepository(db);
    this.callLogWriter = new CallLogWriter(db);
    this.runtimeSettingsService = runtimeSettingsService ?? new RuntimeSettingsService(db);
  }

  getRuntimeMeta(namespace: string, pathSlug: string): RuntimeMetaResponse {
    const preflight = this.getPreflightByRoute(namespace, pathSlug);

    return {
      endpointId: preflight.endpointId,
      endpointName: preflight.endpointName,
      namespace: preflight.namespace,
      pathSlug: preflight.pathSlug,
      routePreview: preflight.routePreview,
      providerId: preflight.providerId,
      providerType: preflight.providerType,
      model: preflight.resolvedModel,
      inputMode: preflight.inputMode,
      specId: preflight.currentSpecId,
      specVersion: preflight.currentSpecVersion,
      promptSnapshotId: preflight.currentPromptSnapshotId,
      promptHash: preflight.currentPromptHash,
      specStatus: preflight.specStatus,
      promptStatus: preflight.promptStatus,
      runtimeReadiness: preflight.runtimeReadiness,
      timeoutMs: this.resolveMetaTimeoutMs(preflight.endpointId),
      maxApiRetries: this.resolveMetaMaxRetries(preflight.endpointId)
    };
  }

  getPreflightByRoute(namespace: string, pathSlug: string, overrideModel?: string): RuntimePreflightResponse {
    const endpoint = this.resolveEndpointByRoute(namespace, pathSlug);
    return this.buildPreflight(endpoint, namespace, pathSlug, overrideModel);
  }

  getPreflightByEndpointId(endpointId: string, overrideModel?: string): RuntimePreflightResponse {
    const endpoint = this.endpointRepository.findById(endpointId);
    if (!endpoint) {
      throw new RuntimeModuleError('ENDPOINT_NOT_FOUND', 'route_resolve', 'Endpoint not found.', {
        statusCode: 404
      });
    }

    const namespace = resolveNamespaceFromRoutePreview(endpoint);
    return this.buildPreflight(endpoint, namespace, endpoint.pathSlug, overrideModel);
  }

  previewRequestByEndpointId(endpointId: string, request: RuntimeRequest): RuntimeRequestPreviewResponse {
    const loaded = this.loadRuntimeContext(endpointId, request.overrideModel);
    const renderedPrompt = this.renderPrompt(loaded.promptTemplate, loaded.inputMode, loaded.inputSchemaJson, request);
    const responseFormatMode = resolveResponseFormatMode(loaded.currentSpec);

    let payloadPreview: Record<string, unknown> = {
      model: loaded.model,
      messages: [{ role: 'user', content: renderedPrompt.finalPrompt }]
    };
    if (loaded.endpoint.temperature !== null && loaded.endpoint.temperature !== undefined) {
      payloadPreview.temperature = loaded.endpoint.temperature;
    }
    if (loaded.endpoint.topP !== null && loaded.endpoint.topP !== undefined) {
      payloadPreview.top_p = loaded.endpoint.topP;
    }
    if (responseFormatMode === 'json_object') {
      payloadPreview.response_format = { type: 'json_object' };
    }

    let previewUrl = `${loaded.provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let previewHeaders = normalizeHeaderPreview({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...loaded.provider.headers,
      Authorization: 'Bearer ****'
    });

    if (loaded.provider.providerType === 'anthropic') {
      const cacheControlEnabled = resolveAnthropicCacheControlEnabled(loaded.provider.headers);
      const anthropicContent = cacheControlEnabled
        ? [{ type: 'text', text: renderedPrompt.finalPrompt, cache_control: { type: 'ephemeral' } }]
        : renderedPrompt.finalPrompt;

      payloadPreview = {
        model: loaded.model,
        max_tokens: resolveAnthropicMaxTokensFromHeaders(loaded.provider.headers),
        messages: [{ role: 'user', content: anthropicContent }]
      };

      if (loaded.endpoint.temperature !== null && loaded.endpoint.temperature !== undefined) {
        payloadPreview.temperature = loaded.endpoint.temperature;
      }

      if (loaded.endpoint.topP !== null && loaded.endpoint.topP !== undefined) {
        payloadPreview.top_p = loaded.endpoint.topP;
      }

      previewUrl = `${loaded.provider.baseUrl.replace(/\/+$/, '')}/messages`;
      previewHeaders = normalizeHeaderPreview({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...loaded.provider.headers,
        'x-api-key': '****',
        'anthropic-version': DEFAULT_ANTHROPIC_VERSION
      });
    }

    return {
      endpointId: loaded.endpoint.id,
      endpointName: loaded.endpoint.name,
      namespace: loaded.namespace,
      pathSlug: loaded.pathSlug,
      routePreview: buildRuntimeRoutePreview(
        loaded.namespace,
        loaded.pathSlug,
        this.runtimeSettingsService.getRuntimeSettings().effective.routePrefix
      ),
      providerId: loaded.provider.providerId,
      providerType: loaded.provider.providerType,
      resolvedModel: loaded.model,
      currentSpecId: loaded.specId,
      currentSpecVersion: loaded.specVersion,
      currentPromptSnapshotId: loaded.promptSnapshotId,
      currentPromptHash: loaded.promptHash,
      inputMode: loaded.inputMode,
      renderedPrompt: renderedPrompt.finalPrompt,
      adapterRequestPayloadPreview: {
        url: previewUrl,
        method: 'POST',
        headers: previewHeaders,
        body: payloadPreview
      },
      timeoutMs: loaded.timeoutMs,
      maxApiRetries: loaded.maxApiRetries,
      checkedAt: new Date().toISOString()
    };
  }

  async executeByRoute(
    namespace: string,
    pathSlug: string,
    request: RuntimeRequest,
    ids?: { runId?: string; requestId?: string }
  ): Promise<RuntimeResponse> {
    const endpoint = this.resolveEndpointByRoute(namespace, pathSlug);
    return this.execute(endpoint, namespace, pathSlug, request, ids);
  }

  async executeByEndpointId(
    endpointId: string,
    request: RuntimeRequest,
    ids?: { runId?: string; requestId?: string }
  ): Promise<RuntimeResponse> {
    const endpoint = this.endpointRepository.findById(endpointId);
    if (!endpoint) {
      throw new RuntimeModuleError('ENDPOINT_NOT_FOUND', 'route_resolve', 'Endpoint not found.', {
        statusCode: 404
      });
    }

    const namespace = resolveNamespaceFromRoutePreview(endpoint);
    return this.execute(endpoint, namespace, endpoint.pathSlug, request, ids);
  }

  private async execute(
    endpoint: EndpointSummary,
    namespace: string,
    pathSlug: string,
    request: RuntimeRequest,
    ids?: { runId?: string; requestId?: string }
  ): Promise<RuntimeResponse> {
    const runId = ids?.runId ?? randomUUID();
    const requestId = ids?.requestId ?? randomUUID();
    const projectName = this.projectRepository.findById(endpoint.projectId)?.name ?? null;
    const fallbackConfig = this.resolveEndpointFallbackConfig(endpoint);
    const logContext: RuntimeLogWriteContext = {
      runId,
      requestId,
      projectId: endpoint.projectId,
      projectName,
      groupId: endpoint.groupId,
      groupName: endpoint.groupName,
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      namespace,
      pathSlug,
      providerId: endpoint.providerId,
      providerName: endpoint.providerName,
      providerType: null,
      model: endpoint.model,
      specId: null,
      specVersion: null,
      promptSnapshotId: null,
      promptHash: null,
      inputMode: null,
      specStatus: endpoint.specStatus,
      promptStatus: null,
      runtimeReadiness: null,
      routePreview: buildRuntimeRoutePreview(
        namespace,
        pathSlug,
        this.runtimeSettingsService.getRuntimeSettings().effective.routePrefix
      ),
      structuredOutputTriggered: false,
      inputText: typeof request.inputText === 'string' ? request.inputText : null,
      inputJson: request.inputJson ?? null,
      renderedPrompt: null
    };

    try {
      const preflight = this.buildPreflight(endpoint, namespace, pathSlug, request.overrideModel);
      logContext.providerType = preflight.providerType;
      logContext.model = preflight.resolvedModel;
      logContext.specId = preflight.currentSpecId;
      logContext.specVersion = preflight.currentSpecVersion;
      logContext.promptSnapshotId = preflight.currentPromptSnapshotId;
      logContext.promptHash = preflight.currentPromptHash;
      logContext.inputMode = preflight.inputMode;
      logContext.specStatus = preflight.specStatus;
      logContext.promptStatus = preflight.promptStatus;
      logContext.runtimeReadiness = preflight.runtimeReadiness;

      if (preflight.runtimeReadiness !== 'ready') {
        throw new RuntimeModuleError(
          'RUNTIME_NOT_READY',
          'preflight',
          `Runtime preflight failed: ${preflight.issues.join('; ') || 'unknown readiness issue.'}`,
          { statusCode: 409 }
        );
      }

      const context = this.loadRuntimeContext(endpoint.id, request.overrideModel);
      logContext.providerId = context.provider.providerId;
      logContext.providerType = context.provider.providerType;
      logContext.model = context.model;
      logContext.specId = context.specId;
      logContext.specVersion = context.specVersion;
      logContext.promptSnapshotId = context.promptSnapshotId;
      logContext.promptHash = context.promptHash;
      logContext.inputMode = context.inputMode;
      logContext.runtimeReadiness = context.runtimeReadinessAtExecution;
      const renderedPrompt = this.renderPrompt(
        context.promptTemplate,
        context.inputMode,
        context.inputSchemaJson,
        request
      );
      logContext.renderedPrompt = renderedPrompt.finalPrompt;
      const adapter = resolveAdapter(context.provider.providerType);
      const orchestrator = new RuntimeValidationRepairOrchestrator();
      const maxProviderCalls = resolveMaxProviderCalls(context.maxApiRetries, context.currentSpec);
      const responseFormatMode = resolveResponseFormatMode(context.currentSpec);
      logContext.structuredOutputTriggered = responseFormatMode === 'json_object';
      const executionContext = {
        runId,
        requestId,
        endpointId: context.endpoint.id,
        namespace: context.namespace,
        pathSlug: context.pathSlug,
        providerId: context.provider.providerId,
        providerType: context.provider.providerType,
        resolvedModel: context.model,
        specId: context.specId,
        specVersion: context.specVersion,
        promptSnapshotId: context.promptSnapshotId,
        promptHash: context.promptHash,
        inputMode: context.inputMode,
        startedAt: new Date().toISOString()
      };

      const orchestration = await orchestrator.execute({
        initialPrompt: renderedPrompt.finalPrompt,
        context: {
          providerType: context.provider.providerType,
          model: context.model,
          timeoutMs: context.timeoutMs,
          promptHash: context.promptHash,
          outputSchema: context.outputSchemaJson,
          rules: context.currentSpec.rules,
          validationPolicy: context.currentSpec.validationPolicy,
          repairPolicy: context.currentSpec.repairPolicy,
          structuredOutputStrategy: context.currentSpec.structuredOutputStrategy,
          maxProviderCalls
        },
          invokeProvider: (invokeInput) =>
            adapter.invoke({
              provider: context.provider,
              model: context.model,
              prompt: invokeInput.prompt,
              timeoutMs: context.timeoutMs,
              temperature: endpoint.temperature,
              topP: endpoint.topP,
              responseFormat: { mode: invokeInput.responseFormatMode ?? responseFormatMode },
              attemptIndex: invokeInput.providerCallIndex
            })
      });

      if (!orchestration.success) {
        if (fallbackConfig) {
          const fallbackResponse = this.buildFallbackSuccessResponse({
            runId,
            requestId,
            endpoint,
            namespace,
            pathSlug,
            fallbackConfig,
            errorType: orchestration.errorType,
            errorStage: orchestration.errorStage,
            message: orchestration.message,
            attempts: orchestration.attempts,
            lastRawOutput: orchestration.lastRawOutput,
            lastValidationIssues: orchestration.lastValidationIssues,
            logContext
          });

          return this.attachCallLogMetadata(fallbackResponse, logContext);
        }

        const failureResponse = this.buildFailureResponse({
          runId,
          requestId,
          endpoint,
          providerType: context.provider.providerType,
          model: context.model,
          specVersion: context.specVersion,
          promptHash: context.promptHash,
          errorType: orchestration.errorType,
          errorStage: orchestration.errorStage,
          message: orchestration.message,
          attempts: orchestration.attempts,
          lastRawOutput: orchestration.lastRawOutput,
          lastValidationIssues: orchestration.lastValidationIssues
        });

        return this.attachCallLogMetadata(failureResponse, logContext);
      }

      const response: RuntimeSuccessResponse = {
        success: true,
        runId,
        requestId,
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        namespace,
        pathSlug,
        routePreview: buildRuntimeRoutePreview(
          namespace,
          pathSlug,
          this.runtimeSettingsService.getRuntimeSettings().effective.routePrefix
        ),
        providerId: context.provider.providerId,
        providerType: context.provider.providerType,
        model: context.model,
        specId: context.specId,
        specVersion: context.specVersion,
        promptSnapshotId: context.promptSnapshotId,
        promptHash: context.promptHash,
        inputMode: context.inputMode,
        runtimeReadinessAtExecution: context.runtimeReadinessAtExecution,
        outputSource: orchestration.outputSource,
        finalOutput: orchestration.finalOutput,
        finalOutputJson: orchestration.finalOutputJson,
        finalOutputRawText: orchestration.finalOutputRawText,
        finalOutputNormalized: orchestration.finalOutputNormalized,
        rawOutput: orchestration.rawOutput,
        attemptCount: orchestration.attempts.length,
        finishReason: orchestration.finishReason,
        usage: normalizeRuntimeTokenUsage(orchestration.usage),
        attempts: orchestration.attempts,
        normalizedProviderResult: orchestration.normalizedProviderResult,
        executionContext
      };

      return this.attachCallLogMetadata(response, logContext);
    } catch (error) {
      const normalized = normalizeRuntimeError(error, {
        type: 'RUNTIME_INTERNAL_ERROR',
        stage: 'runtime',
        message: 'Runtime execution failed.'
      });

      if (fallbackConfig) {
        const fallbackResponse = this.buildFallbackSuccessResponse({
          runId,
          requestId,
          endpoint,
          namespace,
          pathSlug,
          fallbackConfig,
          errorType: normalized.type,
          errorStage: normalized.stage,
          message: normalized.message,
          attempts: [],
          lastRawOutput: null,
          lastValidationIssues: [],
          logContext
        });

        return this.attachCallLogMetadata(fallbackResponse, logContext);
      }

      const failureResponse = toRuntimeFailureResponse(normalized, [], runId, requestId, {
        endpointId: endpoint.id,
        providerType: null,
        model: endpoint.model,
        specVersion: null,
        promptHash: null,
        lastRawOutput: null,
        lastValidationIssues: []
      });

      return this.attachCallLogMetadata(failureResponse, logContext);
    }
  }

  private buildFailureResponse(input: {
    runId: string;
    requestId: string;
    endpoint: EndpointSummary;
    providerType: RuntimeProviderType;
    model: string;
    specVersion: number;
    promptHash: string;
    errorType: RuntimeFailureResponse['error']['type'];
    errorStage: RuntimeFailureResponse['error']['stage'];
    message: string;
    attempts: RuntimeFailureResponse['attempts'];
    lastRawOutput: string | null;
    lastValidationIssues: RuntimeFailureResponse['lastValidationIssues'];
  }): RuntimeFailureResponse {
    const attemptCount = input.attempts.length;

    return {
      success: false,
      runId: input.runId,
      requestId: input.requestId,
      error: {
        type: input.errorType,
        stage: input.errorStage,
        message: input.message,
        attemptCount,
        endpointId: input.endpoint.id,
        providerType: input.providerType,
        model: input.model,
        specVersion: input.specVersion,
        promptHash: input.promptHash,
        lastRawOutput: input.lastRawOutput,
        lastValidationIssues: input.lastValidationIssues,
        requestId: input.requestId,
        runId: input.runId,
        timestamp: new Date().toISOString()
      },
      attemptCount,
      attempts: input.attempts,
      lastRawOutput: input.lastRawOutput,
      lastValidationIssues: input.lastValidationIssues
    };
  }

  private resolveEndpointFallbackConfig(endpoint: EndpointSummary): EndpointFallbackConfig | null {
    return parseEndpointFallbackConfig(endpoint.fallback);
  }

  private buildFallbackSuccessResponse(input: {
    runId: string;
    requestId: string;
    endpoint: EndpointSummary;
    namespace: string;
    pathSlug: string;
    fallbackConfig: EndpointFallbackConfig;
    errorType: RuntimeErrorType;
    errorStage: RuntimeErrorStage;
    message: string;
    attempts: RuntimeFailureResponse['attempts'];
    lastRawOutput: string | null;
    lastValidationIssues: ValidationIssue[];
    logContext: RuntimeLogWriteContext;
  }): RuntimeSuccessResponse {
    const now = new Date();
    const timestamp = formatLocalTimestamp(now);
    const debugTimestamp = now.toISOString();
    const runtimePath = buildRuntimeRoutePreview(
      input.namespace,
      input.pathSlug,
      this.runtimeSettingsService.getRuntimeSettings().effective.routePrefix
    );
    const messageBundle = buildFallbackMessageBundle({
      errorType: input.errorType,
      errorStage: input.errorStage,
      message: input.message,
      validationIssues: input.lastValidationIssues
    });

    const fallbackMeta: RuntimeFallbackMeta = {
      mode: input.fallbackConfig.mode,
      sourceErrorType: input.errorType,
      sourceErrorStage: input.errorStage,
      sourceMessage: input.message,
      messages: messageBundle,
      timestamp: debugTimestamp
    };

    const fallbackJsonPayload = {
      isError: true,
      reason: messageBundle.reason,
      detail: messageBundle.detail,
      path: runtimePath,
      timestamp
    };
    const fallbackTextPayload = buildFallbackTextPayload({
      timestamp,
      path: runtimePath,
      reason: messageBundle.reason,
      detail: messageBundle.detail
    });
    let finalOutputJson: unknown;
    let finalOutputRawText: string;
    let outputSource: RuntimeSuccessResponse['outputSource'];

    if (input.fallbackConfig.mode === 'auto_text') {
      finalOutputJson = fallbackTextPayload;
      finalOutputRawText = fallbackTextPayload;
      outputSource = 'fallback_auto_text';
    } else if (input.fallbackConfig.mode === 'manual') {
      const manualContent = input.fallbackConfig.manualContent?.trim() ?? '';

      if (!manualContent) {
        finalOutputJson = fallbackJsonPayload;
        finalOutputRawText = JSON.stringify(fallbackJsonPayload, null, 2);
        outputSource = 'fallback_auto_json';
        fallbackMeta.manualContentType = 'empty';
      } else {
        try {
          const parsedManualJson = JSON.parse(manualContent);
          finalOutputJson = parsedManualJson;
          finalOutputRawText = JSON.stringify(parsedManualJson, null, 2);
          outputSource = 'fallback_manual_json';
          fallbackMeta.manualContentType = 'json';
        } catch {
          finalOutputJson = manualContent;
          finalOutputRawText = manualContent;
          outputSource = 'fallback_manual_text';
          fallbackMeta.manualContentType = 'text';
        }
      }
    } else {
      finalOutputJson = fallbackJsonPayload;
      finalOutputRawText = JSON.stringify(fallbackJsonPayload, null, 2);
      outputSource = 'fallback_auto_json';
    }

    const providerType = input.logContext.providerType ?? 'custom';
    const providerId = input.logContext.providerId ?? input.endpoint.providerId ?? 'fallback_provider_unavailable';
    const resolvedModel = input.logContext.model ?? input.endpoint.model ?? 'fallback_model_unavailable';
    const inputMode: RuntimeInputMode =
      input.logContext.inputMode === 'json' || input.logContext.inputMode === 'text'
        ? input.logContext.inputMode
        : input.logContext.inputJson !== null
          ? 'json'
          : 'text';
    const specId = input.logContext.specId ?? 'fallback_spec_unavailable';
    const specVersion = input.logContext.specVersion ?? 0;
    const promptSnapshotId = input.logContext.promptSnapshotId ?? 'fallback_prompt_unavailable';
    const promptHash = input.logContext.promptHash ?? 'fallback_prompt_hash_unavailable';
    const runtimeReadinessAtExecution = input.logContext.runtimeReadiness ?? 'not_ready';
    const usage = normalizeRuntimeTokenUsage(null);

    return {
      success: true,
      runId: input.runId,
      requestId: input.requestId,
      endpointId: input.endpoint.id,
      endpointName: input.endpoint.name,
      namespace: input.namespace,
      pathSlug: input.pathSlug,
      routePreview: buildRuntimeRoutePreview(
        input.namespace,
        input.pathSlug,
        this.runtimeSettingsService.getRuntimeSettings().effective.routePrefix
      ),
      providerId,
      providerType,
      model: resolvedModel,
      specId,
      specVersion,
      promptSnapshotId,
      promptHash,
      inputMode,
      runtimeReadinessAtExecution,
      outputSource,
      finalOutput: finalOutputRawText,
      finalOutputJson,
      finalOutputRawText,
      finalOutputNormalized: finalOutputJson,
      rawOutput: input.lastRawOutput ?? finalOutputRawText,
      attemptCount: input.attempts.length,
      finishReason: 'fallback',
      usage,
      attempts: input.attempts,
      normalizedProviderResult: {
        rawText: input.lastRawOutput ?? '',
        finishReason: 'fallback',
        usage,
        rawResponse: null,
        providerResponseMeta: {
          requestId: null,
          model: resolvedModel,
          providerType,
          statusCode: null
        }
      },
      executionContext: {
        runId: input.runId,
        requestId: input.requestId,
        endpointId: input.endpoint.id,
        namespace: input.namespace,
        pathSlug: input.pathSlug,
        providerId,
        providerType,
        resolvedModel,
        specId,
        specVersion,
        promptSnapshotId,
        promptHash,
        inputMode,
        startedAt: timestamp
      },
      fallbackMeta
    };
  }

  private attachCallLogMetadata(
    response: RuntimeResponse,
    context: RuntimeLogWriteContext
  ): RuntimeResponse {
    if (isSilentModeEnabled()) {
      return response;
    }

    try {
      const usage = response.success ? response.usage : normalizeRuntimeTokenUsage(null);

      const callLogId = this.callLogWriter.writeRuntimeLog({
        context,
        response,
        usage
      });

      return {
        ...response,
        callLogId
      };
    } catch (error) {
      return {
        ...response,
        logWriteFailed: true,
        logWriteError: error instanceof Error ? error.message : 'Unknown log write failure.'
      };
    }
  }

  private buildPreflight(
    endpoint: EndpointSummary,
    namespace: string,
    pathSlug: string,
    overrideModel?: string
  ): RuntimePreflightResponse {
    this.runtimeStateRepository.ensureEndpointState(endpoint.id, endpoint.specStatus);

    let inputMode: RuntimeInputMode | null = null;
    let specIssue: string | null = null;

    try {
      const currentSpec = this.specService.getCurrentSpec(endpoint.id);
      inputMode = ensureInputMode(currentSpec.currentEffectiveSpec.input.mode);
    } catch (error) {
      const normalized = normalizeRuntimeError(error, {
        type: 'SPEC_NOT_FOUND',
        stage: 'resource_load',
        message: 'Current spec could not be resolved.',
        statusCode: 400
      });
      specIssue = normalized.message;
    }

    const state = this.runtimeStateRepository.getEndpointState(endpoint.id);
    if (!state) {
      throw new RuntimeModuleError('RUNTIME_INTERNAL_ERROR', 'preflight', 'Runtime state is unavailable.', {
        statusCode: 500
      });
    }

    const providerResolved = endpoint.providerId
      ? this.providerRegistry.resolve(endpoint.providerId)
      : null;
    const providerEvaluation = evaluateProviderReadiness(endpoint.providerId, providerResolved);
    const resolvedModel = resolveModelMaybe(
      overrideModel,
      endpoint.model,
      providerResolved?.defaultModel ?? null
    );
    const promptSnapshot = state.currentPromptSnapshotId
      ? this.promptRepository.findById(state.currentPromptSnapshotId)
      : null;

    const checks: RuntimeReadinessCheckMap = {
      endpoint: true,
      provider: providerEvaluation.ok,
      spec:
        state.specStatus === 'current' &&
        Boolean(state.currentSpecId) &&
        typeof state.currentSpecVersion === 'number',
      prompt:
        state.promptStatus === 'current' &&
        Boolean(state.currentPromptSnapshotId) &&
        Boolean(state.currentPromptHash) &&
        Boolean(promptSnapshot),
      model: Boolean(resolvedModel),
      inputMode: Boolean(inputMode)
    };

    const issues: string[] = [];
    if (!checks.provider && providerEvaluation.issue) {
      issues.push(providerEvaluation.issue);
    }

    if (!checks.spec) {
      issues.push(specIssue ?? 'Current spec is missing or stale.');
    }

    if (!checks.prompt) {
      if (state.promptStatus === 'compile_error') {
        issues.push(
          state.lastPromptCompileError
            ? `Prompt compile error: ${state.lastPromptCompileError}`
            : 'Prompt compile failed.'
        );
      } else if (state.promptStatus === 'stale') {
        issues.push('Prompt snapshot is stale.');
      } else if (state.promptStatus === 'missing') {
        issues.push('Prompt snapshot is missing.');
      } else {
        issues.push('Prompt snapshot is unavailable.');
      }
    }

    if (!checks.model) {
      issues.push('Model is not configured.');
    }

    if (!checks.inputMode) {
      issues.push('Input mode is missing or invalid in current spec.');
    }

    const blocking = Object.values(checks).some((value) => !value);
    const runtimeReadiness: RuntimeReadinessStatus = blocking
      ? 'not_ready'
      : issues.length > 0
        ? 'degraded'
        : 'ready';
    const checkedAt = new Date().toISOString();

    this.runtimeStateRepository.setRuntimeReadiness(endpoint.id, runtimeReadiness, checkedAt);

    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      namespace,
      pathSlug,
      providerId: endpoint.providerId,
      providerType: providerEvaluation.providerType,
      resolvedModel,
      currentSpecId: state.currentSpecId,
      currentSpecVersion: state.currentSpecVersion,
      currentPromptSnapshotId: state.currentPromptSnapshotId,
      currentPromptHash: state.currentPromptHash,
      specStatus: state.specStatus,
      promptStatus: state.promptStatus,
      runtimeReadiness,
      checks,
      issues,
      inputMode,
      routePreview: buildRuntimeRoutePreview(namespace, pathSlug, this.runtimeSettingsService.getRuntimeSettings().effective.routePrefix),
      checkedAt
    };
  }

  private loadRuntimeContext(endpointId: string, overrideModel?: string): RuntimeLoadedContext {
    const endpoint = this.endpointRepository.findById(endpointId);
    if (!endpoint) {
      throw new RuntimeModuleError('ENDPOINT_NOT_FOUND', 'route_resolve', 'Endpoint not found.', {
        statusCode: 404
      });
    }

    const namespace = resolveNamespaceFromRoutePreview(endpoint);
    const preflight = this.buildPreflight(endpoint, namespace, endpoint.pathSlug, overrideModel);

    if (preflight.runtimeReadiness !== 'ready') {
      throw new RuntimeModuleError(
        'RUNTIME_NOT_READY',
        'preflight',
        `Runtime is not ready: ${preflight.issues.join('; ') || 'unknown issue.'}`,
        { statusCode: 409 }
      );
    }

    if (!endpoint.providerId) {
      throw new RuntimeModuleError(
        'PROVIDER_NOT_FOUND',
        'resource_load',
        'Endpoint does not have a provider configured.',
        { statusCode: 400 }
      );
    }

    const providerRecord = this.providerRegistry.resolve(endpoint.providerId);
    if (!providerRecord) {
      throw new RuntimeModuleError('PROVIDER_NOT_FOUND', 'resource_load', 'Provider not found.', {
        statusCode: 404
      });
    }

    const provider = toRuntimeProviderConfig(providerRecord);
    const model = resolveModel(
      overrideModel,
      endpoint.model,
      providerRecord.defaultModel?.trim() ? providerRecord.defaultModel : null
    );
    const timeoutMs = normalizeTimeout(endpoint.timeoutMs, provider.timeoutMs);
    const currentSpecState = this.specService.getCurrentSpec(endpoint.id);
    const currentSpec = currentSpecState.currentSpec;
    const currentEffectiveSpec = currentSpecState.currentEffectiveSpec;
    let state = this.runtimeStateRepository.getEndpointState(endpoint.id);

    if (!state) {
      throw new RuntimeModuleError('SPEC_NOT_FOUND', 'resource_load', 'Runtime state is missing.', {
        statusCode: 409
      });
    }

    const specPointerMismatch =
      state.currentSpecId !== currentSpec.id ||
      state.currentSpecVersion !== currentSpec.version ||
      state.specStatus !== 'current';

    if (specPointerMismatch) {
      const now = new Date().toISOString();
      state = this.runtimeStateRepository.setSpecPointer(endpoint.id, {
        currentSpecId: currentSpec.id,
        currentSpecVersion: currentSpec.version,
        specStatus: 'current',
        invalidatePrompt:
          state.currentSpecId !== currentSpec.id || state.currentSpecVersion !== currentSpec.version,
        updatedAt: now
      });
    }

    if (!state.currentPromptSnapshotId || !state.currentPromptHash || state.promptStatus !== 'current') {
      throw new RuntimeModuleError(
        state.promptStatus === 'compile_error' ? 'PROMPT_COMPILE_ERROR' : 'PROMPT_STALE',
        'resource_load',
        'Current prompt snapshot is missing, stale, or failed to compile.',
        { statusCode: 409 }
      );
    }

    const snapshot = this.promptRepository.findById(state.currentPromptSnapshotId);
    if (!snapshot) {
      throw new RuntimeModuleError('PROMPT_NOT_FOUND', 'resource_load', 'Prompt snapshot does not exist.', {
        statusCode: 409
      });
    }

    const promptMismatch =
      snapshot.promptHash !== state.currentPromptHash ||
      snapshot.specId !== currentSpec.id ||
      snapshot.specVersion !== currentSpec.version;

    if (promptMismatch) {
      throw new RuntimeModuleError(
        'PROMPT_STALE',
        'resource_load',
        'Prompt snapshot does not match current spec version.',
        { statusCode: 409 }
      );
    }

    const inputMode = ensureInputMode(currentEffectiveSpec.input.mode);
    const inputSchemaJson = resolveInputSchemaJson(inputMode, currentEffectiveSpec.input.schema);
    const outputSchemaJson = currentEffectiveSpec.output.schema;

    if (inputMode === 'json' && !inputSchemaJson) {
      throw new RuntimeModuleError(
        'SPEC_NOT_FOUND',
        'resource_load',
        'Current spec is missing input validation schema for json input mode.',
        { statusCode: 409 }
      );
    }

    if (!includesObjectType(outputSchemaJson.type)) {
      throw new RuntimeModuleError(
        'SPEC_NOT_FOUND',
        'resource_load',
        'Current spec output schema root must be object.',
        { statusCode: 409 }
      );
    }

    return {
      endpoint,
      namespace,
      pathSlug: endpoint.pathSlug,
      provider,
      model,
      timeoutMs,
      maxApiRetries: normalizeMaxApiRetries(endpoint.maxApiRetries),
      specId: currentSpec.id,
      specVersion: currentSpec.version,
      promptSnapshotId: snapshot.id,
      promptHash: snapshot.promptHash,
      promptTemplate: snapshot.promptText,
      inputMode,
      inputSchemaJson,
      runtimeReadinessAtExecution: preflight.runtimeReadiness,
      currentSpec,
      currentEffectiveSpec,
      outputSchemaJson
    };
  }

  private renderPrompt(
    template: string,
    inputMode: RuntimeInputMode,
    inputSchemaJson: JsonSchemaObject | null,
    request: RuntimeRequest
  ): RuntimeRenderPromptResult {
    if (inputMode === 'text') {
      if (typeof request.inputText !== 'string') {
        throw new RuntimeModuleError(
          'INPUT_MODE_MISMATCH',
          'request_validation',
          'inputText is required for text input mode.',
          { statusCode: 400 }
        );
      }

      return {
        finalPrompt: renderPromptTemplate(template, { inputText: request.inputText }),
        usedInputMode: 'text'
      };
    }

    const payload = resolveJsonModePayload(request, inputSchemaJson);
    if (!payload || !isRecordObject(payload)) {
      throw new RuntimeModuleError(
        'INPUT_MODE_MISMATCH',
        'request_validation',
        'JSON input body must be an object.',
        { statusCode: 400 }
      );
    }

    if (inputSchemaJson) {
      const ajv = new Ajv({
        allErrors: true,
        strict: false,
        allowUnionTypes: true,
        coerceTypes: false
      });
      const validate = ajv.compile(inputSchemaJson);
      const valid = validate(payload);
      if (!valid) {
        throw new RuntimeModuleError(
          'VALIDATION_ERROR',
          'request_validation',
          formatInputValidationError(validate.errors),
          { statusCode: 400 }
        );
      }
    }

    return {
      finalPrompt: renderPromptTemplate(template, { inputJson: payload }),
      usedInputMode: 'json'
    };
  }

  private resolveEndpointByRoute(namespace: string, pathSlug: string): EndpointSummary {
    const normalizedNamespace = namespace.trim();
    const normalizedPathSlug = pathSlug.trim();

    if (!normalizedNamespace || !normalizedPathSlug) {
      throw new RuntimeModuleError('ENDPOINT_NOT_FOUND', 'route_resolve', 'namespace and pathSlug are required.', {
        statusCode: 400
      });
    }

    const endpoint = this.endpointRepository.findByNamespaceAndPathSlug(
      normalizedNamespace,
      normalizedPathSlug
    );

    if (!endpoint) {
      throw new RuntimeModuleError(
        'ENDPOINT_NOT_FOUND',
        'route_resolve',
        `Runtime endpoint "${normalizedNamespace}/${normalizedPathSlug}" was not found.`,
        { statusCode: 404 }
      );
    }

    return endpoint;
  }

  private resolveMetaTimeoutMs(endpointId: string): number {
    const endpoint = this.endpointRepository.findById(endpointId);
    if (!endpoint || !endpoint.providerId) {
      return DEFAULT_PROVIDER_TIMEOUT_MS;
    }

    const provider = this.providerRegistry.getSummary(endpoint.providerId);
    if (!provider) {
      return DEFAULT_PROVIDER_TIMEOUT_MS;
    }

    return normalizeTimeout(endpoint.timeoutMs, provider.timeoutMs);
  }

  private resolveMetaMaxRetries(endpointId: string): number {
    const endpoint = this.endpointRepository.findById(endpointId);
    if (!endpoint) {
      return 0;
    }

    return normalizeMaxApiRetries(endpoint.maxApiRetries);
  }
}
