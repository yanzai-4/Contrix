import { create } from 'zustand';
import type { CallLogItemResponse } from '@contrix/runtime-core';
import { fetchCallLogDetail } from '../services/api';

interface ReplayStoreState {
  logDetailState: CallLogItemResponse | null;
  loadingState: boolean;
  error: string | null;
  loadLogDetail: (logId: string) => Promise<void>;
  clear: () => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load log detail';
}

export const useReplayStore = create<ReplayStoreState>((set) => ({
  logDetailState: null,
  loadingState: false,
  error: null,
  loadLogDetail: async (logId) => {
    set({
      loadingState: true,
      error: null
    });

    try {
      const detail = await fetchCallLogDetail(logId);
      set({
        logDetailState: detail,
        loadingState: false
      });
    } catch (error) {
      set({
        loadingState: false,
        error: toErrorMessage(error)
      });
    }
  },
  clear: () =>
    set({
      logDetailState: null,
      loadingState: false,
      error: null
    })
}));
