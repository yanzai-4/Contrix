import { create } from 'zustand';
import type {
  PromptCompileResponse,
  PromptStateResponse,
  RetryAttemptMeta,
  RuntimeFailureResponse,
  RuntimeMetaResponse,
  RuntimeOutputSource,
  RuntimePreflightResponse,
  RuntimeRequest,
  RuntimeRequestPreviewResponse,
  RuntimeResponse,
  ValidationIssue
} from '@contrix/runtime-core';
import type { EndpointSummary, JsonSchemaObject } from '@contrix/spec-core';
import {
  compileEndpointPrompt,
  fetchEndpointSpecCurrent,
  fetchPromptState,
  fetchRuntimeMeta,
  fetchRuntimePreflightByEndpoint,
  previewRuntimeRequestByEndpoint,
  runRuntimeByEndpoint
} from '../services/api';
import { buildRuntimeRequestPayload } from '../utils/runtimeRequestPayload';

interface RuntimeRouteParts {
  namespace: string;
  pathSlug: string;
}

interface RuntimeReadinessView {
  status: RuntimePreflightResponse['runtimeReadiness'];
  checks: RuntimePreflightResponse['checks'];
  issues: RuntimePreflightResponse['issues'];
}

interface RuntimeValidationState {
  outputSource: RuntimeOutputSource | null;
  lastValidationIssues: ValidationIssue[];
}

interface RuntimeFinalOutputState {
  outputSource: RuntimeOutputSource | null;
  finalOutputJson: unknown | null;
  finalOutputRawText: string | null;
  finalOutputNormalized: unknown | null;
}

interface EndpointRuntimeStoreState {
  endpointId: string | null;
  endpointName: string | null;
  routePreview: string | null;
  routeParts: RuntimeRouteParts | null;
  runtimeMeta: RuntimeMetaResponse | null;
  inputJsonSchema: JsonSchemaObject | null;
  runtimeResult: RuntimeResponse | null;
  inputText: string;
  inputJsonText: string;
  overrideModel: string;
  loadingMeta: boolean;
  checkingReadiness: boolean;
  previewingRequest: boolean;
  compilingPrompt: boolean;
  running: boolean;
  error: string | null;
  runtimePreflightState: RuntimePreflightResponse | null;
  runtimeReadinessState: RuntimeReadinessView | null;
  currentPromptState: PromptStateResponse | null;
  promptCompileStatusState: PromptCompileResponse | null;
  executionContextPreviewState: RuntimeRequestPreviewResponse | null;
  runtimeAttemptTraceState: RetryAttemptMeta[];
  validationState: RuntimeValidationState;
  repairTraceState: RetryAttemptMeta[];
  runtimeValidatedResultState: RuntimeResponse | null;
  finalOutputState: RuntimeFinalOutputState;
  finalErrorState: RuntimeFailureResponse['error'] | null;
  openRunner: (endpoint: EndpointSummary) => Promise<void>;
  closeRunner: () => void;
  refreshMeta: () => Promise<void>;
  checkReadiness: () => Promise<void>;
  compilePromptForRuntime: () => Promise<void>;
  previewCurrentRequest: () => Promise<void>;
  setInputText: (value: string) => void;
  setInputJsonText: (value: string) => void;
  setOverrideModel: (value: string) => void;
  runRuntime: () => Promise<void>;
  clearError: () => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected runtime execution error';
}

function parseRoutePreview(routePreview: string, pathSlug: string): RuntimeRouteParts | null {
  const prefix = '/runtime/';
  if (!routePreview.startsWith(prefix)) {
    return null;
  }

  const afterPrefix = routePreview.slice(prefix.length);
  const suffix = `/${pathSlug}`;

  if (!afterPrefix.toLowerCase().endsWith(suffix.toLowerCase())) {
    return null;
  }

  const namespace = afterPrefix.slice(0, afterPrefix.length - suffix.length).trim();
  if (!namespace) {
    return null;
  }

  return {
    namespace,
    pathSlug
  };
}

function extractJsonInputSchemaFromEffectiveSpec(
  specCurrent: Awaited<ReturnType<typeof fetchEndpointSpecCurrent>>
): JsonSchemaObject | null {
  const source = specCurrent.currentEffectiveSpec.input.schema;
  if (!source || typeof source !== 'object' || !('type' in source)) {
    return null;
  }

  return source;
}

