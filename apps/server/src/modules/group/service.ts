import { randomUUID } from 'node:crypto';
import type { GroupSummary } from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import { EndpointAutoSyncService } from '../endpoint/auto-sync-service.js';
import { EndpointRepository } from '../endpoint/repository.js';
import type { GroupCreatePayload, GroupUpdatePayload } from './model.js';
import { GroupRepository } from './repository.js';

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }

  const message = String((error as { message: unknown }).message);

  return message.includes('idx_groups_project_name_unique') || message.includes('groups.project_id');
}

export class GroupService {
  private readonly groupRepository: GroupRepository;
  private readonly endpointRepository: EndpointRepository;
  private readonly endpointAutoSyncService: EndpointAutoSyncService;

  constructor(private readonly db: SQLiteDatabase) {
    this.groupRepository = new GroupRepository(db);
    this.endpointRepository = new EndpointRepository(db);
    this.endpointAutoSyncService = new EndpointAutoSyncService(db);
  }

  listGroups(projectId?: string): GroupSummary[] {
    const filters = projectId ? { projectId } : {};
    return this.groupRepository.list(filters);
  }

  createGroup(payload: GroupCreatePayload): GroupSummary {
    const projectId = payload.projectId?.trim();
    if (!projectId) {
      throw new ModuleError('PROJECT_ID_REQUIRED', 400, 'projectId is required.');
    }

    if (!this.projectExists(projectId)) {
      throw new ModuleError('PROJECT_NOT_FOUND', 400, 'projectId does not match an existing project.');
    }

    const name = payload.name?.trim();
    if (!name) {
      throw new ModuleError('INVALID_GROUP_NAME', 400, 'Group name is required.');
    }

    if (this.groupRepository.findByProjectAndName(projectId, name)) {
      throw new ModuleError(
        'GROUP_NAME_EXISTS',
        409,
        'A group with this name already exists in the selected project.'
      );
    }

    const description = normalizeText(payload.description);
    const groupInstruction = normalizeText(payload.groupInstruction);
    const now = new Date().toISOString();

    try {
      return this.groupRepository.create({
        id: randomUUID(),
        projectId,
        name,
        description,
        groupInstruction,
        createdAt: now,
        updatedAt: now
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ModuleError(
          'GROUP_NAME_EXISTS',
          409,
          'A group with this name already exists in the selected project.'
        );
      }

      throw error;
    }
  }

  updateGroup(id: string, payload: GroupUpdatePayload): GroupSummary {
    const existing = this.groupRepository.findById(id);

    if (!existing) {
      throw new ModuleError('GROUP_NOT_FOUND', 404, 'Group not found.');
    }

    const name = payload.name?.trim();
    if (!name) {
      throw new ModuleError('INVALID_GROUP_NAME', 400, 'Group name is required.');
    }

    const conflict = this.groupRepository.findByProjectAndName(existing.projectId, name);
    if (conflict && conflict.id !== id) {
      throw new ModuleError(
        'GROUP_NAME_EXISTS',
        409,
        'A group with this name already exists in the selected project.'
      );
    }

    const updated = this.groupRepository.update({
      id,
      name,
      description: normalizeText(payload.description),
      groupInstruction: normalizeText(payload.groupInstruction),
      updatedAt: new Date().toISOString()
    });

    if (!updated) {
      throw new ModuleError('GROUP_NOT_FOUND', 404, 'Group not found.');
    }

    this.endpointRepository.markSpecStatusByGroupId(id, 'stale', 'group_updated');
    this.endpointAutoSyncService.syncByGroupId(id);
    return updated;
  }

  deleteGroup(id: string): void {
    const deleted = this.groupRepository.deleteById(id);

    if (!deleted) {
      throw new ModuleError('GROUP_NOT_FOUND', 404, 'Group not found.');
    }
  }

  private projectExists(projectId: string): boolean {
    const row = this.db.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').get(projectId);
    return Boolean(row);
  }
}
