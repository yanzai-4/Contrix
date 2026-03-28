import type { SQLiteDatabase } from '../../db/types.js';
import { PromptService } from '../prompt/service.js';
import { EndpointRepository } from './repository.js';

interface AutoSyncFailure {
  endpointId: string;
  message: string;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown sync error.';
}

export class EndpointAutoSyncService {
  private readonly endpointRepository: EndpointRepository;
  private readonly promptService: PromptService;

  constructor(db: SQLiteDatabase) {
    this.endpointRepository = new EndpointRepository(db);
    this.promptService = new PromptService(db);
  }

  syncEndpoint(endpointId: string): AutoSyncFailure | null {
    try {
      this.promptService.getPromptPreview(endpointId);
      return null;
    } catch (error) {
      return {
        endpointId,
        message: normalizeErrorMessage(error)
      };
    }
  }

  syncByProjectId(projectId: string): AutoSyncFailure[] {
    const endpointIds = this.endpointRepository.list({ projectId }).map((endpoint) => endpoint.id);
    return this.syncEndpoints(endpointIds);
  }

  syncByGroupId(groupId: string): AutoSyncFailure[] {
    const endpointIds = this.endpointRepository.list({ groupId }).map((endpoint) => endpoint.id);
    return this.syncEndpoints(endpointIds);
  }

  syncEndpoints(endpointIds: string[]): AutoSyncFailure[] {
    const uniqueIds = Array.from(new Set(endpointIds));
    const failures: AutoSyncFailure[] = [];

    for (const endpointId of uniqueIds) {
      const failure = this.syncEndpoint(endpointId);
      if (failure) {
        failures.push(failure);
      }
    }

    return failures;
  }
}
