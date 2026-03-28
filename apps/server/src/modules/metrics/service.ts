import type {
  MetricsBreakdownResponse,
  MetricsEndpointBreakdownItem,
  MetricsModelBreakdownItem,
  MetricsOverviewResponse,
  MetricsProjectBreakdownItem,
  MetricsProviderBreakdownItem,
  MetricsTimeseriesBucket,
  MetricsTimeseriesPoint,
  MetricsTimeseriesResponse,
  MetricsTimeseriesSummary,
  RuntimeProviderType
} from '@contrix/runtime-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ProviderRegistry } from '../provider/registry.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface AggregateRow {
  total_calls: number | null;
  total_success_calls: number | null;
  total_failed_calls: number | null;
  avg_latency_ms: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_tokens: number | null;
  total_cached_input_tokens: number | null;
  total_repair_count: number | null;
}

interface CountRow {
  count: number;
}

interface TimeseriesRow {
  bucket_key: string;
  calls: number | null;
  success_calls: number | null;
  failed_calls: number | null;
  avg_latency_ms: number | null;
  total_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  retry_count: number | null;
}

interface TimeseriesSummaryRow {
  total_calls: number | null;
  total_success_calls: number | null;
  total_failed_calls: number | null;
  avg_latency_ms: number | null;
  total_tokens: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cached_tokens: number | null;
  total_retry_count: number | null;
}

interface ProviderBreakdownRow {
  provider_id: string | null;
  provider_name: string | null;
  provider_type: RuntimeProviderType | null;
  calls: number | null;
  success_calls: number | null;
  failed_calls: number | null;
  avg_latency_ms: number | null;
  total_tokens: number | null;
  retry_count: number | null;
}

interface ModelBreakdownRow {
  model: string | null;
  calls: number | null;
  success_calls: number | null;
  failed_calls: number | null;
  avg_latency_ms: number | null;
  total_tokens: number | null;
  retry_count: number | null;
}

interface ProjectBreakdownRow {
  project_id: string | null;
  project_name: string | null;
  calls: number | null;
  success_calls: number | null;
  failed_calls: number | null;
  avg_latency_ms: number | null;
  retry_count: number | null;
}

interface EndpointBreakdownRow {
  endpoint_id: string | null;
  project_id: string | null;
  endpoint_name: string | null;
  project_name: string | null;
  calls: number | null;
  success_calls: number | null;
  failed_calls: number | null;
  avg_latency_ms: number | null;
  retry_count: number | null;
}

interface TimeseriesRangeConfig {
  range: string;
  bucket: MetricsTimeseriesBucket;
  bucketCount: number;
  stepMs: number;
}

interface BucketWindowPoint {
  key: string;
  bucketStart: string;
  bucketLabel: string;
  date: string;
}

interface TimeseriesWindow {
  startAt: Date;
  endAt: Date;
  buckets: BucketWindowPoint[];
}

function numberOrZero(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

function round(value: number, decimals = 2): number {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}

function rate(successCalls: number, totalCalls: number): number {
  if (totalCalls <= 0) {
    return 0;
  }

  return round((successCalls / totalCalls) * 100);
}

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatHourKey(date: Date): string {
  return date.toISOString().slice(0, 13);
}

function resolveTimeseriesRangeConfig(range: string | undefined): TimeseriesRangeConfig {
  const normalized = range?.trim().toLowerCase() ?? '7d';

  if (normalized === '24h') {
    return {
      range: '24h',
      bucket: 'hour',
      bucketCount: 24,
      stepMs: HOUR_MS
    };
  }

  const dayMatch = normalized.match(/^(\d{1,3})d$/);
  if (dayMatch) {
    const days = Number(dayMatch[1]);
    const safeDays = Number.isFinite(days) && days >= 1 ? Math.min(days, 365) : 7;

    return {
      range: `${safeDays}d`,
      bucket: 'day',
      bucketCount: safeDays,
      stepMs: DAY_MS
    };
  }

  return {
    range: '7d',
    bucket: 'day',
    bucketCount: 7,
    stepMs: DAY_MS
  };
}

function buildTimeseriesWindow(config: TimeseriesRangeConfig, now: Date): TimeseriesWindow {
  if (config.bucket === 'hour') {
    const endAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1)
    );
    const startAt = new Date(endAt.getTime() - config.bucketCount * config.stepMs);
    const buckets: BucketWindowPoint[] = [];

    for (let index = 0; index < config.bucketCount; index += 1) {
      const bucketDate = new Date(startAt.getTime() + index * config.stepMs);
      const bucketStart = bucketDate.toISOString();
      const key = formatHourKey(bucketDate);

      buckets.push({
        key,
        bucketStart,
        bucketLabel: `${bucketStart.slice(5, 10)} ${bucketStart.slice(11, 13)}:00`,
        date: `${bucketStart.slice(0, 13)}:00`
      });
    }

    return {
      startAt,
      endAt,
      buckets
    };
  }

  const endAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const startAt = new Date(endAt.getTime() - config.bucketCount * config.stepMs);
  const buckets: BucketWindowPoint[] = [];

  for (let index = 0; index < config.bucketCount; index += 1) {
    const bucketDate = new Date(startAt.getTime() + index * config.stepMs);
    const bucketStart = bucketDate.toISOString();
    const key = formatDayKey(bucketDate);

    buckets.push({
      key,
      bucketStart,
      bucketLabel: key.slice(5),
      date: key
    });
  }

  return {
    startAt,
    endAt,
    buckets
  };
}