export const useEndpointRuntimeStore = create<EndpointRuntimeStoreState>((set, get) => ({
  endpointId: null,
  endpointName: null,
  routePreview: null,
  routeParts: null,
  runtimeMeta: null,
  inputJsonSchema: null,
  runtimeResult: null,
  inputText: '',
  inputJsonText: '{}',
  overrideModel: '',
  loadingMeta: false,
  checkingReadiness: false,
  previewingRequest: false,
  compilingPrompt: false,
  running: false,
  error: null,
  runtimePreflightState: null,
  runtimeReadinessState: null,
  currentPromptState: null,
  promptCompileStatusState: null,
  executionContextPreviewState: null,
  runtimeAttemptTraceState: [],
  validationState: {
    outputSource: null,
    lastValidationIssues: []
  },
  repairTraceState: [],
  runtimeValidatedResultState: null,
  finalOutputState: {
    outputSource: null,
    finalOutputJson: null,
    finalOutputRawText: null,
    finalOutputNormalized: null
  },
  finalErrorState: null,
  openRunner: async (endpoint) => {
    const routeParts = parseRoutePreview(endpoint.routePreview, endpoint.pathSlug);

    set({
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      routePreview: endpoint.routePreview,
      routeParts,
      runtimeMeta: null,
      inputJsonSchema: null,
      runtimeResult: null,
      inputText: '',
      inputJsonText: '{}',
      overrideModel: '',
      loadingMeta: true,
      checkingReadiness: true,
      previewingRequest: false,
      compilingPrompt: false,
      running: false,
      error: null,
      runtimePreflightState: null,
      runtimeReadinessState: null,
      currentPromptState: null,
      promptCompileStatusState: null,
      executionContextPreviewState: null,
      runtimeAttemptTraceState: [],
      validationState: {
        outputSource: null,
        lastValidationIssues: []
      },
      repairTraceState: [],
      runtimeValidatedResultState: null,
      finalOutputState: {
        outputSource: null,
        finalOutputJson: null,
        finalOutputRawText: null,
        finalOutputNormalized: null
      },
      finalErrorState: null
    });

    if (!routeParts) {
      set({
        loadingMeta: false,
        checkingReadiness: false,
        error: 'Route preview is invalid. Unable to load runtime metadata.'
      });
      return;
    }

    try {
      const [meta, preflight, promptState, specCurrent] = await Promise.all([
        fetchRuntimeMeta(routeParts.namespace, routeParts.pathSlug),
        fetchRuntimePreflightByEndpoint(endpoint.id),
        fetchPromptState(endpoint.id),
        fetchEndpointSpecCurrent(endpoint.id)
      ]);

      const effectiveInputSchema =
        preflight.inputMode === 'json' && meta.inputMode === 'json'
          ? extractJsonInputSchemaFromEffectiveSpec(specCurrent)
          : null;

      set({
        runtimeMeta: meta,
        inputJsonSchema: effectiveInputSchema,
        runtimePreflightState: preflight,
        runtimeReadinessState: {
          status: preflight.runtimeReadiness,
          checks: preflight.checks,
          issues: preflight.issues
        },
        currentPromptState: promptState,
        loadingMeta: false,
        checkingReadiness: false
      });
    } catch (error) {
      set({
        loadingMeta: false,
        checkingReadiness: false,
        error: toErrorMessage(error)
      });
    }
  },
  closeRunner: () =>
    set({
      endpointId: null,
      endpointName: null,
      routePreview: null,
      routeParts: null,
      runtimeMeta: null,
      inputJsonSchema: null,
      runtimeResult: null,
      inputText: '',
      inputJsonText: '{}',
      overrideModel: '',
      loadingMeta: false,
      checkingReadiness: false,
      previewingRequest: false,
      compilingPrompt: false,
      running: false,
      error: null,
      runtimePreflightState: null,
      runtimeReadinessState: null,
      currentPromptState: null,
      promptCompileStatusState: null,
      executionContextPreviewState: null,
      runtimeAttemptTraceState: [],
      validationState: {
        outputSource: null,
        lastValidationIssues: []
      },
      repairTraceState: [],
      runtimeValidatedResultState: null,
      finalOutputState: {
        outputSource: null,
        finalOutputJson: null,
        finalOutputRawText: null,
        finalOutputNormalized: null
      },
      finalErrorState: null
    }),
  refreshMeta: async () => {
    const routeParts = get().routeParts;

    if (!routeParts) {
      set({ error: 'Route preview is unavailable.' });
      return;
    }

    set({ loadingMeta: true, error: null });

    try {
      const meta = await fetchRuntimeMeta(routeParts.namespace, routeParts.pathSlug);
      set({
        runtimeMeta: meta,
        loadingMeta: false
      });
    } catch (error) {
      set({
        loadingMeta: false,
        error: toErrorMessage(error)
      });
    }
  },
  checkReadiness: async () => {
    const endpointId = get().endpointId;
    if (!endpointId) {
      return;
    }

    set({ checkingReadiness: true, error: null });

    try {
      const [preflight, promptState, specCurrent] = await Promise.all([
        fetchRuntimePreflightByEndpoint(endpointId),
        fetchPromptState(endpointId),
        fetchEndpointSpecCurrent(endpointId)
      ]);

      const effectiveInputSchema =
        preflight.inputMode === 'json'
          ? extractJsonInputSchemaFromEffectiveSpec(specCurrent)
          : null;

      set({
        inputJsonSchema: effectiveInputSchema,
        runtimePreflightState: preflight,
        runtimeReadinessState: {
          status: preflight.runtimeReadiness,
          checks: preflight.checks,
          issues: preflight.issues
        },
        currentPromptState: promptState,
        checkingReadiness: false
      });
    } catch (error) {
      set({
        checkingReadiness: false,
        error: toErrorMessage(error)
      });
    }
  },
  compilePromptForRuntime: async () => {
    const endpointId = get().endpointId;
    if (!endpointId) {
      return;
    }

    set({
      compilingPrompt: true,
      error: null
    });

    try {
      const compileResult = await compileEndpointPrompt(endpointId);
      const [preflight, promptState] = await Promise.all([
        fetchRuntimePreflightByEndpoint(endpointId),
        fetchPromptState(endpointId)
      ]);

      set({
        promptCompileStatusState: compileResult,
        runtimePreflightState: preflight,
        runtimeReadinessState: {
          status: preflight.runtimeReadiness,
          checks: preflight.checks,
          issues: preflight.issues
        },
        currentPromptState: promptState,
        compilingPrompt: false
      });
    } catch (error) {
      set({
        compilingPrompt: false,
        error: toErrorMessage(error)
      });
    }
  },
  previewCurrentRequest: async () => {
    const endpointId = get().endpointId;
    if (!endpointId) {
      return;
    }

    const inputMode = get().runtimePreflightState?.inputMode ?? get().runtimeMeta?.inputMode ?? null;
    set({ previewingRequest: true, error: null });

    try {
      const payload = buildRuntimeRequestPayload(
        inputMode,
        get().inputText,
        get().inputJsonText,
        get().overrideModel
      );
      const preview = await previewRuntimeRequestByEndpoint(endpointId, payload);

      set({
        executionContextPreviewState: preview,
        previewingRequest: false
      });
    } catch (error) {
      set({
        previewingRequest: false,
        error: toErrorMessage(error)
      });
    }
  },
  setInputText: (value) => set({ inputText: value }),
  setInputJsonText: (value) => set({ inputJsonText: value }),
  setOverrideModel: (value) => set({ overrideModel: value }),
  runRuntime: async () => {
    const endpointId = get().endpointId;

    if (!endpointId) {
      set({ error: 'Select an endpoint first.' });
      return;
    }

    const inputMode = get().runtimePreflightState?.inputMode ?? get().runtimeMeta?.inputMode ?? null;
    if (!inputMode) {
      set({ error: 'Input mode is unavailable. Run readiness check first.' });
      return;
    }

    const readiness = get().runtimeReadinessState;
    if (!readiness || readiness.status !== 'ready') {
      set({
        error: readiness
          ? `Runtime is not ready: ${readiness.issues.join('; ') || 'unknown issue.'}`
          : 'Runtime readiness has not been checked.'
      });
      return;
    }

    let payload: RuntimeRequest;
    try {
      payload = buildRuntimeRequestPayload(
        inputMode,
        get().inputText,
        get().inputJsonText,
        get().overrideModel
      );
    } catch (error) {
      set({ error: toErrorMessage(error) });
      return;
    }

    set({
      running: true,
      error: null,
      runtimeResult: null,
      runtimeAttemptTraceState: [],
      validationState: {
        outputSource: null,
        lastValidationIssues: []
      },
      repairTraceState: [],
      runtimeValidatedResultState: null,
      finalOutputState: {
        outputSource: null,
        finalOutputJson: null,
        finalOutputRawText: null,
        finalOutputNormalized: null
      },
      finalErrorState: null
    });

    try {
      const result = await runRuntimeByEndpoint(endpointId, payload);
      const attemptTrace = result.attempts ?? [];
      const repairTrace = attemptTrace.filter(
        (attempt) => Boolean(attempt.deterministicRepairResult) || Boolean(attempt.repairPromptUsed)
      );
      const validationIssues = result.success
        ? attemptTrace[attemptTrace.length - 1]?.validationResult?.errors ?? []
        : result.lastValidationIssues ?? [];

      set({
        runtimeResult: result,
        runtimeAttemptTraceState: attemptTrace,
        repairTraceState: repairTrace,
        runtimeValidatedResultState: result,
        validationState: {
          outputSource: result.success ? result.outputSource : null,
          lastValidationIssues: validationIssues
        },
        finalOutputState: result.success
          ? {
              outputSource: result.outputSource,
              finalOutputJson: result.finalOutputJson,
              finalOutputRawText: result.finalOutputRawText,
              finalOutputNormalized: result.finalOutputNormalized
            }
          : {
              outputSource: null,
              finalOutputJson: null,
              finalOutputRawText: null,
              finalOutputNormalized: null
            },
        finalErrorState: result.success ? null : result.error,
        running: false,
        error: result.success ? null : result.error.message
      });
    } catch (error) {
      set({
        running: false,
        runtimeResult: null,
        runtimeAttemptTraceState: [],
        repairTraceState: [],
        runtimeValidatedResultState: null,
        validationState: {
          outputSource: null,
          lastValidationIssues: []
        },
        finalOutputState: {
          outputSource: null,
          finalOutputJson: null,
          finalOutputRawText: null,
          finalOutputNormalized: null
        },
        finalErrorState: null,
        error: toErrorMessage(error)
      });
    }
  },
  clearError: () => set({ error: null })
}));
