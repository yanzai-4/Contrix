import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { ErrorObject } from 'ajv';
import {
  compilePromptFromSpec,
  renderPromptTemplate,
  type PromptCompilerSpecInput
} from '@contrix/prompt-compiler';
import type {
  EndpointEffectiveSpec,
  EndpointSpec,
  PromptPreviewResponse,
  PromptRenderRequest,
  PromptRenderResponse
} from '@contrix/spec-core';
import type { PromptCompileResponse, PromptStateResponse } from '@contrix/runtime-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import { EndpointRepository } from '../endpoint/repository.js';
import { RuntimeStateRepository } from '../runtime/state-repository.js';
import { SpecService } from '../spec/service.js';
import { PromptRepository } from './repository.js';

type AjvValidateFn = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };
type AjvLike = {
  compile: (schema: unknown) => AjvValidateFn;
};
type AjvConstructor = new (options?: Record<string, unknown>) => AjvLike;

const require = createRequire(import.meta.url);
const Ajv = require('ajv').default as AjvConstructor;

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return 'Validation failed.';
  }

  return errors
    .map((error) => {
      const path = error.instancePath || '/';
      const message = error.message ?? 'invalid value';
      return `${path} ${message}`;
    })
    .join('; ');
}

function toCompileErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Prompt compilation failed.';
}

export class PromptService {
  private readonly specService: SpecService;
  private readonly endpointRepository: EndpointRepository;
  private readonly promptRepository: PromptRepository;
  private readonly runtimeStateRepository: RuntimeStateRepository;
  private readonly ajv: AjvLike;