function toTimeseriesSummary(row: TimeseriesSummaryRow): MetricsTimeseriesSummary {
  const calls = numberOrZero(row.total_calls);
  const successCalls = numberOrZero(row.total_success_calls);

  return {
    calls,
    successCalls,
    failedCalls: numberOrZero(row.total_failed_calls),
    successRate: rate(successCalls, calls),
    avgLatencyMs: round(numberOrZero(row.avg_latency_ms)),
    totalTokens: numberOrZero(row.total_tokens),
    inputTokens: numberOrZero(row.total_input_tokens),
    outputTokens: numberOrZero(row.total_output_tokens),
    cachedTokens: numberOrZero(row.total_cached_tokens),
    retryCount: numberOrZero(row.total_retry_count)
  };
}

function mapProviderBreakdown(row: ProviderBreakdownRow): MetricsProviderBreakdownItem {
  const calls = numberOrZero(row.calls);
  const successCalls = numberOrZero(row.success_calls);

  return {
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerType: row.provider_type,
    calls,
    successRate: rate(successCalls, calls),
    avgLatencyMs: round(numberOrZero(row.avg_latency_ms)),
    totalTokens: numberOrZero(row.total_tokens),
    failedCalls: numberOrZero(row.failed_calls),
    retryCount: numberOrZero(row.retry_count)
  };
}

function mapModelBreakdown(row: ModelBreakdownRow): MetricsModelBreakdownItem {
  const calls = numberOrZero(row.calls);
  const successCalls = numberOrZero(row.success_calls);

  return {
    model: row.model,
    calls,
    successRate: rate(successCalls, calls),
    avgLatencyMs: round(numberOrZero(row.avg_latency_ms)),
    totalTokens: numberOrZero(row.total_tokens),
    failedCalls: numberOrZero(row.failed_calls),
    retryCount: numberOrZero(row.retry_count)
  };
}

function mapProjectBreakdown(row: ProjectBreakdownRow): MetricsProjectBreakdownItem {
  const calls = numberOrZero(row.calls);
  const successCalls = numberOrZero(row.success_calls);

  return {
    projectId: row.project_id,
    projectName: row.project_name,
    calls,
    successRate: rate(successCalls, calls),
    avgLatencyMs: round(numberOrZero(row.avg_latency_ms)),
    failedCalls: numberOrZero(row.failed_calls),
    retryCount: numberOrZero(row.retry_count)
  };
}

function mapEndpointBreakdown(row: EndpointBreakdownRow): MetricsEndpointBreakdownItem {
  const calls = numberOrZero(row.calls);
  const successCalls = numberOrZero(row.success_calls);

  return {
    endpointId: row.endpoint_id,
    projectId: row.project_id,
    endpointName: row.endpoint_name,
    projectName: row.project_name,
    calls,
    successRate: rate(successCalls, calls),
    avgLatencyMs: round(numberOrZero(row.avg_latency_ms)),
    failedCalls: numberOrZero(row.failed_calls),
    retryCount: numberOrZero(row.retry_count)
  };
}

