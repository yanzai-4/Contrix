import type {
  EndpointRuntimeState,
  PromptStateResponse,
  PromptCompileRunRecord,
  PromptCompileStatus,
  PromptStatus,
  RuntimeReadinessStatus,
  RuntimeSpecStatus
} from '@contrix/runtime-core';
import type { SQLiteDatabase } from '../../db/types.js';

interface EndpointRuntimeStateRow {
  endpoint_id: string;
  current_spec_id: string | null;
  current_spec_version: number | null;
  spec_status: string;
  current_prompt_snapshot_id: string | null;
  current_prompt_hash: string | null;
  prompt_status: string;
  last_prompt_compiled_at: string | null;
  last_prompt_compile_error: string | null;
  runtime_readiness: string;
  last_runtime_checked_at: string | null;
  updated_at: string;
}

interface PromptCompileRunRow {
  id: string;
  endpoint_id: string;
  spec_id: string | null;
  spec_version: number | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  prompt_snapshot_id: string | null;
  prompt_hash: string | null;
  trigger_reason: string;
  created_at: string;
}

interface PromptCompileRunCreateInput {
  id: string;
  endpointId: string;
  specId: string | null;
  specVersion: number | null;
  status: PromptCompileStatus;
  startedAt: string;
  triggerReason: string;
  createdAt: string;
}

interface PromptCompileRunFinishInput {
  status: PromptCompileStatus;
  finishedAt: string;
  errorMessage: string | null;
  promptSnapshotId: string | null;
  promptHash: string | null;
}

interface SpecPointerUpdateInput {
  currentSpecId: string | null;
  currentSpecVersion: number | null;
  specStatus: RuntimeSpecStatus;
  invalidatePrompt: boolean;
  updatedAt: string;
}

interface PromptStateUpdateInput {
  currentPromptSnapshotId: string | null;
  currentPromptHash: string | null;
  promptStatus: PromptStatus;
  lastPromptCompiledAt: string | null;
  lastPromptCompileError: string | null;
  updatedAt: string;
}

function normalizeSpecStatus(value: string): RuntimeSpecStatus {
  if (value === 'current' || value === 'stale' || value === 'missing') {
    return value;
  }

  return 'missing';
}

function normalizePromptStatus(value: string): PromptStatus {
  if (value === 'current' || value === 'stale' || value === 'missing' || value === 'compile_error') {
    return value;
  }

  return 'missing';
}

function normalizeRuntimeReadiness(value: string): RuntimeReadinessStatus {
  if (value === 'ready' || value === 'not_ready' || value === 'degraded') {
    return value;
  }

  return 'not_ready';
}

function mapRuntimeStateRow(row: EndpointRuntimeStateRow): EndpointRuntimeState {
  return {
    endpointId: row.endpoint_id,
    currentSpecId: row.current_spec_id,
    currentSpecVersion: row.current_spec_version,
    specStatus: normalizeSpecStatus(row.spec_status),
    currentPromptSnapshotId: row.current_prompt_snapshot_id,
    currentPromptHash: row.current_prompt_hash,
    promptStatus: normalizePromptStatus(row.prompt_status),
    lastPromptCompiledAt: row.last_prompt_compiled_at,
    lastPromptCompileError: row.last_prompt_compile_error,
    runtimeReadiness: normalizeRuntimeReadiness(row.runtime_readiness),
    lastRuntimeCheckedAt: row.last_runtime_checked_at,
    updatedAt: row.updated_at
  };
}

function toPromptStateResponse(state: EndpointRuntimeState): PromptStateResponse {
  return {
    endpointId: state.endpointId,
    currentSpecId: state.currentSpecId,
    currentSpecVersion: state.currentSpecVersion,
    specStatus: state.specStatus,
    currentPromptSnapshotId: state.currentPromptSnapshotId,
    currentPromptHash: state.currentPromptHash,
    promptStatus: state.promptStatus,
    lastPromptCompiledAt: state.lastPromptCompiledAt,
    lastPromptCompileError: state.lastPromptCompileError,
    runtimeReadiness: state.runtimeReadiness,
    lastRuntimeCheckedAt: state.lastRuntimeCheckedAt
  };
}

function normalizeCompileStatus(value: string): PromptCompileStatus {
  if (value === 'running' || value === 'success' || value === 'error') {
    return value;
  }

  return 'error';
}