  constructor(db: SQLiteDatabase) {
    this.specService = new SpecService(db);
    this.endpointRepository = new EndpointRepository(db);
    this.promptRepository = new PromptRepository(db);
    this.runtimeStateRepository = new RuntimeStateRepository(db);
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true
    });
  }

  getPromptState(endpointId: string): PromptStateResponse {
    const endpoint = this.requireEndpoint(endpointId);
    this.runtimeStateRepository.ensureEndpointState(endpointId, endpoint.specStatus);
    const state = this.runtimeStateRepository.getPromptState(endpointId);

    if (!state) {
      throw new ModuleError('PROMPT_STATE_ERROR', 500, 'Prompt state is unavailable.');
    }

    return state;
  }

  compilePrompt(endpointId: string, triggerReason = 'manual_compile'): PromptCompileResponse {
    const endpoint = this.requireEndpoint(endpointId);
    this.runtimeStateRepository.ensureEndpointState(endpointId, endpoint.specStatus);

    const currentSpec = this.specService.getCurrentSpec(endpointId);
    const spec = currentSpec.currentSpec;
    const startedAt = new Date().toISOString();

    const compileRun = this.runtimeStateRepository.createCompileRun({
      id: randomUUID(),
      endpointId,
      specId: spec.id,
      specVersion: spec.version,
      status: 'running',
      startedAt,
      triggerReason,
      createdAt: startedAt
    });

    try {
      const compilerInput = this.toCompilerSpec(spec, currentSpec.currentEffectiveSpec);
      const compiled = compilePromptFromSpec(compilerInput);
      const finishedAt = new Date().toISOString();

      const snapshot = this.promptRepository.upsertSnapshot({
        id: randomUUID(),
        specId: spec.id,
        specVersion: spec.version,
        promptHash: compiled.hash,
        promptText: compiled.template,
        sections: compiled.sections,
        createdAt: finishedAt
      });

      const stateBeforeActivation = this.runtimeStateRepository.getEndpointState(endpointId);
      const matchesCurrentSpec = Boolean(
        stateBeforeActivation &&
          stateBeforeActivation.currentSpecId === spec.id &&
          stateBeforeActivation.currentSpecVersion === spec.version &&
          stateBeforeActivation.specStatus === 'current'
      );

      const nextState = matchesCurrentSpec
        ? this.runtimeStateRepository.setPromptState(endpointId, {
            currentPromptSnapshotId: snapshot.id,
            currentPromptHash: snapshot.promptHash,
            promptStatus: 'current',
            lastPromptCompiledAt: finishedAt,
            lastPromptCompileError: null,
            updatedAt: finishedAt
          })
        : this.runtimeStateRepository.setPromptState(endpointId, {
            currentPromptSnapshotId: stateBeforeActivation?.currentPromptSnapshotId ?? null,
            currentPromptHash: stateBeforeActivation?.currentPromptHash ?? null,
            promptStatus:
              stateBeforeActivation?.promptStatus === 'compile_error'
                ? 'compile_error'
                : stateBeforeActivation?.promptStatus === 'missing'
                  ? 'missing'
                  : 'stale',
            lastPromptCompiledAt: finishedAt,
            lastPromptCompileError: null,
            updatedAt: finishedAt
          });

      this.runtimeStateRepository.finishCompileRun(compileRun.id, {
        status: 'success',
        finishedAt,
        errorMessage: null,
        promptSnapshotId: snapshot.id,
        promptHash: snapshot.promptHash
      });

      return {
        endpointId,
        compileStatus: 'success',
        compileRunId: compileRun.id,
        promptState: {
          endpointId: nextState.endpointId,
          currentSpecId: nextState.currentSpecId,
          currentSpecVersion: nextState.currentSpecVersion,
          specStatus: nextState.specStatus,
          currentPromptSnapshotId: nextState.currentPromptSnapshotId,
          currentPromptHash: nextState.currentPromptHash,
          promptStatus: nextState.promptStatus,
          lastPromptCompiledAt: nextState.lastPromptCompiledAt,
          lastPromptCompileError: nextState.lastPromptCompileError,
          runtimeReadiness: nextState.runtimeReadiness,
          lastRuntimeCheckedAt: nextState.lastRuntimeCheckedAt
        },
        snapshotId: matchesCurrentSpec ? snapshot.id : null,
        promptHash: matchesCurrentSpec ? snapshot.promptHash : null,
        specId: spec.id,
        specVersion: spec.version,
        error: matchesCurrentSpec
          ? null
          : 'Compiled prompt targets a non-current spec and was not activated.'
      };
    } catch (error) {
      const message = toCompileErrorMessage(error);
      const finishedAt = new Date().toISOString();
      const stateBeforeFailure = this.runtimeStateRepository.getEndpointState(endpointId);
      const nextState = this.runtimeStateRepository.setPromptState(endpointId, {
        currentPromptSnapshotId: stateBeforeFailure?.currentPromptSnapshotId ?? null,
        currentPromptHash: stateBeforeFailure?.currentPromptHash ?? null,
        promptStatus: 'compile_error',
        lastPromptCompiledAt: finishedAt,
        lastPromptCompileError: message,
        updatedAt: finishedAt
      });
      this.runtimeStateRepository.setRuntimeReadiness(endpointId, 'not_ready', finishedAt);

      this.runtimeStateRepository.finishCompileRun(compileRun.id, {
        status: 'error',
        finishedAt,
        errorMessage: message,
        promptSnapshotId: null,
        promptHash: null
      });

      throw new ModuleError(
        'PROMPT_COMPILE_ERROR',
        400,
        `Prompt compile failed: ${message}. Current prompt status is ${nextState.promptStatus}.`
      );
    }
  }

  getPromptPreview(endpointId: string): PromptPreviewResponse {
    const endpoint = this.requireEndpoint(endpointId);
    const staleBefore = endpoint.specStatus === 'stale';
    const currentSpec = this.specService.getCurrentSpec(endpointId);
    const spec = currentSpec.currentSpec;

    let snapshot = this.promptRepository.findBySpecVersion(spec.id, spec.version);
    let fromCache = true;

    if (!snapshot) {
      const compileResult = this.compilePrompt(endpointId, 'preview_compile');
      if (!compileResult.snapshotId) {
        throw new ModuleError(
          'PROMPT_COMPILE_ERROR',
          409,
          'Prompt compiled but cannot be activated because spec changed during compilation.'
        );
      }

      snapshot = this.promptRepository.findById(compileResult.snapshotId);
      fromCache = false;
    } else {
      const state = this.getPromptState(endpointId);
      if (
        state.specStatus === 'current' &&
        (state.promptStatus !== 'current' ||
          state.currentPromptSnapshotId !== snapshot.id ||
          state.currentPromptHash !== snapshot.promptHash)
      ) {
        this.runtimeStateRepository.setPromptState(endpointId, {
          currentPromptSnapshotId: snapshot.id,
          currentPromptHash: snapshot.promptHash,
          promptStatus: 'current',
          lastPromptCompiledAt: state.lastPromptCompiledAt ?? snapshot.createdAt,
          lastPromptCompileError: null,
          updatedAt: new Date().toISOString()
        });
      }
    }

    if (!snapshot) {
      throw new ModuleError('PROMPT_NOT_FOUND', 500, 'Prompt snapshot is unavailable.');
    }

    return {
      endpointId,
      specId: spec.id,
      specVersion: spec.version,
      promptHash: snapshot.promptHash,
      promptTemplate: snapshot.promptText,
      sections: snapshot.sections,
      fromCache,
      isStale: staleBefore,
      warning: staleBefore ? 'Spec was stale and has been regenerated before preview.' : null
    };
  }

  renderPrompt(endpointId: string, payload: PromptRenderRequest): PromptRenderResponse {
    const preview = this.getPromptPreview(endpointId);
    const specCurrent = this.specService.getCurrentSpec(endpointId);
    this.validateRenderInput(specCurrent.currentEffectiveSpec, payload);

    let finalPrompt: string;

    try {
      finalPrompt = renderPromptTemplate(preview.promptTemplate, {
        inputText: payload.inputText,
        inputJson: payload.inputJson
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prompt render failed.';
      throw new ModuleError('PROMPT_RENDER_FAILED', 400, message);
    }

    return {
      endpointId,
      specVersion: preview.specVersion,
      promptHash: preview.promptHash,
      finalPrompt
    };
  }

  private toCompilerSpec(spec: EndpointSpec, effectiveSpec: EndpointEffectiveSpec): PromptCompilerSpecInput {
    const outputSchemaJson = effectiveSpec.output.schema;
    const outputRootType = outputSchemaJson.type;
    const outputIsObject =
      outputRootType === 'object' || (Array.isArray(outputRootType) && outputRootType.includes('object'));

    if (!outputIsObject) {
      throw new ModuleError('PROMPT_SCHEMA_ERROR', 400, 'Effective spec output schema root must be an object.');
    }

    const inputSchema =
      effectiveSpec.input.mode === 'json' &&
      effectiveSpec.input.schema &&
      typeof effectiveSpec.input.schema === 'object' &&
      'type' in effectiveSpec.input.schema
        ? effectiveSpec.input.schema
        : null;

    if (effectiveSpec.input.mode === 'json' && !inputSchema) {
      throw new ModuleError(
        'PROMPT_SCHEMA_ERROR',
        400,
        'Effective spec input schema is required when input mode is json.'
      );
    }

    return {
      id: spec.id,
      version: spec.version,
      instructions: {
        base: effectiveSpec.instructions.base ?? null,
        group: effectiveSpec.instructions.group ?? null,
        endpoint: effectiveSpec.instructions.endpoint ?? null,
        merged: effectiveSpec.instructions.merged ?? null
      },
      tone: effectiveSpec.tone ?? null,
      inputMode: effectiveSpec.input.mode,
      inputSchema,
      outputSchema: outputSchemaJson,
      fieldRules: effectiveSpec.fieldRules,
      outputRules: effectiveSpec.outputRules,
      outputExample: effectiveSpec.outputExample,
      outputExampleKind: effectiveSpec.outputExampleKind
    };
  }

  private validateRenderInput(effectiveSpec: EndpointEffectiveSpec, payload: PromptRenderRequest): void {
    if (effectiveSpec.input.mode === 'text') {
      if (typeof payload.inputText !== 'string') {
        throw new ModuleError('PROMPT_INPUT_REQUIRED', 400, 'inputText is required for text input mode.');
      }

      return;
    }

    const schema =
      effectiveSpec.input.schema &&
      typeof effectiveSpec.input.schema === 'object' &&
      'type' in effectiveSpec.input.schema
        ? effectiveSpec.input.schema
        : null;
    if (!schema) {
      throw new ModuleError('PROMPT_SCHEMA_ERROR', 400, 'Effective spec input schema is missing for json input mode.');
    }

    if (payload.inputJson === undefined) {
      throw new ModuleError('PROMPT_INPUT_REQUIRED', 400, 'inputJson is required for json input mode.');
    }

    const validate = this.ajv.compile(schema);
    const success = validate(payload.inputJson);

    if (!success) {
      throw new ModuleError(
        'PROMPT_INPUT_VALIDATION_FAILED',
        400,
        `inputJson does not match input schema: ${formatAjvErrors(validate.errors)}`
      );
    }
  }

  private requireEndpoint(endpointId: string) {
    const endpoint = this.endpointRepository.findById(endpointId);

    if (!endpoint) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    return endpoint;
  }
}
