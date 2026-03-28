import { create } from 'zustand';
import type {
  CallLogRecord,
  MetricsBreakdownResponse,
  MetricsOverviewResponse,
  MetricsTimeseriesSummary
} from '@contrix/runtime-core';
import {
  fetchCallLogs,
  fetchHealth,
  fetchMetricsBreakdown,
  fetchMetricsOverview,
  fetchMetricsTimeseries
} from '../services/api';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type OverviewRange = '24h' | '7d' | '30d';

export interface OverviewInsight {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  message: string;
}

interface OverviewGlobalSummary {
  totalProjects: number;
  totalEndpoints: number;
  totalProviders: number;
  totalCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  avgLatencyMs: number;
  totalRepairs: number;
}

interface OverviewRangeSummary {
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  failureCount: number;
  retryCount: number;
}

interface OverviewStoreState {
  range: OverviewRange;
  globalSummary: OverviewGlobalSummary;
  rangeSummary: OverviewRangeSummary;
  previousRangeSummary: OverviewRangeSummary;
  metricsOverview: MetricsOverviewResponse | null;
  metricsBreakdown: MetricsBreakdownResponse | null;
  timeseries: {
    range: string;
    bucket: 'hour' | 'day';
    window: {
      startAt: string;
      endAt: string;
      bucketCount: number;
    };
    points: Array<{
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
    }>;
  } | null;
  recentLogs: CallLogRecord[];
  recentErrors: CallLogRecord[];
  mostActiveProjects: MetricsBreakdownResponse['projects'];
  mostActiveEndpoints: MetricsBreakdownResponse['endpoints'];
  failureHotspots: MetricsBreakdownResponse['endpoints'];
  retryHotspots: MetricsBreakdownResponse['endpoints'];
  highestTokenModels: MetricsBreakdownResponse['models'];
  topInsights: OverviewInsight[];
  anomalyHints: OverviewInsight[];
  serverConnected: boolean;
  databaseInitialized: boolean;
  lastCheckedAt: string | null;
  rangeStartAt: string | null;
  rangeEndAt: string | null;
  loading: boolean;
  error: string | null;
  setRange: (range: OverviewRange) => void;
  refresh: (nextRange?: OverviewRange) => Promise<void>;
}

const emptyGlobalSummary: OverviewGlobalSummary = {
  totalProjects: 0,
  totalEndpoints: 0,
  totalProviders: 0,
  totalCalls: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  avgLatencyMs: 0,
  totalRepairs: 0
};

const emptyRangeSummary: OverviewRangeSummary = {
  calls: 0,
  successRate: 0,
  avgLatencyMs: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  failureCount: 0,
  retryCount: 0
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load overview data.';
}

function toOverviewRangeSummary(summary: MetricsTimeseriesSummary): OverviewRangeSummary {
  return {
    calls: summary.calls,
    successRate: summary.successRate,
    avgLatencyMs: summary.avgLatencyMs,
    totalTokens: summary.totalTokens,
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    cachedTokens: summary.cachedTokens,
    failureCount: summary.failedCalls,
    retryCount: summary.retryCount
  };
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) {
      return 0;
    }

    return null;
  }

  return ((current - previous) / previous) * 100;
}

function formatDelta(value: number): string {
  return `${Math.abs(value).toFixed(1)}%`;
}