function mapCompileRunRow(row: PromptCompileRunRow): PromptCompileRunRecord {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    specId: row.spec_id,
    specVersion: row.spec_version,
    status: normalizeCompileStatus(row.status),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    promptSnapshotId: row.prompt_snapshot_id,
    promptHash: row.prompt_hash,
    triggerReason: row.trigger_reason,
    createdAt: row.created_at
  };
}

export class RuntimeStateRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  ensureEndpointState(endpointId: string, specStatus: RuntimeSpecStatus = 'missing'): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
          INSERT INTO endpoint_runtime_state (
            endpoint_id,
            current_spec_id,
            current_spec_version,
            spec_status,
            current_prompt_snapshot_id,
            current_prompt_hash,
            prompt_status,
            last_prompt_compiled_at,
            last_prompt_compile_error,
            runtime_readiness,
            last_runtime_checked_at,
            updated_at
          ) VALUES (
            @endpointId,
            NULL,
            NULL,
            @specStatus,
            NULL,
            NULL,
            'missing',
            NULL,
            NULL,
            'not_ready',
            NULL,
            @updatedAt
          )
          ON CONFLICT(endpoint_id) DO NOTHING
        `
      )
      .run({
        endpointId,
        specStatus,
        updatedAt: now
      });
  }

  getEndpointState(endpointId: string): EndpointRuntimeState | null {
    const row = this.db
      .prepare(
        `
          SELECT
            endpoint_id,
            current_spec_id,
            current_spec_version,
            spec_status,
            current_prompt_snapshot_id,
            current_prompt_hash,
            prompt_status,
            last_prompt_compiled_at,
            last_prompt_compile_error,
            runtime_readiness,
            last_runtime_checked_at,
            updated_at
          FROM endpoint_runtime_state
          WHERE endpoint_id = ?
          LIMIT 1
        `
      )
      .get(endpointId) as EndpointRuntimeStateRow | undefined;

    return row ? mapRuntimeStateRow(row) : null;
  }

  getPromptState(endpointId: string): PromptStateResponse | null {
    const state = this.getEndpointState(endpointId);
    return state ? toPromptStateResponse(state) : null;
  }

  setSpecPointer(endpointId: string, input: SpecPointerUpdateInput): EndpointRuntimeState {
    this.ensureEndpointState(endpointId, input.specStatus);

    this.db
      .prepare(
        `
          UPDATE endpoint_runtime_state
          SET
            current_spec_id = @currentSpecId,
            current_spec_version = @currentSpecVersion,
            spec_status = @specStatus,
            current_prompt_snapshot_id = CASE
              WHEN @invalidatePrompt = 1 THEN NULL
              ELSE current_prompt_snapshot_id
            END,
            current_prompt_hash = CASE
              WHEN @invalidatePrompt = 1 THEN NULL
              ELSE current_prompt_hash
            END,
            prompt_status = CASE
              WHEN @invalidatePrompt = 1 THEN
                CASE
                  WHEN prompt_status = 'missing' THEN 'missing'
                  ELSE 'stale'
                END
              ELSE prompt_status
            END,
            runtime_readiness = CASE
              WHEN @invalidatePrompt = 1 THEN 'not_ready'
              ELSE runtime_readiness
            END,
            updated_at = @updatedAt
          WHERE endpoint_id = @endpointId
        `
      )
      .run({
        endpointId,
        currentSpecId: input.currentSpecId,
        currentSpecVersion: input.currentSpecVersion,
        specStatus: input.specStatus,
        invalidatePrompt: input.invalidatePrompt ? 1 : 0,
        updatedAt: input.updatedAt
      });

    const state = this.getEndpointState(endpointId);
    if (!state) {
      throw new Error('Runtime state update succeeded but state could not be reloaded.');
    }

    return state;
  }

  markSpecStale(endpointId: string, updatedAt: string): EndpointRuntimeState {
    this.ensureEndpointState(endpointId, 'stale');

    this.db
      .prepare(
        `
          UPDATE endpoint_runtime_state
          SET
            spec_status = 'stale',
            prompt_status = CASE
              WHEN prompt_status = 'missing' THEN 'missing'
              ELSE 'stale'
            END,
            runtime_readiness = 'not_ready',
            updated_at = @updatedAt
          WHERE endpoint_id = @endpointId
        `
      )
      .run({
        endpointId,
        updatedAt
      });

    const state = this.getEndpointState(endpointId);
    if (!state) {
      throw new Error('Runtime state stale mark succeeded but state could not be reloaded.');
    }

    return state;
  }

  setPromptState(endpointId: string, input: PromptStateUpdateInput): EndpointRuntimeState {
    this.ensureEndpointState(endpointId);

    this.db
      .prepare(
        `
          UPDATE endpoint_runtime_state
          SET
            current_prompt_snapshot_id = @currentPromptSnapshotId,
            current_prompt_hash = @currentPromptHash,
            prompt_status = @promptStatus,
            last_prompt_compiled_at = @lastPromptCompiledAt,
            last_prompt_compile_error = @lastPromptCompileError,
            updated_at = @updatedAt
          WHERE endpoint_id = @endpointId
        `
      )
      .run({
        endpointId,
        currentPromptSnapshotId: input.currentPromptSnapshotId,
        currentPromptHash: input.currentPromptHash,
        promptStatus: input.promptStatus,
        lastPromptCompiledAt: input.lastPromptCompiledAt,
        lastPromptCompileError: input.lastPromptCompileError,
        updatedAt: input.updatedAt
      });

    const state = this.getEndpointState(endpointId);
    if (!state) {
      throw new Error('Runtime state update succeeded but state could not be reloaded.');
    }

    return state;
  }

  setRuntimeReadiness(
    endpointId: string,
    readiness: RuntimeReadinessStatus,
    checkedAt: string
  ): EndpointRuntimeState {
    this.ensureEndpointState(endpointId);

    this.db
      .prepare(
        `
          UPDATE endpoint_runtime_state
          SET
            runtime_readiness = @runtimeReadiness,
            last_runtime_checked_at = @lastRuntimeCheckedAt,
            updated_at = @updatedAt
          WHERE endpoint_id = @endpointId
        `
      )
      .run({
        endpointId,
        runtimeReadiness: readiness,
        lastRuntimeCheckedAt: checkedAt,
        updatedAt: checkedAt
      });

    const state = this.getEndpointState(endpointId);
    if (!state) {
      throw new Error('Runtime readiness update succeeded but state could not be reloaded.');
    }

    return state;
  }

  createCompileRun(input: PromptCompileRunCreateInput): PromptCompileRunRecord {
    this.db
      .prepare(
        `
          INSERT INTO prompt_compile_runs (
            id,
            endpoint_id,
            spec_id,
            spec_version,
            status,
            started_at,
            finished_at,
            error_message,
            prompt_snapshot_id,
            prompt_hash,
            trigger_reason,
            created_at
          ) VALUES (
            @id,
            @endpointId,
            @specId,
            @specVersion,
            @status,
            @startedAt,
            NULL,
            NULL,
            NULL,
            NULL,
            @triggerReason,
            @createdAt
          )
        `
      )
      .run({
        id: input.id,
        endpointId: input.endpointId,
        specId: input.specId,
        specVersion: input.specVersion,
        status: input.status,
        startedAt: input.startedAt,
        triggerReason: input.triggerReason,
        createdAt: input.createdAt
      });

    const created = this.getCompileRunById(input.id);

    if (!created) {
      throw new Error('Prompt compile run insert succeeded but row could not be reloaded.');
    }

    return created;
  }

  finishCompileRun(runId: string, input: PromptCompileRunFinishInput): PromptCompileRunRecord | null {
    const result = this.db
      .prepare(
        `
          UPDATE prompt_compile_runs
          SET
            status = @status,
            finished_at = @finishedAt,
            error_message = @errorMessage,
            prompt_snapshot_id = @promptSnapshotId,
            prompt_hash = @promptHash
          WHERE id = @id
        `
      )
      .run({
        id: runId,
        status: input.status,
        finishedAt: input.finishedAt,
        errorMessage: input.errorMessage,
        promptSnapshotId: input.promptSnapshotId,
        promptHash: input.promptHash
      });

    if (result.changes === 0) {
      return null;
    }

    return this.getCompileRunById(runId);
  }

  getLatestCompileRun(endpointId: string): PromptCompileRunRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            endpoint_id,
            spec_id,
            spec_version,
            status,
            started_at,
            finished_at,
            error_message,
            prompt_snapshot_id,
            prompt_hash,
            trigger_reason,
            created_at
          FROM prompt_compile_runs
          WHERE endpoint_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(endpointId) as PromptCompileRunRow | undefined;

    return row ? mapCompileRunRow(row) : null;
  }

  private getCompileRunById(runId: string): PromptCompileRunRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            endpoint_id,
            spec_id,
            spec_version,
            status,
            started_at,
            finished_at,
            error_message,
            prompt_snapshot_id,
            prompt_hash,
            trigger_reason,
            created_at
          FROM prompt_compile_runs
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(runId) as PromptCompileRunRow | undefined;

    return row ? mapCompileRunRow(row) : null;
  }
}
