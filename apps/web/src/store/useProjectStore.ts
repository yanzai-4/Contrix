import { create } from 'zustand';
import type {
  CreateEndpointRequest,
  CreateGroupRequest,
  CreateProjectRequest,
  ProjectDetailResponse,
  ProjectSummary,
  ProviderSummary,
  SpecStatus,
  UpdateEndpointRequest,
  UpdateGroupRequest,
  UpdateProjectRequest
} from '@contrix/spec-core';
import {
  createEndpoint as apiCreateEndpoint,
  createGroup as apiCreateGroup,
  createProject as apiCreateProject,
  deleteEndpoint as apiDeleteEndpoint,
  deleteGroup as apiDeleteGroup,
  deleteProject as apiDeleteProject,
  fetchProjectDetail,
  fetchProjects,
  fetchProviders,
  updateEndpoint as apiUpdateEndpoint,
  updateGroup as apiUpdateGroup,
  updateProject as apiUpdateProject
} from '../services/api';

type SpecStatusFilter = SpecStatus | 'all';

interface ProjectStoreState {
  projects: ProjectSummary[];
  providerOptions: ProviderSummary[];
  selectedProjectId: string | null;
  selectedProjectDetail: ProjectDetailResponse | null;
  editingProjectId: string | null;
  editingGroupId: string | null;
  editingEndpointId: string | null;
  specStatusFilter: SpecStatusFilter;
  projectsLoading: boolean;
  detailLoading: boolean;
  projectSubmitting: boolean;
  groupSubmitting: boolean;
  endpointSubmitting: boolean;
  deletingProjectById: Record<string, boolean>;
  deletingGroupById: Record<string, boolean>;
  deletingEndpointById: Record<string, boolean>;
  listError: string | null;
  detailError: string | null;
  formError: string | null;
  initialize: () => Promise<void>;
  loadProjects: () => Promise<void>;
  loadProviderOptions: () => Promise<void>;
  reloadSelectedProject: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  clearSelectedProject: () => void;
  startEditingProject: (projectId: string) => void;
  cancelEditingProject: () => void;
  startEditingGroup: (groupId: string) => void;
  cancelEditingGroup: () => void;
  startEditingEndpoint: (endpointId: string) => void;
  cancelEditingEndpoint: () => void;
  setSpecStatusFilter: (filter: SpecStatusFilter) => void;
  createProject: (payload: CreateProjectRequest) => Promise<boolean>;
  updateProject: (projectId: string, payload: UpdateProjectRequest) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<void>;
  createGroup: (payload: Omit<CreateGroupRequest, 'projectId'>) => Promise<boolean>;
  updateGroup: (groupId: string, payload: UpdateGroupRequest) => Promise<boolean>;
  deleteGroup: (groupId: string) => Promise<void>;
  createEndpoint: (payload: Omit<CreateEndpointRequest, 'projectId'>) => Promise<boolean>;
  updateEndpoint: (endpointId: string, payload: UpdateEndpointRequest) => Promise<boolean>;
  deleteEndpoint: (endpointId: string) => Promise<void>;
  clearFormError: () => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected project management error';
}

async function loadProjectDetailById(
  projectId: string,
  set: (partial: Partial<ProjectStoreState>) => void
) {
  set({ detailLoading: true, detailError: null });

  try {
    const detail = await fetchProjectDetail(projectId);
    set({ selectedProjectId: projectId, selectedProjectDetail: detail, detailLoading: false });
  } catch (error) {
    set({
      detailLoading: false,
      detailError: toErrorMessage(error),
      selectedProjectDetail: null,
      selectedProjectId: null,
      editingGroupId: null,
      editingEndpointId: null
    });
  }
}