function buildRangeFilter(range: string | undefined): { whereSql: string; params: unknown[] } {
  if (!range) {
    return { whereSql: '', params: [] };
  }

  const config = resolveTimeseriesRangeConfig(range);
  const window = buildTimeseriesWindow(config, new Date());

  return {
    whereSql: 'WHERE created_at >= ? AND created_at < ?',
    params: [window.startAt.toISOString(), window.endAt.toISOString()]
  };
}

export class MetricsService {
  private readonly providerRegistry: ProviderRegistry;

  constructor(private readonly db: SQLiteDatabase) {
    this.providerRegistry = new ProviderRegistry(db);
  }

  getOverview(): MetricsOverviewResponse {
    const aggregate = this.db
      .prepare(
        `
          SELECT
            COUNT(*) AS total_calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS total_success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS total_failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(COALESCE(input_tokens, 0)) AS total_input_tokens,
            SUM(COALESCE(output_tokens, 0)) AS total_output_tokens,
            SUM(COALESCE(total_tokens, 0)) AS total_tokens,
            SUM(COALESCE(cached_tokens, 0)) AS total_cached_input_tokens,
            SUM(COALESCE(repair_count, 0)) AS total_repair_count
          FROM call_logs
        `
      )
      .get() as AggregateRow;

    const totalCalls = numberOrZero(aggregate.total_calls);
    const totalSuccessCalls = numberOrZero(aggregate.total_success_calls);
    const totalFailedCalls = numberOrZero(aggregate.total_failed_calls);
    const totalProjectsActive = (this.db.prepare('SELECT COUNT(*) AS count FROM projects').get() as CountRow)
      .count;
    const totalEndpointsActive = (this.db.prepare('SELECT COUNT(*) AS count FROM endpoints').get() as CountRow)
      .count;
    const totalProvidersActive = this.providerRegistry.listSummaries().length;

    return {
      totalCalls,
      totalSuccessCalls,
      totalFailedCalls,
      successRate: rate(totalSuccessCalls, totalCalls),
      avgLatencyMs: round(numberOrZero(aggregate.avg_latency_ms)),
      totalInputTokens: numberOrZero(aggregate.total_input_tokens),
      totalOutputTokens: numberOrZero(aggregate.total_output_tokens),
      totalTokens: numberOrZero(aggregate.total_tokens),
      totalCachedInputTokens: numberOrZero(aggregate.total_cached_input_tokens),
      totalRepairCount: numberOrZero(aggregate.total_repair_count),
      totalProjectsActive,
      totalEndpointsActive,
      totalProvidersActive
    };
  }

