import {
  type ApiErrorResponse,
  type CreateEndpointRequest,
  type CreateGroupRequest,
  type CreateProjectRequest,
  type CreateProviderRequest,
  type EndpointDeleteResponse,
  type EndpointItemResponse,
  type EndpointListResponse,
  type EndpointSpecCurrentResponse,
  type EndpointSchemaItemResponse,
  type EndpointSpecRegenerateResponse,
  type PromptPreviewResponse,
  type GroupDeleteResponse,
  type GroupItemResponse,
  type ProjectDeleteResponse,
  type ProjectDetailResponse,
  type ProjectItemResponse,
  type ProjectListResponse,
  type ProviderConnectionTestResponse,
  type ProviderDeleteResponse,
  type ProviderItemResponse,
  type ProviderListResponse,
  type RuntimeSettingsResponse,
  type SaveEndpointSchemaRequest,
  type UpdateRuntimeSettingsRequest,
  type UpdateEndpointRequest,
  type UpdateGroupRequest,
  type UpdateProjectRequest,
  type UpdateProviderRequest
} from '@contrix/spec-core';
import type {
  CallLogCleanupRequest,
  CallLogCleanupResponse,
  CallLogItemResponse,
  CallLogListQuery,
  CallLogListResponse,
  MetricsBreakdownResponse,
  MetricsOverviewResponse,
  MetricsTimeseriesResponse,
  PromptCompileResponse,
  PromptStateResponse,
  RuntimePreflightResponse,
  RuntimeMetaResponse,
  RuntimeRequest,
  RuntimeRequestPreviewResponse,
  RuntimeResponse
} from '@contrix/runtime-core';
import { SERVER_BASE_URL } from '../config/server';

export interface HealthResponse {
  ok: boolean;
  server: 'up';
  database: 'initialized' | 'failed';
  timestamp: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SERVER_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const fallbackMessage = `Request failed with status ${response.status}`;
    let message = fallbackMessage;

