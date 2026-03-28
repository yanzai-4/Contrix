import { randomUUID } from 'node:crypto';
import type {
  EndpointSchemaDocument,
  EndpointSummary,
  SaveEndpointSchemaRequest,
  SpecStatus
} from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import { EndpointAutoSyncService } from './auto-sync-service.js';
import { GroupRepository } from '../group/repository.js';
import { ProviderRegistry } from '../provider/registry.js';
import type { EndpointCreatePayload, EndpointUpdatePayload } from './model.js';
import { EndpointRepository } from './repository.js';
import {
  normalizeInputMode,
  normalizeInputSchemaForMode,
  normalizeOutputSchema,
  parseStoredInputSchema,
  parseStoredOutputSchema
} from './schema-utils.js';

const MAX_TIMEOUT_MS = 120000;
const MAX_RETRY_ROUNDS = 10;
const DEFAULT_MAX_API_RETRIES = 3;

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function normalizePathSlug(rawPathSlug: string): string {
  const normalized = rawPathSlug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9/-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!normalized) {
    throw new ModuleError('INVALID_PATH_SLUG', 400, 'pathSlug is required.');
  }

  return normalized;
}

function normalizeTimeout(timeoutMs: number | null | undefined): number | null {
  if (timeoutMs === undefined || timeoutMs === null) {
    return null;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ModuleError('INVALID_TIMEOUT', 400, 'timeoutMs must be a positive number.');
  }

  if (timeoutMs > MAX_TIMEOUT_MS) {
    throw new ModuleError('INVALID_TIMEOUT', 400, `timeoutMs must be less than or equal to ${MAX_TIMEOUT_MS}.`);
  }

  return Math.floor(timeoutMs);
}

function normalizeNonNegativeInteger(
  value: number | null | undefined,
  fallback: number,
  fieldName: string
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new ModuleError('INVALID_RUNTIME_OPTION', 400, `${fieldName} must be a non-negative integer.`);
  }

  if (value > MAX_RETRY_ROUNDS) {
    throw new ModuleError('INVALID_RUNTIME_OPTION', 400, `${fieldName} must be <= ${MAX_RETRY_ROUNDS}.`);
  }

  return value;
}

function normalizeTemperature(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new ModuleError('INVALID_RUNTIME_OPTION', 400, 'temperature must be between 0 and 2.');
  }

  return value;
}

function normalizeTopP(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new ModuleError('INVALID_RUNTIME_OPTION', 400, 'topP must be > 0 and <= 1.');
  }

  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }

  const message = String((error as { message: unknown }).message);

  return message.includes('idx_endpoints_project_slug_unique') || message.includes('endpoints.project_id');
}

export class EndpointService {
  private readonly endpointRepository: EndpointRepository;
  private readonly groupRepository: GroupRepository;
  private readonly providerRegistry: ProviderRegistry;
  private readonly endpointAutoSyncService: EndpointAutoSyncService;

  constructor(private readonly db: SQLiteDatabase) {
    this.endpointRepository = new EndpointRepository(db);
    this.groupRepository = new GroupRepository(db);
    this.providerRegistry = new ProviderRegistry(db);
    this.endpointAutoSyncService = new EndpointAutoSyncService(db);
  }

  listEndpoints(projectId?: string, groupId?: string): EndpointSummary[] {
    const filters: { projectId?: string; groupId?: string } = {};

    if (projectId?.trim()) {
      filters.projectId = projectId.trim();
    }

    if (groupId?.trim()) {
      filters.groupId = groupId.trim();
    }

    return this.endpointRepository.list(filters).map((endpoint) => this.hydrateProviderName(endpoint));
  }

  getEndpointById(id: string): EndpointSummary {
    const endpoint = this.endpointRepository.findById(id);

    if (!endpoint) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    return this.hydrateProviderName(endpoint);
  }

