import type { SQLiteDatabase } from '../../db/types.js';
import type {
  CallLogDebugSnapshotRecord,
  CallLogInsertInput,
  CallLogListFilters,
  CallLogRecord
} from './model.js';

interface CallLogRow {
  id: string;
  run_id: string;
  request_id: string;
  project_key: string | null;
  project_name: string | null;
  endpoint_key: string | null;
  endpoint_name: string | null;
  provider_key: string | null;
  provider_label: string | null;
  model: string | null;
  success: number;
  output_source: CallLogRecord['outputSource'];
  structured_output_triggered: number;
  repair_triggered: number;
  api_call_count: number;
  attempt_count: number;
  repair_count: number;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cached_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cache_miss_tokens: number | null;
  cache_hit_observed: number | null;
  cache_metrics_supported: number | null;
  cache_metrics_source: CallLogRecord['cacheMetricsSource'];
  raw_usage_json: string | null;
  error_type: CallLogRecord['errorType'];
  failure_stage: CallLogRecord['failureStage'];
  prompt_hash: string | null;
  input_preview: string | null;
  output_preview: string | null;
  has_debug_snapshot: number;
  created_at: string;
}

interface CallLogDebugSnapshotRow {
  id: string;
  call_log_id: string;
  payload_json: string | null;
  created_at: string;
}

interface RunResult {
  changes: number;
}