  getTimeseries(range: string | undefined): MetricsTimeseriesResponse {
    const config = resolveTimeseriesRangeConfig(range);
    const window = buildTimeseriesWindow(config, new Date());
    const startAt = window.startAt.toISOString();
    const endAt = window.endAt.toISOString();
    const bucketExpression = config.bucket === 'hour' ? 'substr(created_at, 1, 13)' : 'substr(created_at, 1, 10)';

    const rows = this.db
      .prepare(
        `
          SELECT
            ${bucketExpression} AS bucket_key,
            COUNT(*) AS calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(COALESCE(total_tokens, 0)) AS total_tokens,
            SUM(COALESCE(input_tokens, 0)) AS input_tokens,
            SUM(COALESCE(output_tokens, 0)) AS output_tokens,
            SUM(COALESCE(cached_tokens, 0)) AS cached_tokens,
            SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS retry_count
          FROM call_logs
          WHERE created_at >= ? AND created_at < ?
          GROUP BY ${bucketExpression}
          ORDER BY bucket_key ASC
        `
      )
      .all(startAt, endAt) as TimeseriesRow[];

    const byDate = new Map<string, TimeseriesRow>();
    for (const row of rows) {
      byDate.set(row.bucket_key, row);
    }

    const points: MetricsTimeseriesPoint[] = window.buckets.map((bucket) => {
      const row = byDate.get(bucket.key);
      const calls = numberOrZero(row?.calls);
      const successCalls = numberOrZero(row?.success_calls);
      const failedCalls = numberOrZero(row?.failed_calls);

      return {
        bucketStart: bucket.bucketStart,
        bucketLabel: bucket.bucketLabel,
        date: bucket.date,
        calls,
        successCalls,
        failedCalls,
        successRate: rate(successCalls, calls),
        avgLatencyMs: round(numberOrZero(row?.avg_latency_ms)),
        totalTokens: numberOrZero(row?.total_tokens),
        inputTokens: numberOrZero(row?.input_tokens),
        outputTokens: numberOrZero(row?.output_tokens),
        cachedTokens: numberOrZero(row?.cached_tokens),
        retryCount: numberOrZero(row?.retry_count)
      };
    });

    const summaryRow = this.db
      .prepare(
        `
          SELECT
            COUNT(*) AS total_calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS total_success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS total_failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(COALESCE(total_tokens, 0)) AS total_tokens,
            SUM(COALESCE(input_tokens, 0)) AS total_input_tokens,
            SUM(COALESCE(output_tokens, 0)) AS total_output_tokens,
            SUM(COALESCE(cached_tokens, 0)) AS total_cached_tokens,
            SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS total_retry_count
          FROM call_logs
          WHERE created_at >= ? AND created_at < ?
        `
      )
      .get(startAt, endAt) as TimeseriesSummaryRow;

    const previousEndAt = window.startAt;
    const previousStartAt = new Date(previousEndAt.getTime() - config.bucketCount * config.stepMs);

    const previousSummaryRow = this.db
      .prepare(
        `
          SELECT
            COUNT(*) AS total_calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS total_success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS total_failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(COALESCE(total_tokens, 0)) AS total_tokens,
            SUM(COALESCE(input_tokens, 0)) AS total_input_tokens,
            SUM(COALESCE(output_tokens, 0)) AS total_output_tokens,
            SUM(COALESCE(cached_tokens, 0)) AS total_cached_tokens,
            SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS total_retry_count
          FROM call_logs
          WHERE created_at >= ? AND created_at < ?
        `
      )
      .get(previousStartAt.toISOString(), previousEndAt.toISOString()) as TimeseriesSummaryRow;

    return {
      range: config.range,
      bucket: config.bucket,
      window: {
        startAt,
        endAt,
        bucketCount: config.bucketCount
      },
      summary: toTimeseriesSummary(summaryRow),
      previousSummary: toTimeseriesSummary(previousSummaryRow),
      points
    };
  }

  getBreakdown(range: string | undefined): MetricsBreakdownResponse {
    const { whereSql, params } = buildRangeFilter(range);

    const providerRows = this.db
      .prepare(
        `
          SELECT
            provider_key AS provider_id,
            provider_label AS provider_name,
            NULL AS provider_type,
            COUNT(*) AS calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(COALESCE(total_tokens, 0)) AS total_tokens,
            SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS retry_count
          FROM call_logs
          ${whereSql}
          GROUP BY provider_key, provider_label
          ORDER BY calls DESC, provider_label ASC
          LIMIT 20
        `
      )
      .all(...params) as ProviderBreakdownRow[];

    const modelRows = this.db
      .prepare(
        `
          SELECT
            model,
            COUNT(*) AS calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(COALESCE(total_tokens, 0)) AS total_tokens,
            SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS retry_count
          FROM call_logs
          ${whereSql}
          GROUP BY model
          ORDER BY calls DESC, model ASC
          LIMIT 20
        `
      )
      .all(...params) as ModelBreakdownRow[];

    const projectRows = this.db
      .prepare(
        `
          SELECT
            project_key AS project_id,
            project_name,
            COUNT(*) AS calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS retry_count
          FROM call_logs
          ${whereSql}
          GROUP BY project_key, project_name
          ORDER BY calls DESC, project_name ASC
          LIMIT 20
        `
      )
      .all(...params) as ProjectBreakdownRow[];

    const endpointRows = this.db
      .prepare(
        `
          SELECT
            endpoint_key AS endpoint_id,
            project_key AS project_id,
            endpoint_name,
            project_name,
            COUNT(*) AS calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
            AVG(COALESCE(latency_ms, 0)) AS avg_latency_ms,
            SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS retry_count
          FROM call_logs
          ${whereSql}
          GROUP BY endpoint_key, endpoint_name, project_key, project_name
          ORDER BY calls DESC, endpoint_name ASC
          LIMIT 20
        `
      )
      .all(...params) as EndpointBreakdownRow[];

    return {
      providers: providerRows.map(mapProviderBreakdown),
      models: modelRows.map(mapModelBreakdown),
      projects: projectRows.map(mapProjectBreakdown),
      endpoints: endpointRows.map(mapEndpointBreakdown)
    };
  }
}
