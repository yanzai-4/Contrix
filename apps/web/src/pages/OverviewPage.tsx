import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { CallLogRecord } from '@contrix/runtime-core';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useLogsStore } from '../store/useLogsStore';
import { type OverviewRange, useOverviewStore } from '../store/useOverviewStore';

const CHART_COLORS = {
  primary: '#1d4ed8',
  primarySoft: '#06b6d4',
  success: '#16a34a',
  danger: '#d2364a',
  warning: '#d97706',
  info: '#0891b2',
  muted: '#5f7896'
};

const DONUT_COLORS = ['#1d4ed8', '#2563eb', '#0891b2', '#06b6d4', '#14b8a6', '#5f7896'];

type DistributionTab = 'providers' | 'models' | 'projects' | 'endpoints';
type ModelMetric = 'calls' | 'tokens';
type LatencyTone = 'green' | 'yellow' | 'orange' | 'red' | 'unknown';

interface RuntimeHighlightRow {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  title: string;
  detail: string;
  actionLabel?: string;
  onClick?: () => void;
}

interface OnboardingActionRow {
  id: string;
  title: string;
  detail: string;
  complete: boolean;
  actionLabel: string;
  onClick: () => void;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomSigned(minAbs: number, maxAbs: number): number {
  const magnitude = randomBetween(minAbs, maxAbs);
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

type AmbientBlobTone = 'teal' | 'blue';

function buildAmbientBlobStyle(tone: AmbientBlobTone = 'teal'): CSSProperties {
  const size = randomBetween(320, 560);
  const top = randomBetween(-14, 70);
  const right = randomBetween(-14, 56);
  const duration = randomBetween(70, 112);
  const delay = -randomBetween(0, duration);
  const opacity = randomBetween(0.52, 0.82);
  const originX = randomBetween(30, 46);
  const originY = randomBetween(30, 46);

  const hue = tone === 'blue' ? randomBetween(208, 224) : randomBetween(146, 168);
  const saturation = tone === 'blue' ? randomBetween(62, 82) : randomBetween(58, 78);
  const light = tone === 'blue' ? randomBetween(44, 58) : randomBetween(42, 56);
  const strongAlpha = randomBetween(0.18, 0.3);
  const midAlpha = randomBetween(0.08, 0.16);
  const softAlpha = randomBetween(0.03, 0.08);

  const dx1 = `${randomSigned(8, 24).toFixed(1)}vw`;
  const dy1 = `${randomSigned(4, 14).toFixed(1)}vh`;
  const dx2 = `${randomSigned(14, 40).toFixed(1)}vw`;
  const dy2 = `${randomSigned(10, 26).toFixed(1)}vh`;
  const dx3 = `${randomSigned(10, 34).toFixed(1)}vw`;
  const dy3 = `${randomSigned(14, 38).toFixed(1)}vh`;
  const dx4 = `${randomSigned(6, 20).toFixed(1)}vw`;
  const dy4 = `${randomSigned(10, 30).toFixed(1)}vh`;

  return {
    '--blob-top': `${top.toFixed(1)}%`,
    '--blob-right': `${right.toFixed(1)}%`,
    '--blob-size': `${size.toFixed(0)}px`,
    '--blob-opacity': opacity.toFixed(2),
    '--blob-duration': `${duration.toFixed(1)}s`,
    '--blob-delay': `${delay.toFixed(1)}s`,
    '--blob-bg': `radial-gradient(circle at ${originX.toFixed(0)}% ${originY.toFixed(0)}%, hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${(light + 7).toFixed(0)}%, ${strongAlpha.toFixed(2)}) 0%, hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${light.toFixed(0)}%, ${midAlpha.toFixed(2)}) 38%, hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${Math.max(34, light - 8).toFixed(0)}%, ${softAlpha.toFixed(2)}) 72%, hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${Math.max(30, light - 12).toFixed(0)}%, 0.01) 88%, hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${Math.max(28, light - 14).toFixed(0)}%, 0) 94%)`,
    '--dx1': dx1,
    '--dy1': dy1,
    '--dx2': dx2,
    '--dy2': dy2,
    '--dx3': dx3,
    '--dy3': dy3,
    '--dx4': dx4,
    '--dy4': dy4,
    '--s1': randomBetween(0.96, 1.04).toFixed(3),
    '--s2': randomBetween(0.94, 1.03).toFixed(3),
    '--s3': randomBetween(0.95, 1.04).toFixed(3),
    '--s4': randomBetween(0.96, 1.03).toFixed(3)
  } as CSSProperties;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatLatency(value: number): string {
  return `${value.toFixed(1)} ms`;
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

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function toDateTimeLocalValue(isoValue: string): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}T${pad2(
    parsed.getHours()
  )}:${pad2(parsed.getMinutes())}`;
}

function formatTokenTriplet(log: CallLogRecord): string {
  return `${formatNumber(log.inputTokens ?? 0)} / ${formatNumber(log.outputTokens ?? 0)} / ${formatNumber(log.totalTokens ?? 0)}`;
}

function getLatencyToneByRawMs(latencyMs: number): LatencyTone {
  if (latencyMs < 500) {
    return 'green';
  }

  if (latencyMs < 1200) {
    return 'yellow';
  }

  if (latencyMs < 2500) {
    return 'orange';
  }

  return 'red';
}

function getLatencyMarker(log: Pick<CallLogRecord, 'latencyMs' | 'totalTokens'>): { label: string; tone: LatencyTone } {
  const latencyMs = log.latencyMs;
  if (latencyMs === null || !Number.isFinite(latencyMs)) {
    return { label: 'N/A', tone: 'unknown' };
  }

  const totalTokens = log.totalTokens;
  const hasReliableTokenVolume = Number.isFinite(totalTokens) && Number(totalTokens) >= 80;

  let tone: LatencyTone;
  if (!hasReliableTokenVolume || latencyMs <= 0) {
    tone = getLatencyToneByRawMs(latencyMs);
  } else {
    const tokensPerSecond = Number(totalTokens) / (latencyMs / 1000);
    if (tokensPerSecond >= 180) {
      tone = 'green';
    } else if (tokensPerSecond >= 90) {
      tone = 'yellow';
    } else if (tokensPerSecond >= 40) {
      tone = 'orange';
    } else {
      tone = 'red';
    }
  }

  if (latencyMs >= 15000) {
    tone = 'red';
  } else if (latencyMs >= 8000 && (tone === 'green' || tone === 'yellow')) {
    tone = 'orange';
  }

  return { label: `${latencyMs} ms`, tone };
}

function rangeLabel(range: OverviewRange): string {
  if (range === '24h') {
    return 'Last 24 hours';
  }

  if (range === '30d') {
    return 'Last 30 days';
  }

  return 'Last 7 days';
}

function hasMeaningfulSeries(
  points: Array<Record<string, number | string>>,
  key: string,
  minNonZero = 2
): boolean {
  const nonZero = points.reduce((count, point) => {
    const value = point[key];
    if (typeof value !== 'number') {
      return count;
    }

    return value > 0 ? count + 1 : count;
  }, 0);

  return nonZero >= minNonZero;
}

function DeltaHint({
  delta,
  lowerIsBetter = false
}: {
  delta: number | null;
  lowerIsBetter?: boolean;
}) {
  if (delta === null) {
    return <span className="overview-delta neutral">No baseline</span>;
  }

  if (Math.abs(delta) < 0.1) {
    return <span className="overview-delta neutral">Flat vs previous</span>;
  }

  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  const arrow = delta > 0 ? '\u2191' : '\u2193';

  return (
    <span className={improving ? 'overview-delta good' : 'overview-delta bad'}>
      {arrow} {Math.abs(delta).toFixed(1)}% vs previous
    </span>
  );
}

function MiniSparkline({
  data,
  dataKey,
  color
}: {
  data: Array<Record<string, number | string>>;
  dataKey: string;
  color: string;
}) {
  if (data.length === 0) {
    return null;
  }

  return (
    <div className="overview-mini-sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverviewPage() {
  const {
    range,
    globalSummary,
    rangeSummary,
    previousRangeSummary,
    metricsBreakdown,
    timeseries,
    recentLogs,
    recentErrors,
    mostActiveProjects,
    mostActiveEndpoints,
    failureHotspots,
    retryHotspots,
    highestTokenModels,
    topInsights,
    anomalyHints,
    serverConnected,
    databaseInitialized,
    lastCheckedAt,
    rangeStartAt,
    rangeEndAt,
    loading,
    error,
    setRange,
    refresh
  } = useOverviewStore();

  const [distributionTab, setDistributionTab] = useState<DistributionTab>('providers');
  const [modelMetric, setModelMetric] = useState<ModelMetric>('calls');
  const ambientBlobStyles = useMemo(
    () => Array.from({ length: 5 }, (_, index) => buildAmbientBlobStyle(index < 2 ? 'blue' : 'teal')),
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const updateHeroViewportHeight = () => {
      const hero = document.querySelector('.overview-hero-panel');
      const shell = document.querySelector('.app-shell');
      if (!(hero instanceof HTMLElement)) {
        return;
      }

      const shellStyles = shell instanceof HTMLElement ? window.getComputedStyle(shell) : null;
      const shellPaddingBottom = shellStyles ? Number.parseFloat(shellStyles.paddingBottom || '0') : 24;
      const heroTop = hero.getBoundingClientRect().top;
      const viewportFillNudge = 12;
      const availableHeight = window.innerHeight - heroTop - shellPaddingBottom + viewportFillNudge;
      const targetHeight = Math.max(320, Math.floor(availableHeight));
      document.documentElement.style.setProperty('--overview-hero-target-height', `${targetHeight}px`);
    };

    const frame = window.requestAnimationFrame(updateHeroViewportHeight);
    window.addEventListener('resize', updateHeroViewportHeight);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateHeroViewportHeight);
      document.documentElement.style.removeProperty('--overview-hero-target-height');
    };
  }, []);

  const chartData = useMemo(
    () =>
      (timeseries?.points ?? []).map((point) => ({
        ...point,
        label: point.bucketLabel
      })),
    [timeseries?.points]
  );

  const pulseData = chartData.slice(-24);

  const providerChartData = useMemo(
    () =>
      (metricsBreakdown?.providers ?? [])
        .filter((item) => item.calls > 0)
        .slice(0, 6)
        .map((item) => ({
          name: item.providerName ?? 'Unknown',
          value: item.calls,
          successRate: item.successRate
        })),
    [metricsBreakdown?.providers]
  );

  const modelRankingData = useMemo(() => {
    const sorted = [...(metricsBreakdown?.models ?? [])]
      .filter((item) => (modelMetric === 'calls' ? item.calls > 0 : item.totalTokens > 0))
      .sort((a, b) =>
        modelMetric === 'calls' ? b.calls - a.calls || b.totalTokens - a.totalTokens : b.totalTokens - a.totalTokens
      )
      .slice(0, 8);

    return sorted.map((item) => ({
      name: item.model ?? 'Unspecified',
      value: modelMetric === 'calls' ? item.calls : item.totalTokens
    }));
  }, [metricsBreakdown?.models, modelMetric]);

  const projectRankingData = useMemo(
    () =>
      [...mostActiveProjects]
        .filter((item) => item.calls > 0)
        .slice(0, 8)
        .map((item) => ({
          name: item.projectName ?? 'Unknown',
          value: item.calls
        })),
    [mostActiveProjects]
  );

  const endpointRankingData = useMemo(
    () =>
      [...mostActiveEndpoints]
        .filter((item) => item.calls > 0)
        .slice(0, 8)
        .map((item) => ({
          name: item.endpointName ?? 'Unknown',
          value: item.calls
        })),
    [mostActiveEndpoints]
  );

  const callsDelta = percentDelta(rangeSummary.calls, previousRangeSummary.calls);
  const successDelta = percentDelta(rangeSummary.successRate, previousRangeSummary.successRate);
  const latencyDelta = percentDelta(rangeSummary.avgLatencyMs, previousRangeSummary.avgLatencyMs);
  const tokensDelta = percentDelta(rangeSummary.totalTokens, previousRangeSummary.totalTokens);
  const failureDelta = percentDelta(rangeSummary.failureCount, previousRangeSummary.failureCount);
  const retryDelta = percentDelta(rangeSummary.retryCount, previousRangeSummary.retryCount);

  const applyLogDrilldown = (options?: { success?: 'all' | 'false'; endpointId?: string | null; projectId?: string | null }) => {
    const logsStore = useLogsStore.getState();
    logsStore.resetFilters();

    if (options?.projectId) {
      logsStore.setFilter('project', options.projectId);
    }
    if (options?.endpointId) {
      logsStore.setFilter('endpoint', options.endpointId);
    }
    if (options?.success === 'false') {
      logsStore.setFilter('success', 'false');
    }
    if (rangeStartAt) {
      logsStore.setFilter('dateFrom', toDateTimeLocalValue(rangeStartAt));
    }
    if (rangeEndAt) {
      logsStore.setFilter('dateTo', toDateTimeLocalValue(rangeEndAt));
    }

    logsStore.setPage(1);
    window.location.hash = '#/logs';
  };

  const openProjectDrilldown = (projectId: string | null) => {
    if (projectId) {
      window.location.hash = `#/projects/${projectId}`;
      return;
    }

    window.location.hash = '#/projects';
  };