  createEndpoint(payload: EndpointCreatePayload): EndpointSummary {
    const projectId = payload.projectId?.trim();
    if (!projectId) {
      throw new ModuleError('PROJECT_ID_REQUIRED', 400, 'projectId is required.');
    }

    if (!this.projectExists(projectId)) {
      throw new ModuleError('PROJECT_NOT_FOUND', 400, 'projectId does not match an existing project.');
    }

    const providerId = payload.providerId?.trim();
    if (!providerId) {
      throw new ModuleError('PROVIDER_ID_REQUIRED', 400, 'providerId is required.');
    }

    if (!this.providerExists(providerId)) {
      throw new ModuleError('PROVIDER_NOT_FOUND', 400, 'providerId does not match an existing provider.');
    }

    const name = payload.name?.trim();
    if (!name) {
      throw new ModuleError('INVALID_ENDPOINT_NAME', 400, 'Endpoint name is required.');
    }

    const pathSlug = normalizePathSlug(payload.pathSlug);

    if (this.endpointRepository.findByProjectAndSlug(projectId, pathSlug)) {
      throw new ModuleError(
        'PATH_SLUG_EXISTS',
        409,
        'An endpoint with this pathSlug already exists in the selected project.'
      );
    }

    const groupId = normalizeText(payload.groupId);
    if (groupId) {
      this.ensureGroupBelongsToProject(groupId, projectId);
    }

    const now = new Date().toISOString();

    try {
      const created = this.endpointRepository.create({
        id: randomUUID(),
        projectId,
        groupId,
        providerId,
        name,
        pathSlug,
        model: normalizeText(payload.model),
        endpointInstruction: normalizeText(payload.endpointInstruction),
        description: normalizeText(payload.description),
        rules: normalizeText(payload.rules),
        examples: normalizeText(payload.examples),
        tone: normalizeText(payload.tone),
        fallback: normalizeText(payload.fallback),
        validation: normalizeText(payload.validation),
        timeoutMs: normalizeTimeout(payload.timeoutMs),
        enableStructuredOutput: Boolean(payload.enableStructuredOutput),
        enableDeterministicRepair: Boolean(payload.enableDeterministicRepair),
        maxApiRetries: normalizeNonNegativeInteger(payload.maxApiRetries, DEFAULT_MAX_API_RETRIES, 'maxApiRetries'),
        maxRepairRounds: normalizeNonNegativeInteger(payload.maxRepairRounds, 0, 'maxRepairRounds'),
        temperature: normalizeTemperature(payload.temperature),
        topP: normalizeTopP(payload.topP),
        specStatus: 'missing',
        createdAt: now,
        updatedAt: now
      });

      return this.hydrateProviderName(created);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ModuleError(
          'PATH_SLUG_EXISTS',
          409,
          'An endpoint with this pathSlug already exists in the selected project.'
        );
      }

      throw error;
    }
  }

  updateEndpoint(id: string, payload: EndpointUpdatePayload): EndpointSummary {
    const existing = this.endpointRepository.findById(id);

    if (!existing) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    const providerId = payload.providerId?.trim();
    if (!providerId) {
      throw new ModuleError('PROVIDER_ID_REQUIRED', 400, 'providerId is required.');
    }

    if (!this.providerExists(providerId)) {
      throw new ModuleError('PROVIDER_NOT_FOUND', 400, 'providerId does not match an existing provider.');
    }

    const name = payload.name?.trim();
    if (!name) {
      throw new ModuleError('INVALID_ENDPOINT_NAME', 400, 'Endpoint name is required.');
    }

    const pathSlug = normalizePathSlug(payload.pathSlug);
    const conflict = this.endpointRepository.findByProjectAndSlug(existing.projectId, pathSlug);
    if (conflict && conflict.id !== id) {
      throw new ModuleError(
        'PATH_SLUG_EXISTS',
        409,
        'An endpoint with this pathSlug already exists in the selected project.'
      );
    }

    const groupId = normalizeText(payload.groupId);
    if (groupId) {
      this.ensureGroupBelongsToProject(groupId, existing.projectId);
    }

    const now = new Date().toISOString();
    const updated = this.endpointRepository.update({
      id,
      groupId,
      providerId,
      name,
      pathSlug,
      model: normalizeText(payload.model),
      endpointInstruction: normalizeText(payload.endpointInstruction),
      description: normalizeText(payload.description),
      rules: normalizeText(payload.rules),
      examples: normalizeText(payload.examples),
      tone: normalizeText(payload.tone),
      fallback: normalizeText(payload.fallback),
      validation: normalizeText(payload.validation),
      timeoutMs: normalizeTimeout(payload.timeoutMs),
      enableStructuredOutput: Boolean(payload.enableStructuredOutput),
      enableDeterministicRepair: Boolean(payload.enableDeterministicRepair),
      maxApiRetries: normalizeNonNegativeInteger(payload.maxApiRetries, DEFAULT_MAX_API_RETRIES, 'maxApiRetries'),
      maxRepairRounds: normalizeNonNegativeInteger(payload.maxRepairRounds, 0, 'maxRepairRounds'),
      temperature: normalizeTemperature(payload.temperature),
      topP: normalizeTopP(payload.topP),
      specStatus: 'stale',
      updatedAt: now
    });

    if (!updated) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    this.endpointRepository.markSpecStatusByEndpointId(id, 'stale', 'endpoint_updated');
    this.endpointAutoSyncService.syncEndpoint(id);

    const refreshed = this.endpointRepository.findById(id);
    if (!refreshed) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    return this.hydrateProviderName(refreshed);
  }

  getEndpointSchema(id: string): EndpointSchemaDocument {
    const stored = this.endpointRepository.getSchemaByEndpointId(id);

    if (!stored) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    const inputMode = normalizeInputMode(stored.input_mode);
    const inputSchema = parseStoredInputSchema(inputMode, stored.input_schema);
    const outputSchema = parseStoredOutputSchema(stored.output_schema);

    return {
      endpointId: stored.endpoint_id,
      inputMode,
      inputSchema,
      outputSchema,
      schemaUpdatedAt: stored.schema_updated_at
    };
  }

  saveEndpointSchema(id: string, payload: SaveEndpointSchemaRequest): EndpointSchemaDocument {
    const existing = this.endpointRepository.findById(id);

    if (!existing) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    const inputMode = normalizeInputMode(payload.inputMode);
    const inputSchema = normalizeInputSchemaForMode(inputMode, payload.inputSchema);
    const outputSchema = normalizeOutputSchema(payload.outputSchema);
    const now = new Date().toISOString();

    const updated = this.endpointRepository.updateSchema({
      id,
      inputMode,
      inputSchema: inputSchema === null ? null : JSON.stringify(inputSchema),
      outputSchema: JSON.stringify(outputSchema),
      schemaUpdatedAt: now,
      specStatus: 'stale'
    });

    if (!updated) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }

    this.endpointRepository.markSpecStatusByEndpointId(id, 'stale', 'schema_updated');
    this.endpointAutoSyncService.syncEndpoint(id);
    return this.getEndpointSchema(id);
  }

  markEndpointsStaleByProjectId(projectId: string): void {
    this.endpointRepository.markSpecStatusByProjectId(projectId, 'stale', 'project_updated');
  }

  markEndpointsStaleByGroupId(groupId: string): void {
    this.endpointRepository.markSpecStatusByGroupId(groupId, 'stale', 'group_updated');
  }

  markEndpointSpecStatus(endpointId: string, status: SpecStatus): void {
    this.endpointRepository.markSpecStatusByEndpointId(endpointId, status);
  }

  deleteEndpoint(id: string): void {
    const deleted = this.endpointRepository.deleteById(id);

    if (!deleted) {
      throw new ModuleError('ENDPOINT_NOT_FOUND', 404, 'Endpoint not found.');
    }
  }

  private ensureGroupBelongsToProject(groupId: string, projectId: string): void {
    const group = this.groupRepository.findById(groupId);

    if (!group) {
      throw new ModuleError('GROUP_NOT_FOUND', 400, 'groupId does not match an existing group.');
    }

    if (group.projectId !== projectId) {
      throw new ModuleError('GROUP_PROJECT_MISMATCH', 400, 'groupId must belong to the same project.');
    }
  }

  private projectExists(projectId: string): boolean {
    const row = this.db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(projectId);
    return Boolean(row);
  }

  private providerExists(providerId: string): boolean {
    return this.providerRegistry.hasProvider(providerId);
  }

  private hydrateProviderName(endpoint: EndpointSummary): EndpointSummary {
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