async function reloadCurrentProjectDetail(
  set: (partial: Partial<ProjectStoreState>) => void,
  get: () => ProjectStoreState
): Promise<void> {
  const projectId = get().selectedProjectId;

  if (!projectId) {
    return;
  }

  await loadProjectDetailById(projectId, set);
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  providerOptions: [],
  selectedProjectId: null,
  selectedProjectDetail: null,
  editingProjectId: null,
  editingGroupId: null,
  editingEndpointId: null,
  specStatusFilter: 'all',
  projectsLoading: false,
  detailLoading: false,
  projectSubmitting: false,
  groupSubmitting: false,
  endpointSubmitting: false,
  deletingProjectById: {},
  deletingGroupById: {},
  deletingEndpointById: {},
  listError: null,
  detailError: null,
  formError: null,
  initialize: async () => {
    await Promise.all([get().loadProjects(), get().loadProviderOptions()]);
  },
  loadProjects: async () => {
    set({ projectsLoading: true, listError: null });

    try {
      const { projects } = await fetchProjects();
      set((state) => {
        const stillExists = state.selectedProjectId
          ? projects.some((project) => project.id === state.selectedProjectId)
          : true;

        return {
          projects,
          projectsLoading: false,
          selectedProjectId: stillExists ? state.selectedProjectId : null,
          selectedProjectDetail: stillExists ? state.selectedProjectDetail : null,
          editingProjectId:
            state.editingProjectId && projects.some((project) => project.id === state.editingProjectId)
              ? state.editingProjectId
              : null
        };
      });
    } catch (error) {
      set({ projectsLoading: false, listError: toErrorMessage(error) });
    }
  },
  loadProviderOptions: async () => {
    try {
      const { providers } = await fetchProviders();
      set({ providerOptions: providers });
    } catch {
      set({ providerOptions: [] });
    }
  },
  reloadSelectedProject: async () => {
    await reloadCurrentProjectDetail(set, get);
  },
  selectProject: async (projectId) => {
    set({ editingGroupId: null, editingEndpointId: null });
    await loadProjectDetailById(projectId, set);
  },
  clearSelectedProject: () => {
    set({
      selectedProjectId: null,
      selectedProjectDetail: null,
      detailError: null,
      editingGroupId: null,
      editingEndpointId: null
    });
  },
  startEditingProject: (projectId) => {
    set({ editingProjectId: projectId, formError: null });
  },
  cancelEditingProject: () => {
    set({ editingProjectId: null, formError: null });
  },
  startEditingGroup: (groupId) => {
    set({ editingGroupId: groupId, formError: null });
  },
  cancelEditingGroup: () => {
    set({ editingGroupId: null, formError: null });
  },
  startEditingEndpoint: (endpointId) => {
    set({ editingEndpointId: endpointId, formError: null });
  },
  cancelEditingEndpoint: () => {
    set({ editingEndpointId: null, formError: null });
  },
  setSpecStatusFilter: (filter) => {
    set({ specStatusFilter: filter });
  },
  createProject: async (payload) => {
    set({ projectSubmitting: true, formError: null });

    try {
      const { project } = await apiCreateProject(payload);
      set({ projectSubmitting: false, editingProjectId: null });
      await Promise.all([get().loadProjects(), get().loadProviderOptions()]);
      await loadProjectDetailById(project.id, set);
      return true;
    } catch (error) {
      set({ projectSubmitting: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  updateProject: async (projectId, payload) => {
    set({ projectSubmitting: true, formError: null });

    try {
      await apiUpdateProject(projectId, payload);
      set({ projectSubmitting: false, editingProjectId: null });
      await Promise.all([get().loadProjects(), get().loadProviderOptions()]);

      if (get().selectedProjectId === projectId) {
        await loadProjectDetailById(projectId, set);
      }

      return true;
    } catch (error) {
      set({ projectSubmitting: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  deleteProject: async (projectId) => {
    set((state) => ({
      deletingProjectById: {
        ...state.deletingProjectById,
        [projectId]: true
      },
      listError: null
    }));

    try {
      await apiDeleteProject(projectId);
      await get().loadProjects();

      const currentSelectedId = get().selectedProjectId;
      if (currentSelectedId === projectId) {
        set({
          selectedProjectId: null,
          selectedProjectDetail: null,
          detailError: null,
          editingGroupId: null,
          editingEndpointId: null
        });
      }

      if (get().editingProjectId === projectId) {
        set({ editingProjectId: null });
      }
    } catch (error) {
      set({ listError: toErrorMessage(error) });
    } finally {
      set((state) => {
        const next = { ...state.deletingProjectById };
        delete next[projectId];
        return { deletingProjectById: next };
      });
    }
  },
  createGroup: async (payload) => {
    const projectId = get().selectedProjectId;

    if (!projectId) {
      set({ formError: 'Select a project first.' });
      return false;
    }

    set({ groupSubmitting: true, formError: null });

    try {
      await apiCreateGroup({ ...payload, projectId });
      set({ groupSubmitting: false, editingGroupId: null });
      await reloadCurrentProjectDetail(set, get);
      return true;
    } catch (error) {
      set({ groupSubmitting: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  updateGroup: async (groupId, payload) => {
    const projectId = get().selectedProjectId;

    if (!projectId) {
      set({ formError: 'Select a project first.' });
      return false;
    }

    set({ groupSubmitting: true, formError: null });

    try {
      await apiUpdateGroup(groupId, payload);
      set({ groupSubmitting: false, editingGroupId: null });
      await reloadCurrentProjectDetail(set, get);
      return true;
    } catch (error) {
      set({ groupSubmitting: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  deleteGroup: async (groupId) => {
    set((state) => ({
      deletingGroupById: {
        ...state.deletingGroupById,
        [groupId]: true
      },
      detailError: null
    }));

    try {
      await apiDeleteGroup(groupId);
      await reloadCurrentProjectDetail(set, get);

      if (get().editingGroupId === groupId) {
        set({ editingGroupId: null });
      }
    } catch (error) {
      set({ detailError: toErrorMessage(error) });
    } finally {
      set((state) => {
        const next = { ...state.deletingGroupById };
        delete next[groupId];
        return { deletingGroupById: next };
      });
    }
  },
  createEndpoint: async (payload) => {
    const projectId = get().selectedProjectId;

    if (!projectId) {
      set({ formError: 'Select a project first.' });
      return false;
    }

    set({ endpointSubmitting: true, formError: null });

    try {
      await apiCreateEndpoint({ ...payload, projectId });
      set({ endpointSubmitting: false, editingEndpointId: null });
      await reloadCurrentProjectDetail(set, get);
      return true;
    } catch (error) {
      set({ endpointSubmitting: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  updateEndpoint: async (endpointId, payload) => {
    set({ endpointSubmitting: true, formError: null });

    try {
      await apiUpdateEndpoint(endpointId, payload);
      set({ endpointSubmitting: false, editingEndpointId: null });
      await reloadCurrentProjectDetail(set, get);
      return true;
    } catch (error) {
      set({ endpointSubmitting: false, formError: toErrorMessage(error) });
      return false;
    }
  },
  deleteEndpoint: async (endpointId) => {
    set((state) => ({
      deletingEndpointById: {
        ...state.deletingEndpointById,
        [endpointId]: true
      },
      detailError: null
    }));

    try {
      await apiDeleteEndpoint(endpointId);
      await reloadCurrentProjectDetail(set, get);

      if (get().editingEndpointId === endpointId) {
        set({ editingEndpointId: null });
      }
    } catch (error) {
      set({ detailError: toErrorMessage(error) });
    } finally {
      set((state) => {
        const next = { ...state.deletingEndpointById };
        delete next[endpointId];
        return { deletingEndpointById: next };
      });
    }
  },
  clearFormError: () => {
    set({ formError: null });
  }
}));
