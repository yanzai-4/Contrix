import { create } from 'zustand';
import type { CallLogListQuery, CallLogListResponse } from '@contrix/runtime-core';
import { fetchCallLogs } from '../services/api';

interface LogsFilterState {
  project: string;
  endpoint: string;
  provider: string;
  success: 'all' | 'true' | 'false';
  dateFrom: string;
  dateTo: string;
}

interface LogsStoreState {
  logsListState: CallLogListResponse | null;
  logsFilterState: LogsFilterState;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setFilter: <K extends keyof LogsFilterState>(key: K, value: LogsFilterState[K]) => void;
  resetFilters: () => void;
}

const defaultFilters: LogsFilterState = {
  project: '',
  endpoint: '',
  provider: '',
  success: 'all',
  dateFrom: '',
  dateTo: ''
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load call logs';
}

function buildQuery(page: number, pageSize: number, filters: LogsFilterState): CallLogListQuery {
  return {
    project: filters.project.trim() || undefined,
    endpoint: filters.endpoint.trim() || undefined,
    provider: filters.provider.trim() || undefined,
    success:
      filters.success === 'all'
        ? undefined
        : filters.success === 'true'
          ? true
          : false,
    dateFrom: filters.dateFrom.trim() || undefined,
    dateTo: filters.dateTo.trim() || undefined,
    page,
    pageSize
  };
}

export const useLogsStore = create<LogsStoreState>((set, get) => ({
  logsListState: null,
  logsFilterState: { ...defaultFilters },
  page: 1,
  pageSize: 20,
  loading: false,
  error: null,
  refresh: async () => {
    const { page, pageSize, logsFilterState } = get();

    set({ loading: true, error: null });

    try {
      const response = await fetchCallLogs(buildQuery(page, pageSize, logsFilterState));
      set({
        logsListState: response,
        loading: false
      });
    } catch (error) {
      set({
        loading: false,
        error: toErrorMessage(error)
      });
    }
  },
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  setFilter: (key, value) =>
    set((state) => ({
      logsFilterState: {
        ...state.logsFilterState,
        [key]: value
      },
      page: 1
    })),
  resetFilters: () =>
    set({
      logsFilterState: { ...defaultFilters },
      page: 1
    })
}));