    try {
      const data = (await response.json()) as ApiErrorResponse;
      message = data.error?.message ?? fallbackMessage;
    } catch {
      message = fallbackMessage;
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/health', { method: 'GET' });
}

export async function fetchProviders() {
  return requestJson<ProviderListResponse>('/providers', { method: 'GET' });
}

export async function createProvider(payload: CreateProviderRequest) {
  return requestJson<ProviderItemResponse>('/providers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function updateProvider(providerId: string, payload: UpdateProviderRequest) {
  return requestJson<ProviderItemResponse>(`/providers/${providerId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteProvider(providerId: string) {
  return requestJson<ProviderDeleteResponse>(`/providers/${providerId}`, {
    method: 'DELETE'
  });
}

export async function testProvider(providerId: string) {
  return requestJson<ProviderConnectionTestResponse>(`/providers/${providerId}/test`, {
    method: 'POST'
  });
}

export async function fetchProjects() {
  return requestJson<ProjectListResponse>('/projects', { method: 'GET' });
}

export async function fetchProjectDetail(projectId: string) {
  return requestJson<ProjectDetailResponse>(`/projects/${projectId}`, { method: 'GET' });
}

export async function createProject(payload: CreateProjectRequest) {
  return requestJson<ProjectItemResponse>('/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function updateProject(projectId: string, payload: UpdateProjectRequest) {
  return requestJson<ProjectItemResponse>(`/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteProject(projectId: string) {
  return requestJson<ProjectDeleteResponse>(`/projects/${projectId}`, {
    method: 'DELETE'
  });
}

export async function createGroup(payload: CreateGroupRequest) {
  return requestJson<GroupItemResponse>('/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function updateGroup(groupId: string, payload: UpdateGroupRequest) {
  return requestJson<GroupItemResponse>(`/groups/${groupId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteGroup(groupId: string) {
  return requestJson<GroupDeleteResponse>(`/groups/${groupId}`, {
    method: 'DELETE'
  });
}

export async function fetchEndpoints(params?: { projectId?: string; groupId?: string }) {
  const query = new URLSearchParams();

  if (params?.projectId) {
    query.set('projectId', params.projectId);
  }

  if (params?.groupId) {
    query.set('groupId', params.groupId);
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';

  return requestJson<EndpointListResponse>(`/endpoints${suffix}`, {
    method: 'GET'
  });
}

export async function createEndpoint(payload: CreateEndpointRequest) {
  return requestJson<EndpointItemResponse>('/endpoints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function updateEndpoint(endpointId: string, payload: UpdateEndpointRequest) {
  return requestJson<EndpointItemResponse>(`/endpoints/${endpointId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteEndpoint(endpointId: string) {
  return requestJson<EndpointDeleteResponse>(`/endpoints/${endpointId}`, {
    method: 'DELETE'
  });
}

export async function fetchEndpointSchema(endpointId: string) {
  return requestJson<EndpointSchemaItemResponse>(`/endpoints/${endpointId}/schema`, {
    method: 'GET'
  });
}

export async function saveEndpointSchema(endpointId: string, payload: SaveEndpointSchemaRequest) {
  return requestJson<EndpointSchemaItemResponse>(`/endpoints/${endpointId}/schema`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchEndpointSpecCurrent(endpointId: string) {
  return requestJson<EndpointSpecCurrentResponse>(`/endpoints/${endpointId}/spec`, {
    method: 'GET'
  });
}

export async function regenerateEndpointSpec(endpointId: string) {
  return requestJson<EndpointSpecRegenerateResponse>(`/endpoints/${endpointId}/spec/regenerate`, {
    method: 'POST'
  });
}

export async function fetchPromptPreview(endpointId: string) {
  return requestJson<PromptPreviewResponse>(`/prompt/${endpointId}/preview`, {
    method: 'GET'
  });
}

export async function fetchPromptState(endpointId: string) {
  return requestJson<PromptStateResponse>(`/endpoints/${endpointId}/prompt/state`, {
    method: 'GET'
  });
}

export async function compileEndpointPrompt(endpointId: string) {
  return requestJson<PromptCompileResponse>(`/endpoints/${endpointId}/prompt/compile`, {
    method: 'POST'
  });
}

export async function fetchRuntimeMeta(namespace: string, pathSlug: string) {
  return requestJson<RuntimeMetaResponse>(
    `/runtime/${encodeURIComponent(namespace)}/${encodeURIComponent(pathSlug)}/meta`,
    {
      method: 'GET'
    }
  );
}

export async function runRuntimeByEndpoint(endpointId: string, payload: RuntimeRequest) {
  return requestJson<RuntimeResponse>(`/runtime/by-endpoint/${encodeURIComponent(endpointId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchRuntimePreflightByEndpoint(endpointId: string) {
  return requestJson<RuntimePreflightResponse>(`/runtime/by-endpoint/${encodeURIComponent(endpointId)}/preflight`, {
    method: 'GET'
  });
}

export async function previewRuntimeRequestByEndpoint(endpointId: string, payload: RuntimeRequest) {
  return requestJson<RuntimeRequestPreviewResponse>(
    `/runtime/by-endpoint/${encodeURIComponent(endpointId)}/preview-request`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );
}

export async function fetchMetricsOverview() {
  return requestJson<MetricsOverviewResponse>('/metrics/overview', {
    method: 'GET'
  });
}

export async function fetchMetricsTimeseries(range = '7d') {
  const query = new URLSearchParams({
    range
  });

  return requestJson<MetricsTimeseriesResponse>(`/metrics/timeseries?${query.toString()}`, {
    method: 'GET'
  });
}

export async function fetchMetricsBreakdown(range?: string) {
  const query = new URLSearchParams();
  if (range) {
    query.set('range', range);
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';

  return requestJson<MetricsBreakdownResponse>(`/metrics/breakdown${suffix}`, {
    method: 'GET'
  });
}

export async function fetchCallLogs(query: CallLogListQuery = {}) {
  const search = new URLSearchParams();

  if (query.project) {
    search.set('project', query.project);
  }
  if (query.endpoint) {
    search.set('endpoint', query.endpoint);
  }
  if (query.provider) {
    search.set('provider', query.provider);
  }
  if (typeof query.success === 'boolean') {
    search.set('success', String(query.success));
  }
  if (query.dateFrom) {
    search.set('dateFrom', query.dateFrom);
  }
  if (query.dateTo) {
    search.set('dateTo', query.dateTo);
  }
  if (query.page) {
    search.set('page', String(query.page));
  }
  if (query.pageSize) {
    search.set('pageSize', String(query.pageSize));
  }

  const suffix = search.toString() ? `?${search.toString()}` : '';
  return requestJson<CallLogListResponse>(`/logs${suffix}`, {
    method: 'GET'
  });
}

export async function fetchCallLogDetail(logId: string) {
  return requestJson<CallLogItemResponse>(`/logs/${encodeURIComponent(logId)}`, {
    method: 'GET'
  });
}

export async function cleanupCallLogs(payload: CallLogCleanupRequest) {
  return requestJson<CallLogCleanupResponse>('/logs/cleanup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchRuntimeSettings() {
  return requestJson<RuntimeSettingsResponse>('/settings/runtime', {
    method: 'GET'
  });
}

export async function updateRuntimeSettings(payload: UpdateRuntimeSettingsRequest) {
  return requestJson<RuntimeSettingsResponse>('/settings/runtime', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}