function buildTopInsights(
  current: OverviewRangeSummary,
  previous: OverviewRangeSummary,
  metricsBreakdown: MetricsBreakdownResponse
): OverviewInsight[] {
  const insights: OverviewInsight[] = [];

  if (current.calls === 0) {
    insights.push({
      id: 'no-calls',
      tone: 'neutral',
      message: 'No runtime calls detected in the selected range.'
    });
    return insights;
  }

  if (current.failureCount === 0) {
    insights.push({
      id: 'no-failures',
      tone: 'positive',
      message: 'No failures detected in the selected range.'
    });
  }

  const latencyDelta = percentDelta(current.avgLatencyMs, previous.avgLatencyMs);
  if (latencyDelta !== null && latencyDelta <= -5) {
    insights.push({
      id: 'latency-improved',
      tone: 'positive',
      message: `Average latency improved by ${formatDelta(latencyDelta)} vs previous window.`
    });
  } else if (latencyDelta !== null && latencyDelta >= 10) {
    insights.push({
      id: 'latency-up',
      tone: 'warning',
      message: `Average latency increased by ${formatDelta(latencyDelta)} vs previous window.`
    });
  }

  const retryDelta = percentDelta(current.retryCount, previous.retryCount);
  if (retryDelta !== null && retryDelta >= 20) {
    insights.push({
      id: 'retry-up',
      tone: 'warning',
      message: 'Retry activity increased in the selected range.'
    });
  }

  const topModel = [...metricsBreakdown.models].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  if (topModel && topModel.totalTokens > 0) {
    insights.push({
      id: 'top-token-model',
      tone: 'neutral',
      message: `${topModel.model ?? 'Unspecified model'} is the top token-consuming model.`
    });
  }

  return insights.slice(0, 3);
}

function buildAnomalyHints(current: OverviewRangeSummary, previous: OverviewRangeSummary): OverviewInsight[] {
  const anomalies: OverviewInsight[] = [];

  if (current.calls === 0) {
    return anomalies;
  }

  const failureDelta = percentDelta(current.failureCount, previous.failureCount);
  if (failureDelta !== null && failureDelta >= 40 && current.failureCount >= 3) {
    anomalies.push({
      id: 'failure-spike',
      tone: 'warning',
      message: `Failures spiked ${formatDelta(failureDelta)} compared with the previous window.`
    });
  }

  const latencyDelta = percentDelta(current.avgLatencyMs, previous.avgLatencyMs);
  if (latencyDelta !== null && latencyDelta >= 25 && current.calls >= 10) {
    anomalies.push({
      id: 'latency-spike',
      tone: 'warning',
      message: `Latency rose ${formatDelta(latencyDelta)} vs previous window.`
    });
  }

  const retryDelta = percentDelta(current.retryCount, previous.retryCount);
  if (retryDelta !== null && retryDelta >= 35 && current.retryCount >= 5) {
    anomalies.push({
      id: 'retry-spike',
      tone: 'warning',
      message: `Retries rose ${formatDelta(retryDelta)} compared with the previous window.`
    });
  }

  return anomalies.slice(0, 2);
}

function getRangeWindow(range: OverviewRange): { dateFrom: string; dateTo: string } {
  const dateTo = new Date();
  const rangeMs = range === '24h' ? HOUR_MS * 24 : Number(range.slice(0, -1)) * DAY_MS;
  const dateFrom = new Date(dateTo.getTime() - rangeMs);

  return {
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString()
  };
}

