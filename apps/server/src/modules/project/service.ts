import { randomUUID } from 'node:crypto';
import type { EndpointSummary, GroupSummary, ProjectDetailResponse, ProjectSummary } from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import { EndpointAutoSyncService } from '../endpoint/auto-sync-service.js';
import { EndpointRepository } from '../endpoint/repository.js';
import { GroupRepository } from '../group/repository.js';
import { ProviderRegistry } from '../provider/registry.js';
import type { ProjectCreatePayload, ProjectUpdatePayload } from './model.js';
import { ProjectRepository } from './repository.js';

const API_NAMESPACE_PATTERN = /^[a-z0-9-]+$/;

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function normalizeNamespace(rawNamespace: string): string {
  const normalized = rawNamespace
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) {
    throw new ModuleError('INVALID_NAMESPACE', 400, 'apiNamespace is required.');
  }

  if (!API_NAMESPACE_PATTERN.test(normalized)) {
    throw new ModuleError('INVALID_NAMESPACE', 400, 'apiNamespace contains invalid characters.');
  }

  return normalized;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }

  const message = String((error as { message: unknown }).message);

  return (
    message.includes('idx_projects_name_unique') ||
    message.includes('idx_projects_api_namespace_unique') ||
    message.includes('projects.name') ||
    message.includes('projects.api_namespace')
  );
}

export class ProjectService {
  private readonly projectRepository: ProjectRepository;
  private readonly groupRepository: GroupRepository;
  private readonly endpointRepository: EndpointRepository;
  private readonly endpointAutoSyncService: EndpointAutoSyncService;
  private readonly providerRegistry: ProviderRegistry;

  constructor(db: SQLiteDatabase) {
    this.projectRepository = new ProjectRepository(db);
    this.groupRepository = new GroupRepository(db);
    this.endpointRepository = new EndpointRepository(db);
    this.endpointAutoSyncService = new EndpointAutoSyncService(db);
    this.providerRegistry = new ProviderRegistry(db);
  }

  listProjects(): ProjectSummary[] {
    return this.projectRepository.list().map((project) => this.hydrateProjectProvider(project));
  }

  getProjectDetail(id: string): ProjectDetailResponse {
    const project = this.projectRepository.findById(id);

    if (!project) {
      throw new ModuleError('PROJECT_NOT_FOUND', 404, 'Project not found.');
    }

    const groups = this.groupRepository.list({ projectId: id });
    const endpoints = this.endpointRepository
      .list({ projectId: id })
      .map((endpoint) => this.hydrateEndpointProvider(endpoint));

    return {
      project: this.hydrateProjectProvider(project),
      groups: groups as GroupSummary[],
      endpoints: endpoints as EndpointSummary[]
    };
  }

  createProject(payload: ProjectCreatePayload): ProjectSummary {
    const name = payload.name?.trim();

    if (!name) {
      throw new ModuleError('INVALID_PROJECT_NAME', 400, 'Project name is required.');
    }

    const apiNamespace = normalizeNamespace(payload.apiNamespace);
    const description = normalizeText(payload.description);
    const baseInstruction = normalizeText(payload.baseInstruction);
    const defaultProviderId = normalizeText(payload.defaultProviderId);

    if (this.projectRepository.findByName(name)) {
      throw new ModuleError('PROJECT_NAME_EXISTS', 409, 'A project with this name already exists.');
    }

    if (this.projectRepository.findByApiNamespace(apiNamespace)) {
      throw new ModuleError('PROJECT_NAMESPACE_EXISTS', 409, 'This apiNamespace is already in use.');
    }

    if (defaultProviderId && !this.providerExists(defaultProviderId)) {
      throw new ModuleError('PROVIDER_NOT_FOUND', 400, 'defaultProviderId does not match an existing provider.');
    }

    const now = new Date().toISOString();

    try {
      return this.projectRepository.create({
        id: randomUUID(),
        name,
        description,
        baseInstruction,
        defaultProviderId,
        apiNamespace,
        createdAt: now,
        updatedAt: now
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ModuleError('PROJECT_CONFLICT', 409, 'Project name or apiNamespace already exists.');
      }

      throw error;
    }
  }

  updateProject(id: string, payload: ProjectUpdatePayload): ProjectSummary {
    const existing = this.projectRepository.findById(id);

    if (!existing) {
      throw new ModuleError('PROJECT_NOT_FOUND', 404, 'Project not found.');
    }

    const name = payload.name?.trim();
    if (!name) {
      throw new ModuleError('INVALID_PROJECT_NAME', 400, 'Project name is required.');
    }

    const apiNamespace = normalizeNamespace(payload.apiNamespace);
    const description = normalizeText(payload.description);
    const baseInstruction = normalizeText(payload.baseInstruction);
    const defaultProviderId = normalizeText(payload.defaultProviderId);

    const byName = this.projectRepository.findByName(name);
    if (byName && byName.id !== id) {
      throw new ModuleError('PROJECT_NAME_EXISTS', 409, 'A project with this name already exists.');
    }

    const byNamespace = this.projectRepository.findByApiNamespace(apiNamespace);
    if (byNamespace && byNamespace.id !== id) {
      throw new ModuleError('PROJECT_NAMESPACE_EXISTS', 409, 'This apiNamespace is already in use.');
    }

    if (defaultProviderId && !this.providerExists(defaultProviderId)) {
      throw new ModuleError('PROVIDER_NOT_FOUND', 400, 'defaultProviderId does not match an existing provider.');
    }

    const updated = this.projectRepository.update({
      id,
      name,
      description,
      baseInstruction,
      defaultProviderId,
      apiNamespace,
      updatedAt: new Date().toISOString()
    });

    if (!updated) {
      throw new ModuleError('PROJECT_NOT_FOUND', 404, 'Project not found.');
    }

    this.endpointRepository.markSpecStatusByProjectId(id, 'stale', 'project_updated');
    this.endpointAutoSyncService.syncByProjectId(id);
    return updated;
  }

  deleteProject(id: string): void {
    const deleted = this.projectRepository.deleteById(id);

    if (!deleted) {
      throw new ModuleError('PROJECT_NOT_FOUND', 404, 'Project not found.');
    }
  }

  private providerExists(providerId: string): boolean {
    return this.providerRegistry.hasProvider(providerId);
  }

  private hydrateProjectProvider(project: ProjectSummary): ProjectSummary {
    if (!project.defaultProviderId || project.defaultProviderName) {
      return project;
    }

    const provider = this.providerRegistry.getSummary(project.defaultProviderId);
    if (!provider) {
      return project;
    }

    return {
      ...project,
      defaultProviderName: provider.name
    };
  }

  private hydrateEndpointProvider(endpoint: EndpointSummary): EndpointSummary {
    if (!endpoint.providerId || endpoint.providerName) {
      return endpoint;
    }

    const provider = this.providerRegistry.getSummary(endpoint.providerId);
    if (!provider) {
      return endpoint;
    }

    return {
      ...endpoint,
      providerName: provider.name
    };
  }
}