function parseJsonValue(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function mapCallLogRow(row: CallLogRow): CallLogRecord {
  return {
    id: row.id,
    runId: row.run_id,
    requestId: row.request_id,
    projectKey: row.project_key,
    projectName: row.project_name,
    endpointKey: row.endpoint_key,
    endpointName: row.endpoint_name,
    providerKey: row.provider_key,
    providerLabel: row.provider_label,
    model: row.model,
    success: row.success === 1,
    outputSource: row.output_source,
    structuredOutputTriggered: row.structured_output_triggered === 1,
    repairTriggered: row.repair_triggered === 1,
    apiCallCount: row.api_call_count,
    attemptCount: row.attempt_count,
    repairCount: row.repair_count,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    cachedTokens: row.cached_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    cacheMissTokens: row.cache_miss_tokens,
    cacheHitObserved: row.cache_hit_observed === null ? null : row.cache_hit_observed === 1,
    cacheMetricsSupported:
      row.cache_metrics_supported === null ? null : row.cache_metrics_supported === 1,
    cacheMetricsSource: row.cache_metrics_source,
    rawUsage: parseJsonValue(row.raw_usage_json),
    errorType: row.error_type,
    failureStage: row.failure_stage,
    promptHash: row.prompt_hash,
    inputPreview: row.input_preview,
    outputPreview: row.output_preview,
    debugSnapshotAvailable: row.has_debug_snapshot === 1,
    createdAt: row.created_at
  };
}

function mapDebugSnapshotRow(row: CallLogDebugSnapshotRow): CallLogDebugSnapshotRecord {
  return {
    id: row.id,
    callLogId: row.call_log_id,
    payload: parseJsonValue(row.payload_json),
    createdAt: row.created_at
  };
}

function pushLikeFilter(
  conditions: string[],
  params: unknown[],
  value: string | undefined,
  nameColumn: string,
  keyColumn: string
): void {
  const term = value?.trim();
  if (!term) {
    return;
  }

  conditions.push(`(LOWER(COALESCE(${nameColumn}, '')) LIKE ? OR LOWER(COALESCE(${keyColumn}, '')) LIKE ?)`);
  params.push(`%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`);
}

function buildWhereClause(filters: CallLogListFilters): { whereSql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  pushLikeFilter(conditions, params, filters.project, 'project_name', 'project_key');
  pushLikeFilter(conditions, params, filters.endpoint, 'endpoint_name', 'endpoint_key');
  pushLikeFilter(conditions, params, filters.provider, 'provider_label', 'provider_key');

  if (typeof filters.success === 'boolean') {
    conditions.push('success = ?');
    params.push(filters.success ? 1 : 0);
  }

  if (filters.dateFrom) {
    conditions.push('created_at >= ?');
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push('created_at <= ?');
    params.push(filters.dateTo);
  }

  if (conditions.length === 0) {
    return { whereSql: '', params };
  }

  return {
    whereSql: ` WHERE ${conditions.join(' AND ')}`,
    params
  };
}

export class CallLogRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  insert(input: CallLogInsertInput): void {
    const insertCall = this.db.prepare(
      `
        INSERT INTO call_logs (
          id,
          run_id,
          request_id,
          project_key,
          project_name,
          endpoint_key,
          endpoint_name,
          provider_key,
          provider_label,
          model,
          success,
          output_source,
          structured_output_triggered,
          repair_triggered,
          api_call_count,
          attempt_count,
          repair_count,
          latency_ms,
          input_tokens,
          output_tokens,
          total_tokens,
          cached_tokens,
          cache_read_tokens,
          cache_write_tokens,
          cache_miss_tokens,
          cache_hit_observed,
          cache_metrics_supported,
          cache_metrics_source,
          raw_usage_json,
          error_type,
          failure_stage,
          prompt_hash,
          input_preview,
          output_preview,
          has_debug_snapshot,
          created_at
        ) VALUES (
          @id,
          @runId,
          @requestId,
          @projectKey,
          @projectName,
          @endpointKey,
          @endpointName,
          @providerKey,
          @providerLabel,
          @model,
          @success,
          @outputSource,
          @structuredOutputTriggered,
          @repairTriggered,
          @apiCallCount,
          @attemptCount,
          @repairCount,
          @latencyMs,
          @inputTokens,
          @outputTokens,
          @totalTokens,
          @cachedTokens,
          @cacheReadTokens,
          @cacheWriteTokens,
          @cacheMissTokens,
          @cacheHitObserved,
          @cacheMetricsSupported,
          @cacheMetricsSource,
          @rawUsageJson,
          @errorType,
          @failureStage,
          @promptHash,
          @inputPreview,
          @outputPreview,
          @hasDebugSnapshot,
          @createdAt
        )
      `
    );

    const insertDebugSnapshot = this.db.prepare(
      `
        INSERT INTO call_log_debug_snapshots (
          id,
          call_log_id,
          payload_json,
          created_at
        ) VALUES (
          @id,
          @callLogId,
          @payloadJson,
          @createdAt
        )
      `
    );

    const transaction = this.db.transaction((payload: CallLogInsertInput) => {
      insertCall.run({
        id: payload.call.id,
        runId: payload.call.runId,
        requestId: payload.call.requestId,
        projectKey: payload.call.projectKey,
        projectName: payload.call.projectName,
        endpointKey: payload.call.endpointKey,
        endpointName: payload.call.endpointName,
        providerKey: payload.call.providerKey,
        providerLabel: payload.call.providerLabel,
        model: payload.call.model,
        success: payload.call.success ? 1 : 0,
        outputSource: payload.call.outputSource,
        structuredOutputTriggered: payload.call.structuredOutputTriggered ? 1 : 0,
        repairTriggered: payload.call.repairTriggered ? 1 : 0,
        apiCallCount: payload.call.apiCallCount,
        attemptCount: payload.call.attemptCount,
        repairCount: payload.call.repairCount,
        latencyMs: payload.call.latencyMs,
        inputTokens: payload.call.inputTokens,
        outputTokens: payload.call.outputTokens,
        totalTokens: payload.call.totalTokens,
        cachedTokens: payload.call.cachedTokens,
        cacheReadTokens: payload.call.cacheReadTokens,
        cacheWriteTokens: payload.call.cacheWriteTokens,
        cacheMissTokens: payload.call.cacheMissTokens,
        cacheHitObserved:
          typeof payload.call.cacheHitObserved === 'boolean'
            ? payload.call.cacheHitObserved
              ? 1
              : 0
            : null,
        cacheMetricsSupported:
          typeof payload.call.cacheMetricsSupported === 'boolean'
            ? payload.call.cacheMetricsSupported
              ? 1
              : 0
            : null,
        cacheMetricsSource: payload.call.cacheMetricsSource,
        rawUsageJson:
          payload.call.rawUsage === null || payload.call.rawUsage === undefined
            ? null
            : JSON.stringify(payload.call.rawUsage),
        errorType: payload.call.errorType,
        failureStage: payload.call.failureStage,
        promptHash: payload.call.promptHash,
        inputPreview: payload.call.inputPreview,
        outputPreview: payload.call.outputPreview,
        hasDebugSnapshot: payload.call.debugSnapshotAvailable ? 1 : 0,
        createdAt: payload.call.createdAt
      });

      if (payload.debugSnapshot) {
        insertDebugSnapshot.run({
          id: payload.debugSnapshot.id,
          callLogId: payload.debugSnapshot.callLogId,
          payloadJson: JSON.stringify(payload.debugSnapshot.payload),
          createdAt: payload.debugSnapshot.createdAt
        });
      }
    });

    transaction(input);
  }

  list(filters: CallLogListFilters): { items: CallLogRecord[]; total: number } {
    const { whereSql, params } = buildWhereClause(filters);
    const offset = (filters.page - 1) * filters.pageSize;

    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            run_id,
            request_id,
            project_key,
            project_name,
            endpoint_key,
            endpoint_name,
            provider_key,
            provider_label,
            model,
            success,
            output_source,
            structured_output_triggered,
            repair_triggered,
            api_call_count,
            attempt_count,
            repair_count,
            latency_ms,
            input_tokens,
            output_tokens,
            total_tokens,
            cached_tokens,
            cache_read_tokens,
            cache_write_tokens,
            cache_miss_tokens,
            cache_hit_observed,
            cache_metrics_supported,
            cache_metrics_source,
            raw_usage_json,
            error_type,
            failure_stage,
            prompt_hash,
            input_preview,
            output_preview,
            has_debug_snapshot,
            created_at
          FROM call_logs
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT ?
          OFFSET ?
        `
      )
      .all(...params, filters.pageSize, offset) as CallLogRow[];

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM call_logs ${whereSql}`)
      .get(...params) as { total: number };

    return {
      items: rows.map(mapCallLogRow),
      total: totalRow.total
    };
  }

  findById(id: string): CallLogRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            run_id,
            request_id,
            project_key,
            project_name,
            endpoint_key,
            endpoint_name,
            provider_key,
            provider_label,
            model,
            success,
            output_source,
            structured_output_triggered,
            repair_triggered,
            api_call_count,
            attempt_count,
            repair_count,
            latency_ms,
            input_tokens,
            output_tokens,
            total_tokens,
            cached_tokens,
            cache_read_tokens,
            cache_write_tokens,
            cache_miss_tokens,
            cache_hit_observed,
            cache_metrics_supported,
            cache_metrics_source,
            raw_usage_json,
            error_type,
            failure_stage,
            prompt_hash,
            input_preview,
            output_preview,
            has_debug_snapshot,
            created_at
          FROM call_logs
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as CallLogRow | undefined;

    return row ? mapCallLogRow(row) : null;
  }

  findDebugSnapshotByCallLogId(callLogId: string): CallLogDebugSnapshotRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            call_log_id,
            payload_json,
            created_at
          FROM call_log_debug_snapshots
          WHERE call_log_id = ?
          LIMIT 1
        `
      )
      .get(callLogId) as CallLogDebugSnapshotRow | undefined;

    return row ? mapDebugSnapshotRow(row) : null;
  }

  countOlderThan(cutoffAt: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total FROM call_logs WHERE created_at < ?')
      .get(cutoffAt) as { total: number };

    return row.total;
  }

  countAll(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS total FROM call_logs').get() as { total: number };
    return row.total;
  }

  deleteOlderThan(cutoffAt: string): number {
    const result = this.db.prepare('DELETE FROM call_logs WHERE created_at < ?').run(cutoffAt) as RunResult;
    return result.changes;
  }

  deleteAll(): number {
    const result = this.db.prepare('DELETE FROM call_logs').run() as RunResult;
    return result.changes;
  }
}