export const useOverviewStore = create<OverviewStoreState>((set, get) => ({
  range: '7d',
  globalSummary: { ...emptyGlobalSummary },
  rangeSummary: { ...emptyRangeSummary },
  previousRangeSummary: { ...emptyRangeSummary },
  metricsOverview: null,
  metricsBreakdown: null,
  timeseries: null,
  recentLogs: [],
  recentErrors: [],
  mostActiveProjects: [],
  mostActiveEndpoints: [],
  failureHotspots: [],
  retryHotspots: [],
  highestTokenModels: [],
  topInsights: [],
  anomalyHints: [],
  serverConnected: false,
  databaseInitialized: false,
  lastCheckedAt: null,
  rangeStartAt: null,
  rangeEndAt: null,
  loading: false,
  error: null,
  setRange: (range) => {
    set({ range });
  },
  refresh: async (nextRange) => {
    const selectedRange = nextRange ?? get().range;
    const rangeWindow = getRangeWindow(selectedRange);

    set({ loading: true, error: null, range: selectedRange });

    try {
      const [
        health,
        metricsOverview,
        metricsTimeseries,
        metricsBreakdown,
        recentLogsResponse,
        recentErrorsResponse
      ] = await Promise.all([
        fetchHealth(),
        fetchMetricsOverview(),
        fetchMetricsTimeseries(selectedRange),
        fetchMetricsBreakdown(selectedRange),
        fetchCallLogs({
          dateFrom: rangeWindow.dateFrom,
          dateTo: rangeWindow.dateTo,
          page: 1,
          pageSize: 60
        }),
        fetchCallLogs({
          success: false,
          dateFrom: rangeWindow.dateFrom,
          dateTo: rangeWindow.dateTo,
          page: 1,
          pageSize: 20
        })
      ]);

      const mostActiveProjects = [...metricsBreakdown.projects]
        .filter((item) => item.calls > 0)
        .sort((a, b) => b.calls - a.calls || a.projectName?.localeCompare(b.projectName ?? '') || 0)
        .slice(0, 8);

      const mostActiveEndpoints = [...metricsBreakdown.endpoints]
        .filter((item) => item.calls > 0)
        .sort((a, b) => b.calls - a.calls || a.endpointName?.localeCompare(b.endpointName ?? '') || 0)
        .slice(0, 8);

      const failureHotspots = [...metricsBreakdown.endpoints]
        .filter((item) => item.failedCalls > 0)
        .sort(
          (a, b) =>
            b.failedCalls - a.failedCalls ||
            a.successRate - b.successRate ||
            b.calls - a.calls ||
            a.endpointName?.localeCompare(b.endpointName ?? '') ||
            0
        )
        .slice(0, 8);

      const retryHotspots = [...metricsBreakdown.endpoints]
        .filter((item) => item.retryCount > 0)
        .sort(
          (a, b) =>
            b.retryCount - a.retryCount ||
            b.calls - a.calls ||
            a.endpointName?.localeCompare(b.endpointName ?? '') ||
            0
        )
        .slice(0, 8);

      const highestTokenModels = [...metricsBreakdown.models]
        .filter((item) => item.totalTokens > 0)
        .sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls)
        .slice(0, 8);

      const rangeSummary = toOverviewRangeSummary(metricsTimeseries.summary);
      const previousRangeSummary = toOverviewRangeSummary(metricsTimeseries.previousSummary);
      const topInsights = buildTopInsights(rangeSummary, previousRangeSummary, metricsBreakdown);
      const anomalyHints = buildAnomalyHints(rangeSummary, previousRangeSummary);

      set({
        globalSummary: {
          totalProjects: metricsOverview.totalProjectsActive,
          totalEndpoints: metricsOverview.totalEndpointsActive,
          totalProviders: metricsOverview.totalProvidersActive,
          totalCalls: metricsOverview.totalCalls,
          totalTokens: metricsOverview.totalTokens,
          inputTokens: metricsOverview.totalInputTokens,
          outputTokens: metricsOverview.totalOutputTokens,
          cachedTokens: metricsOverview.totalCachedInputTokens,
          avgLatencyMs: metricsOverview.avgLatencyMs,
          totalRepairs: metricsOverview.totalRepairCount
        },
        rangeSummary,
        previousRangeSummary,
        metricsOverview,
        metricsBreakdown,
        timeseries: {
          range: metricsTimeseries.range,
          bucket: metricsTimeseries.bucket,
          window: metricsTimeseries.window,
          points: metricsTimeseries.points
        },
        recentLogs: recentLogsResponse.items,
        recentErrors: recentErrorsResponse.items,
        mostActiveProjects,
        mostActiveEndpoints,
        failureHotspots,
        retryHotspots,
        highestTokenModels,
        topInsights,
        anomalyHints,
        serverConnected: health.ok && health.server === 'up',
        databaseInitialized: health.database === 'initialized',
        lastCheckedAt: health.timestamp,
        rangeStartAt: rangeWindow.dateFrom,
        rangeEndAt: rangeWindow.dateTo,
        loading: false
      });
    } catch (error) {
      set({
        loading: false,
        error: toErrorMessage(error)
      });
    }
  }
}));