  const hasCallsChart = hasMeaningfulSeries(chartData, 'calls') && rangeSummary.calls > 0;
  const hasLatencyChart = hasMeaningfulSeries(chartData, 'avgLatencyMs') && rangeSummary.calls > 0;
  const hasTokenChart = hasMeaningfulSeries(chartData, 'totalTokens') && rangeSummary.totalTokens > 0;
  const hasSuccessFailureChart = hasMeaningfulSeries(chartData, 'calls') && rangeSummary.calls > 0;

  const isHealthy = serverConnected && databaseInitialized;
  const isConfigured =
    globalSummary.totalProviders > 0 && globalSummary.totalProjects > 0 && globalSummary.totalEndpoints > 0;
  const hasMeaningfulRuntime = globalSummary.totalCalls >= 5;
  const isOnboardingMode = !isConfigured || !hasMeaningfulRuntime;
  const topEndpoint = mostActiveEndpoints[0] ?? null;
  const topTokenModel = highestTokenModels[0] ?? null;
  const firstProjectId = metricsBreakdown?.projects.find((item) => item.projectId)?.projectId ?? null;
  const runtimeSummary = `${rangeLabel(range)} has ${formatNumber(rangeSummary.calls)} calls, ${formatPercent(
    rangeSummary.successRate
  )} success, and ${formatLatency(rangeSummary.avgLatencyMs)} average latency.`;
  const onboardingActions: OnboardingActionRow[] = [
    {
      id: 'provider',
      title: 'Add your first provider',
      detail:
        globalSummary.totalProviders > 0
          ? `${formatNumber(globalSummary.totalProviders)} provider${globalSummary.totalProviders === 1 ? '' : 's'} configured`
          : 'Connect a provider so runtime requests can execute.',
      complete: globalSummary.totalProviders > 0,
      actionLabel: globalSummary.totalProviders > 0 ? 'Review' : 'Open',
      onClick: () => {
        window.location.hash = '#/settings/providers';
      }
    },
    {
      id: 'project',
      title: 'Create your first project',
      detail:
        globalSummary.totalProjects > 0
          ? `${formatNumber(globalSummary.totalProjects)} project${globalSummary.totalProjects === 1 ? '' : 's'} available`
          : 'Define a contract project to organize endpoints and specs.',
      complete: globalSummary.totalProjects > 0,
      actionLabel: globalSummary.totalProjects > 0 ? 'Open' : 'Create',
      onClick: () => {
        window.location.hash = '#/projects';
      }
    },
    {
      id: 'endpoint-call',
      title: 'Create an endpoint and run a test call',
      detail:
        globalSummary.totalCalls > 0
          ? `First runtime calls recorded (${formatNumber(globalSummary.totalCalls)} total).`
          : globalSummary.totalEndpoints > 0
            ? 'Endpoint is ready. Run a first test call to generate runtime telemetry.'
            : 'Create an endpoint, then run one test call to activate observability.',
      complete: globalSummary.totalCalls > 0,
      actionLabel: globalSummary.totalCalls > 0 ? 'View' : 'Start',
      onClick: () => {
        if (firstProjectId) {
          window.location.hash = `#/projects/${firstProjectId}`;
          return;
        }
        window.location.hash = '#/projects';
      }
    }
  ];
  const pendingOnboardingActions = onboardingActions.filter((action) => !action.complete);
  const runtimeHighlightRows = (() => {
    const rows: RuntimeHighlightRow[] = [];
    const seen = new Set<string>();

    const pushRow = (row: RuntimeHighlightRow) => {
      if (rows.length >= 5 || seen.has(row.id)) {
        return;
      }

      rows.push(row);
      seen.add(row.id);
    };

    if (rangeSummary.failureCount === 0) {
      pushRow({
        id: 'reliability-ok',
        tone: 'positive',
        title: 'Reliability is healthy',
        detail: 'No failures detected in the selected range.'
      });
    } else {
      pushRow({
        id: 'reliability-attention',
        tone: 'warning',
        title: 'Reliability needs attention',
        detail: `${formatNumber(rangeSummary.failureCount)} failures in range (${formatPercent(rangeSummary.successRate)} success).`,
        actionLabel: 'Open logs',
        onClick: () => applyLogDrilldown({ success: 'false' })
      });
    }

    if (rangeSummary.retryCount === 0) {
      pushRow({
        id: 'retry-ok',
        tone: 'positive',
        title: 'Retry activity is clean',
        detail: 'No retries detected in the selected range.'
      });
    } else {
      const retryDetail =
        retryDelta !== null
          ? `${formatNumber(rangeSummary.retryCount)} retries (${retryDelta >= 0 ? '+' : '-'}${Math.abs(retryDelta).toFixed(1)}% vs previous).`
          : `${formatNumber(rangeSummary.retryCount)} retries in the selected range.`;

      pushRow({
        id: 'retry-watch',
        tone: retryDelta !== null && retryDelta >= 20 ? 'warning' : 'neutral',
        title: retryDelta !== null && retryDelta >= 20 ? 'Retry activity elevated' : 'Retry activity observed',
        detail: retryDetail,
        actionLabel: 'Inspect',
        onClick: () => applyLogDrilldown()
      });
    }

    anomalyHints.forEach((hint) => {
      pushRow({
        id: `anomaly-${hint.id}`,
        tone: 'warning',
        title: 'Anomaly hint',
        detail: hint.message,
        actionLabel: 'Open logs',
        onClick: () => applyLogDrilldown({ success: 'false' })
      });
    });

    if (topEndpoint) {
      pushRow({
        id: 'top-endpoint',
        tone: 'neutral',
        title: 'Most active endpoint',
        detail: `${topEndpoint.endpointName ?? 'Unknown endpoint'} handled ${formatNumber(topEndpoint.calls)} calls.`,
        actionLabel: 'Open',
        onClick: () => openProjectDrilldown(topEndpoint.projectId)
      });
    }

    if (topTokenModel) {
      pushRow({
        id: 'top-token-model',
        tone: 'neutral',
        title: 'Top token-consuming model',
        detail: `${topTokenModel.model ?? 'Unspecified model'} consumed ${formatNumber(topTokenModel.totalTokens)} tokens.`
      });
    }

    if (latencyDelta !== null && Math.abs(latencyDelta) >= 5) {
      const improved = latencyDelta < 0;
      pushRow({
        id: 'latency-trend',
        tone: improved ? 'positive' : 'warning',
        title: improved ? 'Latency is improving' : 'Latency is elevated',
        detail: `${Math.abs(latencyDelta).toFixed(1)}% ${improved ? 'lower' : 'higher'} than the previous window.`
      });
    } else if (callsDelta !== null && Math.abs(callsDelta) >= 10) {
      pushRow({
        id: 'call-trend',
        tone: callsDelta > 0 ? 'positive' : 'neutral',
        title: callsDelta > 0 ? 'Call activity is increasing' : 'Call activity is lower',
        detail: `${Math.abs(callsDelta).toFixed(1)}% ${callsDelta > 0 ? 'higher' : 'lower'} than the previous window.`
      });
    } else {
      pushRow({
        id: 'trend-stable',
        tone: 'neutral',
        title: 'Trend is stable',
        detail: 'Call volume and latency are steady versus the previous window.'
      });
    }

    if (rows.length < 3) {
      topInsights.forEach((insight) => {
        if (rows.length >= 5) {
          return;
        }
        pushRow({
          id: `insight-${insight.id}`,
          tone: insight.tone,
          title: 'Observation',
          detail: insight.message
        });
      });
    }

    if (rows.length < 3) {
      pushRow({
        id: 'fallback-activity',
        tone: 'neutral',
        title: 'Runtime activity summary',
        detail: `${formatNumber(rangeSummary.calls)} calls and ${formatNumber(rangeSummary.totalTokens)} tokens in ${rangeLabel(range).toLowerCase()}.`
      });
    }

    return rows.slice(0, 5);
  })();
  const secondaryDistributionsBlock = (
    <article className="overview-pulse-card overview-distribution-panel overview-distribution-panel-hero">
      <div className="panel-header-row">
        <p className="overview-section-kicker">Secondary Distributions</p>
        <div className="overview-segmented-tabs">
          <button
            type="button"
            className={distributionTab === 'providers' ? 'overview-segmented-btn active' : 'overview-segmented-btn'}
            onClick={() => setDistributionTab('providers')}
          >
            Providers
          </button>
          <button
            type="button"
            className={distributionTab === 'models' ? 'overview-segmented-btn active' : 'overview-segmented-btn'}
            onClick={() => setDistributionTab('models')}
          >
            Models
          </button>
          <button
            type="button"
            className={distributionTab === 'projects' ? 'overview-segmented-btn active' : 'overview-segmented-btn'}
            onClick={() => setDistributionTab('projects')}
          >
            Projects
          </button>
          <button
            type="button"
            className={distributionTab === 'endpoints' ? 'overview-segmented-btn active' : 'overview-segmented-btn'}
            onClick={() => setDistributionTab('endpoints')}
          >
            Endpoints
          </button>
        </div>
      </div>

      {distributionTab === 'providers' ? (
        <div className="overview-distribution-grid">
          <div className="overview-chart-wrap">
            {providerChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={providerChartData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={3}>
                    {providerChartData.map((entry, index) => (
                      <Cell key={`provider-${entry.name}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="overview-chart-fallback">
                <p>Provider distribution appears after provider traffic is recorded.</p>
              </div>
            )}
          </div>
          <ul className="overview-legend-list">
            {providerChartData.map((item, index) => (
              <li key={item.name}>
                <i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                <span>{item.name}</span>
                <strong>{formatNumber(item.value)} calls</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {distributionTab === 'models' ? (
        <div className="overview-distribution-single">
          <div className="overview-model-toggle">
            <button
              type="button"
              className={modelMetric === 'calls' ? 'overview-segmented-btn active' : 'overview-segmented-btn'}
              onClick={() => setModelMetric('calls')}
            >
              By Calls
            </button>
            <button
              type="button"
              className={modelMetric === 'tokens' ? 'overview-segmented-btn active' : 'overview-segmented-btn'}
              onClick={() => setModelMetric('tokens')}
            >
              By Tokens
            </button>
          </div>
          {modelRankingData.length > 0 ? (
            <div className="overview-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelRankingData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={CHART_COLORS.info} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overview-chart-fallback">
              <p>No model activity yet for this ranking view.</p>
            </div>
          )}
          {highestTokenModels.length > 0 ? (
            <p className="meta-line">
              Top token model: {highestTokenModels[0]?.model ?? 'Unspecified'} ({formatNumber(highestTokenModels[0]?.totalTokens ?? 0)} tokens)
            </p>
          ) : null}
        </div>
      ) : null}

      {distributionTab === 'projects' ? (
        <div className="overview-distribution-single">
          {projectRankingData.length > 0 ? (
            <div className="overview-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectRankingData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={CHART_COLORS.primarySoft} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overview-chart-fallback">
              <p>No project-level activity ranking yet.</p>
            </div>
          )}
        </div>
      ) : null}

      {distributionTab === 'endpoints' ? (
        <div className="overview-distribution-single">
          {endpointRankingData.length > 0 ? (
            <div className="overview-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={endpointRankingData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={CHART_COLORS.warning} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overview-chart-fallback">
              <p>No endpoint activity ranking yet.</p>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );

  return (
    <section className="dashboard-page overview-v2-page">
      <section className="panel overview-hero-panel">
        <div className="overview-hero-ambient" aria-hidden="true">
          {ambientBlobStyles.map((style, index) => (
            <span key={`ambient-blob-${index}`} className="overview-hero-blob" style={style} />
          ))}
        </div>

        <div className="overview-hero-top">
          <div className="overview-hero-title-block">
            <h2>Overview Control Center</h2>
            <p className="meta-line">Contract-first runtime observability with prioritized insights and drill-downs.</p>
          </div>

          <div className="overview-hero-controls">
            <div className="overview-range-switch" role="tablist" aria-label="Overview range">
              {(['24h', '7d', '30d'] as OverviewRange[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === range ? 'overview-range-btn active' : 'overview-range-btn'}
                  onClick={() => {
                    setRange(option);
                    void refresh(option);
                  }}
                  disabled={loading}
                >
                  {option}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void refresh(range)} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh Overview'}
            </button>
          </div>
        </div>

        <div className="overview-hero-status-grid">
          <article className={isHealthy ? 'overview-health-card healthy' : 'overview-health-card warning'}>
            <p className="overview-health-title">System Health</p>
            <p className="overview-health-value">{isHealthy ? 'Healthy' : 'Needs Attention'}</p>
            <p className="overview-health-meta">
              {serverConnected ? 'Server connected' : 'Server disconnected'} |{' '}
              {databaseInitialized ? 'Database initialized' : 'Database issue'}
            </p>
          </article>

          <article className="overview-health-card">
            <p className="overview-health-title">{rangeLabel(range)} Calls</p>
            <p className="overview-health-value">{formatNumber(rangeSummary.calls)}</p>
            <p className="overview-health-meta">Selected range activity volume</p>
          </article>

          <article className="overview-health-card">
            <p className="overview-health-title">{rangeLabel(range)} Success Rate</p>
            <p className="overview-health-value">{formatPercent(rangeSummary.successRate)}</p>
            <p className="overview-health-meta">Reliability in selected range</p>
          </article>

          <article className="overview-health-card">
            <p className="overview-health-title">{rangeLabel(range)} Avg Latency</p>
            <p className="overview-health-value">{formatLatency(rangeSummary.avgLatencyMs)}</p>
            <p className="overview-health-meta">Performance in selected range</p>
          </article>
        </div>

        <div className="overview-hero-visual-grid">
          <article className="overview-highlights-card">
            <div className="overview-highlights-head">
              <p className="overview-section-kicker">{isOnboardingMode ? 'Workspace Setup' : 'Operational Summary'}</p>
              <h3>{isOnboardingMode ? 'Getting Started' : 'Runtime Highlights'}</h3>
              <p className="overview-highlights-summary">
                {isOnboardingMode
                  ? 'Your workspace is ready to be configured. Complete a few setup steps to start running contract-defined endpoints.'
                  : runtimeSummary}
              </p>
            </div>

            {isOnboardingMode ? (
              <div className="overview-onboarding-list">
                {pendingOnboardingActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={action.complete ? 'overview-onboarding-row' : 'overview-onboarding-row warning'}
                    onClick={action.onClick}
                  >
                    <span
                      className={
                        action.complete ? 'overview-status-dot done' : 'overview-status-dot pending warning'
                      }
                    />
                    <span className="overview-onboarding-copy">
                      <strong>{action.title}</strong>
                      <span>{action.detail}</span>
                    </span>
                    <span
                      className={
                        action.complete ? 'overview-onboarding-state done' : 'overview-onboarding-state warning'
                      }
                    >
                      {action.complete ? 'Done' : action.actionLabel}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <ul className="overview-highlight-list">
                {runtimeHighlightRows.map((row) => (
                  <li key={row.id} className={`overview-highlight-row ${row.tone}`}>
                    <span className={row.tone === 'positive' ? 'overview-status-dot done' : 'overview-status-dot pending'} />
                    <div className="overview-highlight-copy">
                      <strong>{row.title}</strong>
                      <span>{row.detail}</span>
                    </div>
                    {row.actionLabel && row.onClick ? (
                      <button type="button" className="btn-muted overview-highlight-action" onClick={row.onClick}>
                        {row.actionLabel}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

          </article>

          <div className="overview-hero-right-stack">
            <article className="overview-pulse-card">
              <div className="overview-pulse-header">
                <p className="overview-section-kicker">Runtime Pulse</p>
                <span className="meta-line">{rangeLabel(range)}</span>
              </div>
              {pulseData.length > 1 ? (
                <div className="overview-pulse-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pulseData}>
                      <defs>
                        <linearGradient id="pulseCalls" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.55} />
                          <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="calls"
                        stroke={CHART_COLORS.primary}
                        fill="url(#pulseCalls)"
                        strokeWidth={2}
                      />
                      <Line type="monotone" dataKey="failedCalls" stroke={CHART_COLORS.danger} dot={false} strokeWidth={1.7} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="meta-line">Pulse visualization appears after runtime activity is recorded.</p>
              )}
            </article>
            {secondaryDistributionsBlock}
          </div>
        </div>

        <p className="meta-line">Last checked: {formatDateTime(lastCheckedAt)}</p>
        {error ? <p className="error-line">Error: {error}</p> : null}
      </section>

      <section className="overview-primary-kpi-grid">
        <article className="panel overview-kpi-card">
          <p className="overview-kpi-label">Total Calls</p>
          <p className="overview-kpi-value">{formatNumber(rangeSummary.calls)}</p>
          <DeltaHint delta={callsDelta} />
          <MiniSparkline data={chartData} dataKey="calls" color={CHART_COLORS.primary} />
        </article>

        <article className="panel overview-kpi-card">
          <p className="overview-kpi-label">Recent Success Rate</p>
          <p className="overview-kpi-value">{formatPercent(rangeSummary.successRate)}</p>
          <DeltaHint delta={successDelta} />
          <MiniSparkline data={chartData} dataKey="successRate" color={CHART_COLORS.success} />
        </article>

        <article className="panel overview-kpi-card">
          <p className="overview-kpi-label">Average Latency</p>
          <p className="overview-kpi-value">{formatLatency(rangeSummary.avgLatencyMs)}</p>
          <DeltaHint delta={latencyDelta} lowerIsBetter />
          <MiniSparkline data={chartData} dataKey="avgLatencyMs" color={CHART_COLORS.info} />
        </article>

        <article className="panel overview-kpi-card">
          <p className="overview-kpi-label">Total Tokens</p>
          <p className="overview-kpi-value">{formatNumber(rangeSummary.totalTokens)}</p>
          <DeltaHint delta={tokensDelta} />
          <MiniSparkline data={chartData} dataKey="totalTokens" color={CHART_COLORS.warning} />
        </article>

        <article className="panel overview-kpi-card">
          <p className="overview-kpi-label">Recent Failure Count</p>
          <p className="overview-kpi-value">{formatNumber(rangeSummary.failureCount)}</p>
          <DeltaHint delta={failureDelta} lowerIsBetter />
          <MiniSparkline data={chartData} dataKey="failedCalls" color={CHART_COLORS.danger} />
        </article>

        <article className="panel overview-kpi-card">
          <p className="overview-kpi-label">Recent Retry Count</p>
          <p className="overview-kpi-value">{formatNumber(rangeSummary.retryCount)}</p>
          <DeltaHint delta={retryDelta} lowerIsBetter />
          <MiniSparkline data={chartData} dataKey="retryCount" color={CHART_COLORS.muted} />
        </article>
      </section>

      <section className="panel overview-secondary-metrics-panel">
        <h3>Secondary Context</h3>
        <div className="overview-secondary-metrics">
          <span className="meta-pill">Projects: {formatNumber(globalSummary.totalProjects)}</span>
          <span className="meta-pill">Endpoints: {formatNumber(globalSummary.totalEndpoints)}</span>
          <span className="meta-pill">Providers: {formatNumber(globalSummary.totalProviders)}</span>
          <span className="meta-pill">All-time Calls: {formatNumber(globalSummary.totalCalls)}</span>
          <span className="meta-pill">Input Tokens: {formatNumber(rangeSummary.inputTokens)}</span>
          <span className="meta-pill">Output Tokens: {formatNumber(rangeSummary.outputTokens)}</span>
          <span className="meta-pill">Cached Tokens: {formatNumber(rangeSummary.cachedTokens)}</span>
          <span className="meta-pill">All-time Repairs: {formatNumber(globalSummary.totalRepairs)}</span>
        </div>
      </section>

      <section className="overview-trend-grid">
        <article className="panel">
          <h3>Calls Over Time</h3>
          {hasCallsChart ? (
            <div className="overview-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="callsArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    stroke={CHART_COLORS.primary}
                    fill="url(#callsArea)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overview-chart-fallback">
              <p>Not enough call volume to render a trend chart yet.</p>
              <p className="meta-line">Calls in range: {formatNumber(rangeSummary.calls)}</p>
            </div>
          )}
        </article>

        <article className="panel">
          <h3>Success vs Failure Over Time</h3>
          {hasSuccessFailureChart ? (
            <div className="overview-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="successCalls" stackId="calls" fill={CHART_COLORS.success} name="Success" />
                  <Bar dataKey="failedCalls" stackId="calls" fill={CHART_COLORS.danger} name="Failure" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overview-chart-fallback">
              <p>Reliability trend appears once more calls are available.</p>
              <p className="meta-line">Failures in range: {formatNumber(rangeSummary.failureCount)}</p>
            </div>
          )}
        </article>

        <article className="panel">
          <h3>Latency Trend</h3>
          {hasLatencyChart ? (
            <div className="overview-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value} ms`} />
                  <Line type="monotone" dataKey="avgLatencyMs" stroke={CHART_COLORS.info} strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overview-chart-fallback">
              <p>Latency trend needs more than one active bucket.</p>
              <p className="meta-line">Current average latency: {formatLatency(rangeSummary.avgLatencyMs)}</p>
            </div>
          )}
        </article>

        <article className="panel">
          <h3>Token Usage Trend</h3>
          {hasTokenChart ? (
            <div className="overview-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="inputTokens" stackId="tokens" stroke={CHART_COLORS.info} fill="#bfdbfe" name="Input" />
                  <Area
                    type="monotone"
                    dataKey="outputTokens"
                    stackId="tokens"
                    stroke={CHART_COLORS.warning}
                    fill="#fde68a"
                    name="Output"
                  />
                  <Area
                    type="monotone"
                    dataKey="cachedTokens"
                    stroke={CHART_COLORS.primary}
                    fill="#99f6e4"
                    fillOpacity={0.55}
                    name="Cached"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overview-chart-fallback">
              <p>Token trend is unavailable for the current data volume.</p>
              <p className="meta-line">Tokens in range: {formatNumber(rangeSummary.totalTokens)}</p>
            </div>
          )}
        </article>
      </section>

      <section className="overview-risk-grid">
        <article className="panel">
          <div className="panel-header-row">
            <h3>Recent Errors</h3>
            <button
              type="button"
              className="btn-muted overview-header-action"
              onClick={() => applyLogDrilldown({ success: 'false' })}
            >
              Open in Logs
            </button>
          </div>
          {recentErrors.length === 0 ? (
            <div className="overview-positive-empty">
              <p>No recent errors in the selected range.</p>
              <p className="meta-line">Reliability looks stable for {rangeLabel(range).toLowerCase()}.</p>
            </div>
          ) : (
            <ul className="overview-compact-list">
              {recentErrors.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => applyLogDrilldown({ success: 'false', endpointId: item.endpointKey })}>
                    <strong>{item.endpointName ?? item.endpointKey ?? 'Unknown endpoint'}</strong>
                    <span>{item.errorType ?? 'RUNTIME_ERROR'}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel overview-reliability-panel">
          <div className="panel-header-row">
            <h3>{failureHotspots.length > 0 ? 'Failure Hotspots' : 'Reliability Snapshot'}</h3>
          </div>
          {failureHotspots.length === 0 ? (
            <div className="overview-positive-empty">
              <p>No failure-prone endpoints detected in this range.</p>
              <p className="meta-line">Endpoint reliability is currently healthy.</p>
            </div>
          ) : (
            <ul className="overview-compact-list">
              {failureHotspots.slice(0, 6).map((item) => (
                <li key={item.endpointId ?? `${item.endpointName}-${item.projectName}`}>
                  <button type="button" onClick={() => applyLogDrilldown({ success: 'false', endpointId: item.endpointId })}>
                    <strong>{item.endpointName ?? 'Unknown endpoint'}</strong>
                    <span>{item.projectName ?? 'Unknown project'}</span>
                    <span>{item.failedCalls} failures | {formatPercent(item.successRate)} success</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel">
          <h3>Retry Hotspots</h3>
          {retryHotspots.length === 0 ? (
            <div className="overview-chart-fallback">
              <p>No significant retry activity in the selected range.</p>
            </div>
          ) : (
            <ul className="overview-compact-list">
              {retryHotspots.slice(0, 6).map((item) => (
                <li key={item.endpointId ?? `${item.endpointName}-${item.projectName}`}>
                  <button type="button" onClick={() => applyLogDrilldown({ endpointId: item.endpointId })}>
                    <strong>{item.endpointName ?? 'Unknown endpoint'}</strong>
                    <span>{item.projectName ?? 'Unknown project'}</span>
                    <span>{item.retryCount} retries | {formatNumber(item.calls)} calls</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel">
          <h3>Most Active Endpoints</h3>
          {mostActiveEndpoints.length === 0 ? (
            <div className="overview-chart-fallback">
              <p>No endpoint activity in the selected range yet.</p>
            </div>
          ) : (
            <ul className="overview-compact-list">
              {mostActiveEndpoints.slice(0, 6).map((item) => (
                <li key={item.endpointId ?? `${item.endpointName}-${item.projectName}`}>
                  <button type="button" onClick={() => openProjectDrilldown(item.projectId)}>
                    <strong>{item.endpointName ?? 'Unknown endpoint'}</strong>
                    <span>{item.projectName ?? 'Unknown project'}</span>
                    <span>{formatNumber(item.calls)} calls | {formatLatency(item.avgLatencyMs)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="panel overview-recent-logs-panel">
        <div className="panel-header-row">
          <h3>Recent Call Logs</h3>
          <button type="button" className="btn-muted overview-header-action" onClick={() => applyLogDrilldown()}>
            View all logs
          </button>
        </div>
        <div className="table-wrap">
          <table className="project-table overview-compact-table list-themed-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Tokens (I/O/T)</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.slice(0, 6).map((log) => {
                const marker = getLatencyMarker(log);
                return (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.endpointName ?? log.endpointKey ?? '-'}</td>
                    <td>
                      <span className={log.success ? 'overview-badge success' : 'overview-badge failure'}>
                        {log.success ? 'Success' : 'Failure'}
                      </span>
                    </td>
                    <td>
                      <span className={`logs-state-pill logs-latency-pill-${marker.tone}`}>{marker.label}</span>
                    </td>
                    <td>{formatTokenTriplet(log)}</td>
                  </tr>
                );
              })}
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={5}>No recent call logs in this range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

    </section>
  );
}

