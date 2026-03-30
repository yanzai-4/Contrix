import { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import type { CallLogCleanupWindow, CallLogRecord } from '@contrix/runtime-core';
import { cleanupCallLogs, fetchEndpoints, fetchProjects, fetchProviders } from '../services/api';
import { ModalShell } from '../components/common/ModalShell';
import { useLogsStore } from '../store/useLogsStore';
import { ReplayDebuggerPage } from './ReplayDebuggerPage';

const columnHelper = createColumnHelper<CallLogRecord>();

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatTokens(log: CallLogRecord): string {
  return `${log.inputTokens ?? 0} / ${log.outputTokens ?? 0} / ${log.totalTokens ?? 0}`;
}

type CacheMarkerTone = 'hit' | 'miss' | 'unknown';
type OutputSourceTone = 'direct' | 'repaired' | 'fallback' | 'error' | 'unknown';
type LatencyTone = 'green' | 'yellow' | 'orange' | 'red' | 'unknown';

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

function getCacheMarker(log: CallLogRecord): { label: string; tone: CacheMarkerTone } {
  if (log.cacheHitObserved === true) {
    return { label: 'Hit', tone: 'hit' };
  }

  if (log.cacheHitObserved === false) {
    return { label: 'Miss', tone: 'miss' };
  }

  if ((log.cachedTokens ?? 0) > 0) {
    return { label: 'Hit', tone: 'hit' };
  }

  return { label: '-', tone: 'unknown' };
}

function getSuccessMarker(success: boolean): { label: string; tone: 'success' | 'failure' } {
  return success
    ? { label: 'Success', tone: 'success' }
    : { label: 'Failure', tone: 'failure' };
}

function getOutputSourceMarker(
  outputSource: CallLogRecord['outputSource']
): { label: string; tone: OutputSourceTone } {
  if (!outputSource) {
    return { label: '-', tone: 'unknown' };
  }

  if (outputSource === 'provider_direct_valid') {
    return { label: 'Direct', tone: 'direct' };
  }

  if (
    outputSource === 'deterministic_repair' ||
    outputSource === 'repair_retry_valid' ||
    outputSource === 'repair_retry_deterministic_repair'
  ) {
    return { label: 'Repaired', tone: 'repaired' };
  }

  if (
    outputSource === 'fallback_auto_text' ||
    outputSource === 'fallback_auto_json' ||
    outputSource === 'fallback_manual_text' ||
    outputSource === 'fallback_manual_json'
  ) {
    return { label: 'Fallback', tone: 'fallback' };
  }

  return { label: outputSource, tone: 'error' };
}

function getRepairMarker(repairCount: number): { label: string; tone: 'active' | 'idle' } {
  return repairCount > 0
    ? { label: String(repairCount), tone: 'active' }
    : { label: '-', tone: 'idle' };
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

function cleanupWindowLabel(window: CallLogCleanupWindow): string {
  if (window === '7d') {
    return '7 days';
  }

  if (window === '1m') {
    return '1 month';
  }

  if (window === 'all') {
    return 'all logs';
  }

  return '3 months';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function CallLogsPage() {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleanupWindow, setCleanupWindow] = useState<CallLogCleanupWindow>('7d');
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [endpointOptions, setEndpointOptions] = useState<Array<{ id: string; name: string; pathSlug: string }>>([]);
  const [providerOptions, setProviderOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [filterOptionsError, setFilterOptionsError] = useState<string | null>(null);
  const logsListState = useLogsStore((state) => state.logsListState);
  const logsFilterState = useLogsStore((state) => state.logsFilterState);
  const page = useLogsStore((state) => state.page);
  const pageSize = useLogsStore((state) => state.pageSize);
  const loading = useLogsStore((state) => state.loading);
  const error = useLogsStore((state) => state.error);
  const refresh = useLogsStore((state) => state.refresh);
  const setPage = useLogsStore((state) => state.setPage);
  const setPageSize = useLogsStore((state) => state.setPageSize);
  const setFilter = useLogsStore((state) => state.setFilter);
  const resetFilters = useLogsStore((state) => state.resetFilters);

  useEffect(() => {
    void refresh();
  }, [refresh, page, pageSize]);

  useEffect(() => {
    let active = true;

    const loadOptions = async () => {
      setFilterOptionsLoading(true);
      setFilterOptionsError(null);

      try {
        const [projectsResponse, providersResponse, endpointsResponse] = await Promise.all([
          fetchProjects(),
          fetchProviders(),
          fetchEndpoints(logsFilterState.project ? { projectId: logsFilterState.project } : undefined)
        ]);

        if (!active) {
          return;
        }

        setProjectOptions(
          [...projectsResponse.projects]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => ({ id: project.id, name: project.name }))
        );
        setProviderOptions(
          [...providersResponse.providers]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((provider) => ({ id: provider.id, name: provider.name }))
        );
        setEndpointOptions(
          [...endpointsResponse.endpoints]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((endpoint) => ({ id: endpoint.id, name: endpoint.name, pathSlug: endpoint.pathSlug }))
        );
      } catch (optionsError) {
        if (!active) {
          return;
        }

        setFilterOptionsError(toErrorMessage(optionsError));
      } finally {
        if (active) {
          setFilterOptionsLoading(false);
        }
      }
    };

    void loadOptions();

    return () => {
      active = false;
    };
  }, [logsFilterState.project]);

  useEffect(() => {
    if (!logsFilterState.endpoint) {
      return;
    }

    const endpointExists = endpointOptions.some((endpoint) => endpoint.id === logsFilterState.endpoint);
    if (!endpointExists) {
      setFilter('endpoint', '');
    }
  }, [endpointOptions, logsFilterState.endpoint, setFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('createdAt', {
        header: 'Created At',
        cell: (info) => formatDate(info.getValue())
      }),
      columnHelper.display({
        id: 'project',
        header: 'Project',
        cell: (info) => info.row.original.projectName ?? info.row.original.projectKey ?? 'N/A'
      }),
      columnHelper.display({
        id: 'endpoint',
        header: 'Endpoint',
        cell: (info) => info.row.original.endpointName ?? info.row.original.endpointKey ?? 'N/A'
      }),
      columnHelper.display({
        id: 'providerModel',
        header: 'Provider / Model',
        cell: (info) => {
          const provider = info.row.original.providerLabel ?? info.row.original.providerKey ?? 'N/A';
          const model = info.row.original.model ?? 'N/A';
          return `${provider} / ${model}`;
        }
      }),
      columnHelper.accessor('success', {
        header: 'Success',
        cell: (info) => {
          const marker = getSuccessMarker(info.getValue());
          return (
            <span className={`logs-state-pill logs-success-pill-${marker.tone}`}>
              {marker.label}
            </span>
          );
        }
      }),
      columnHelper.accessor('outputSource', {
        header: 'Output Source',
        cell: (info) => {
          const marker = getOutputSourceMarker(info.getValue());
          return (
            <span className={`logs-state-pill logs-output-pill-${marker.tone}`}>
              {marker.label}
            </span>
          );
        }
      }),
      columnHelper.accessor('repairCount', {
        header: 'Repairs',
        cell: (info) => {
          const marker = getRepairMarker(info.getValue());
          return marker.tone === 'idle' ? (
            <span className="logs-muted-text">{marker.label}</span>
          ) : (
            <span className={`logs-state-pill logs-repair-pill-${marker.tone}`}>
              {marker.label}
            </span>
          );
        }
      }),
      columnHelper.accessor('latencyMs', {
        header: 'Latency',
        cell: (info) => {
          const marker = getLatencyMarker(info.row.original);
          return (
            <span className={`logs-state-pill logs-latency-pill-${marker.tone}`}>
              {marker.label}
            </span>
          );
        }
      }),
      columnHelper.display({
        id: 'cache',
        header: 'Cache',
        cell: (info) => {
          const marker = getCacheMarker(info.row.original);
          return (
            <span className={`logs-state-pill logs-cache-badge-${marker.tone}`}>{marker.label}</span>
          );
        }
      }),
      columnHelper.display({
        id: 'tokens',
        header: 'Tokens (I/O/T)',
        cell: (info) => <span className="logs-tokens-text">{formatTokens(info.row.original)}</span>
      }),
      columnHelper.accessor('errorType', {
        header: 'Error Type',
        cell: (info) => {
          const value = info.getValue();
          return value ? (
            <span className="logs-state-pill logs-error-pill-active">{value}</span>
          ) : (
            <span className="logs-muted-text">-</span>
          );
        }
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Action',
        cell: (info) => (
          <button type="button" onClick={() => setSelectedLogId(info.row.original.id)}>
            Detail
          </button>
        )
      })
    ],
    []
  );

  const table = useReactTable({
    data: logsListState?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const totalPages = logsListState?.totalPages ?? 0;
  const tableRows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length || 1;
  const showEmptyLogsHintInTable = !loading && !error && tableRows.length === 0;
  const minimumVisibleRows = 5;
  const fillerRowCount = showEmptyLogsHintInTable ? 0 : Math.max(0, minimumVisibleRows - tableRows.length);

  const handleCleanup = async () => {
    setCleanupMessage(null);
    setCleanupBusy(true);

    try {
      const preview = await cleanupCallLogs({ window: cleanupWindow, dryRun: true });
      const label = cleanupWindowLabel(cleanupWindow);
      const isDeleteAll = cleanupWindow === 'all';

      if (preview.matchedCount <= 0) {
        setCleanupMessage(isDeleteAll ? 'No logs found to delete.' : `No logs older than ${label} were found.`);
        return;
      }

      const confirmed = window.confirm(
        isDeleteAll
          ? `Delete ALL ${preview.matchedCount} logs? This action cannot be undone.`
          : `Delete ${preview.matchedCount} logs older than ${label}?\nCutoff: ${new Date(preview.cutoffAt).toLocaleString()}`
      );

      if (!confirmed) {
        setCleanupMessage('Cleanup canceled.');
        return;
      }

      const result = await cleanupCallLogs({ window: cleanupWindow, dryRun: false });
      setCleanupMessage(
        isDeleteAll
          ? `Deleted ${result.deletedCount} logs.`
          : `Deleted ${result.deletedCount} logs older than ${label}.`
      );
      setPage(1);
      await refresh();
      setCleanupModalOpen(false);
    } catch (cleanupError) {
      setCleanupMessage(`Cleanup failed: ${toErrorMessage(cleanupError)}`);
    } finally {
      setCleanupBusy(false);
    }
  };

  return (
    <section className="logs-page">
      <section className="panel">
        <div className="dashboard-header-row">
          <h2>Logs</h2>
          <div className="row-actions">
            <button
              type="button"
              onClick={() => {
                setCleanupMessage(null);
                setCleanupModalOpen(true);
              }}
              disabled={loading}
            >
              Cleanup
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                void refresh();
              }}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="logs-filter-toolbar">
          <section className="logs-filter-cluster">
            <p className="logs-filter-cluster-title">Identity</p>
            <div className="logs-filter-fields logs-filter-fields-identity">
              <label className="logs-filter-field">
                <span>Project</span>
                <select
                  value={logsFilterState.project}
                  onChange={(event) => setFilter('project', event.target.value)}
                  disabled={filterOptionsLoading}
                >
                  <option value="">All Projects</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="logs-filter-field">
                <span>Endpoint</span>
                <select
                  value={logsFilterState.endpoint}
                  onChange={(event) => setFilter('endpoint', event.target.value)}
                  disabled={filterOptionsLoading}
                >
                  <option value="">All Endpoints</option>
                  {endpointOptions.map((endpoint) => (
                    <option key={endpoint.id} value={endpoint.id}>
                      {endpoint.name} ({endpoint.pathSlug})
                    </option>
                  ))}
                </select>
              </label>
              <label className="logs-filter-field">
                <span>Provider</span>
                <select
                  value={logsFilterState.provider}
                  onChange={(event) => setFilter('provider', event.target.value)}
                  disabled={filterOptionsLoading}
                >
                  <option value="">All Providers</option>
                  {providerOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="logs-filter-cluster">
            <p className="logs-filter-cluster-title">Status &amp; Time</p>
            <div className="logs-filter-fields logs-filter-fields-status">
              <label className="logs-filter-field">
                <span>Success</span>
                <select
                  value={logsFilterState.success}
                  onChange={(event) => setFilter('success', event.target.value as 'all' | 'true' | 'false')}
                >
                  <option value="all">All</option>
                  <option value="true">Success</option>
                  <option value="false">Failure</option>
                </select>
              </label>
              <label className="logs-filter-field">
                <span>Date From</span>
                <input
                  type="datetime-local"
                  value={logsFilterState.dateFrom}
                  onChange={(event) => setFilter('dateFrom', event.target.value)}
                />
              </label>
              <label className="logs-filter-field">
                <span>Date To</span>
                <input
                  type="datetime-local"
                  value={logsFilterState.dateTo}
                  onChange={(event) => setFilter('dateTo', event.target.value)}
                />
              </label>
            </div>
          </section>
          <div className="logs-filter-actions">
            <button
              type="button"
              className="endpoint-action-btn endpoint-action-primary row-action-btn"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Apply Filters
            </button>
            <button
              type="button"
              className="endpoint-action-btn endpoint-action-secondary row-action-btn"
              onClick={() => {
                resetFilters();
                setPage(1);
                void refresh();
              }}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </div>
        {filterOptionsError ? <p className="meta-line">Filter options unavailable: {filterOptionsError}</p> : null}

        {error ? <p className="error-line">Error: {error}</p> : null}

        <div className="table-wrap">
          <table className="project-table list-themed-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {showEmptyLogsHintInTable ? (
                <tr className="logs-empty-row">
                  <td colSpan={visibleColumnCount} className="logs-empty-cell">
                    No logs yet. Run a request from Projects / Test to generate your first log entry.
                  </td>
                </tr>
              ) : null}
              {tableRows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
              {Array.from({ length: fillerRowCount }).map((_, index) => (
                <tr key={`logs-filler-row-${index}`} className="logs-placeholder-row" aria-hidden="true">
                  <td colSpan={visibleColumnCount}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-row">
          <span>
            Page {logsListState?.page ?? 1} / {totalPages || 1}
          </span>
          <span>Total: {logsListState?.total ?? 0}</span>
          <button type="button" onClick={() => setPage(Math.max(page - 1, 1))} disabled={page <= 1 || loading}>
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={loading || totalPages === 0 || page >= totalPages}
          >
            Next
          </button>
          <label className="logs-page-size-control">
            Page Size
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>
      </section>
      {selectedLogId ? (
        <ModalShell onClose={() => setSelectedLogId(null)} size="xl">
          <ReplayDebuggerPage logId={selectedLogId} onBack={() => setSelectedLogId(null)} />
        </ModalShell>
      ) : null}
      {cleanupModalOpen ? (
        <ModalShell
          onClose={() => {
            if (!cleanupBusy) {
              setCleanupModalOpen(false);
            }
          }}
          size="default"
        >
          <section className="panel">
            <div className="dashboard-header-row">
              <h3>Cleanup Logs</h3>
            </div>
            <p className="meta-line">Delete logs by retention window.</p>
            <div className="logs-cleanup-row">
              <label>
                Window
                <select
                  value={cleanupWindow}
                  onChange={(event) => setCleanupWindow(event.target.value as CallLogCleanupWindow)}
                  disabled={cleanupBusy}
                >
                  <option value="7d">Delete older than 7 days</option>
                  <option value="1m">Delete older than 1 month</option>
                  <option value="3m">Delete older than 3 months</option>
                  <option value="all">Delete all logs</option>
                </select>
              </label>
              <button type="button" onClick={() => void handleCleanup()} disabled={cleanupBusy || loading}>
                {cleanupBusy ? 'Cleaning...' : 'Run Cleanup'}
              </button>
            </div>
            {cleanupMessage ? <p className="meta-line">{cleanupMessage}</p> : null}
          </section>
        </ModalShell>
      ) : null}
    </section>
  );
}
