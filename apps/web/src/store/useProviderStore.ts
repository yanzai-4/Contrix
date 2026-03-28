import { create } from 'zustand';
import type {
  CreateProviderRequest,
  ProviderConnectionTestResponse,
  ProviderSummary,
  UpdateProviderRequest
} from '@contrix/spec-core';
import {
  createProvider,
  deleteProvider,
  fetchProviders,
  testProvider,
  updateProvider as apiUpdateProvider
} from '../services/api';

interface ProviderStoreState {
  providers: ProviderSummary[];
  editingProviderId: string | null;
  listLoading: boolean;
  submitLoading: boolean;
  listError: string | null;
  formError: string | null;
  testingById: Record<string, boolean>;
  deletingById: Record<string, boolean>;
  testResultsById: Record<string, ProviderConnectionTestResponse>;
  loadProviders: () => Promise<void>;
  startEditingProvider: (providerId: string) => void;
  cancelEditingProvider: () => void;
  createProvider: (payload: CreateProviderRequest) => Promise<boolean>;
  updateProvider: (providerId: string, payload: UpdateProviderRequest) => Promise<boolean>;
  deleteProvider: (providerId: string) => Promise<void>;
  testProvider: (providerId: string) => Promise<void>;
  clearFormError: () => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected provider operation error';
}

export const useProviderStore = create<ProviderStoreState>((set, get) => ({
  providers: [],
  editingProviderId: null,
  listLoading: false,
  submitLoading: false,
  listError: null,
  formError: null,
  testingById: {},
  deletingById: {},
  testResultsById: {},
  loadProviders: async () => {
    set({ listLoading: true, listError: null });

    try {
      const { providers } = await fetchProviders();
      set((state) => {
        const stillExists = state.editingProviderId
          ? providers.some((provider) => provider.id === state.editingProviderId)
          : true;

        return {
          providers,
          listLoading: false,
          editingProviderId: stillExists ? state.editingProviderId : null
        };
      });
    } catch (error) {
      set({ listLoading: false, listError: toErrorMessage(error) });
    }
  },
  startEditingProvider: (providerId) => {
    set({ editingProviderId: providerId, formError: null });
  },
  cancelEditingProvider: () => {
    set({ editingProviderId: null, formError: null });
  },
  createProvider: async (payload) => {
    set({ submitLoading: true, formError: null });

    try {
      const created = await createProvider(payload);
      set({ submitLoading: false, formError: null, editingProviderId: null });
      await get().loadProviders();
      await get().testProvider(created.provider.id);
      return true;
    } catch (error) {
      set({ submitLoading: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  updateProvider: async (providerId, payload) => {
    set({ submitLoading: true, formError: null });

    try {
      const updated = await apiUpdateProvider(providerId, payload);
      set({ submitLoading: false, formError: null, editingProviderId: null });
      await get().loadProviders();
      await get().testProvider(updated.provider.id);
      return true;
    } catch (error) {
      set({ submitLoading: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  deleteProvider: async (providerId) => {
    set((state) => ({
      deletingById: {
        ...state.deletingById,
        [providerId]: true
      },
      listError: null
    }));

    try {
      await deleteProvider(providerId);
      await get().loadProviders();
    } catch (error) {
      set({ listError: toErrorMessage(error) });
    } finally {
      set((state) => {
        const next = { ...state.deletingById };
        delete next[providerId];

        return {
          deletingById: next,
          editingProviderId: state.editingProviderId === providerId ? null : state.editingProviderId
        };
      });
    }
  },
  testProvider: async (providerId) => {
    set((state) => ({
      testingById: {
        ...state.testingById,
        [providerId]: true
      }
    }));

    try {
      const result = await testProvider(providerId);
      set((state) => ({
        testResultsById: {
          ...state.testResultsById,
          [providerId]: result
        }
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      set((state) => ({
        testResultsById: {
          ...state.testResultsById,
          [providerId]: {
            success: false,
            message,
            latencyMs: 0,
            providerId,
            testedAt: new Date().toISOString()
          }
        }
      }));
    } finally {
      set((state) => {
        const next = { ...state.testingById };
        delete next[providerId];
        return { testingById: next };
      });
    }
  },
  clearFormError: () => {
    set({ formError: null });
  }
}));
