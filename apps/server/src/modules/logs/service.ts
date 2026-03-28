import type {
  CallLogCleanupRequest,
  CallLogCleanupResponse,
  CallLogCleanupWindow,
  CallLogDebugSnapshotResponse,
  CallLogItemResponse,
  CallLogListQuery,
  CallLogListResponse
} from '@contrix/runtime-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import { CallLogRepository } from './repository.js';
import type { CallLogListFilters } from './model.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function toPositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizeDateInput(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new ModuleError('INVALID_DATE', 400, `Invalid date value "${value}".`);
  }

  return new Date(parsed).toISOString();
}

function normalizeListFilters(query: CallLogListQuery): CallLogListFilters {
  const page = toPositiveInteger(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(toPositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const dateFrom = normalizeDateInput(query.dateFrom);
  const dateTo = normalizeDateInput(query.dateTo);

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ModuleError('INVALID_DATE_RANGE', 400, 'dateFrom must be less than or equal to dateTo.');
  }

  return {
    project: query.project?.trim() || undefined,
    endpoint: query.endpoint?.trim() || undefined,
    provider: query.provider?.trim() || undefined,
    success: typeof query.success === 'boolean' ? query.success : undefined,
    dateFrom,
    dateTo,
    page,
    pageSize
  };
}

function resolveCleanupCutoff(window: CallLogCleanupWindow, now: Date): string {
  const cutoff = new Date(now.getTime());

  if (window === '7d') {
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);
    return cutoff.toISOString();
  }

  if (window === '1m') {
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
    return cutoff.toISOString();
  }

  if (window === '3m') {
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
    return cutoff.toISOString();
  }

  if (window === 'all') {
    return now.toISOString();
  }

  throw new ModuleError('INVALID_CLEANUP_WINDOW', 400, `Unsupported cleanup window "${window}".`);
}

export class CallLogService {
  private readonly repository: CallLogRepository;

  constructor(db: SQLiteDatabase) {
    this.repository = new CallLogRepository(db);
  }

  listLogs(query: CallLogListQuery): CallLogListResponse {
    const filters = normalizeListFilters(query);
    const result = this.repository.list(filters);

    return {
      items: result.items,
      page: filters.page,
      pageSize: filters.pageSize,
      total: result.total,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / filters.pageSize)
    };
  }

  getLogById(logId: string): CallLogItemResponse {
    const call = this.repository.findById(logId);

    if (!call) {
      throw new ModuleError('LOG_NOT_FOUND', 404, 'Call log not found.');
    }

    return {
      call
    };
  }

  getDebugSnapshotById(logId: string): CallLogDebugSnapshotResponse {
    const call = this.repository.findById(logId);

    if (!call) {
      throw new ModuleError('LOG_NOT_FOUND', 404, 'Call log not found.');
    }

    return {
      callLogId: logId,
      snapshot: this.repository.findDebugSnapshotByCallLogId(logId)
    };
  }

  cleanupLogs(request: CallLogCleanupRequest): CallLogCleanupResponse {
    const cleanupWindow = request.window;
    const dryRun = request.dryRun === true;
    const cutoffAt = resolveCleanupCutoff(cleanupWindow, new Date());
    const matchedCount =
      cleanupWindow === 'all' ? this.repository.countAll() : this.repository.countOlderThan(cutoffAt);

    if (dryRun) {
      return {
        window: cleanupWindow,
        cutoffAt,
        dryRun,
        matchedCount,
        deletedCount: 0
      };
    }

    const deletedCount =
      cleanupWindow === 'all' ? this.repository.deleteAll() : this.repository.deleteOlderThan(cutoffAt);

    return {
      window: cleanupWindow,
      cutoffAt,
      dryRun,
      matchedCount,
      deletedCount
    };
  }
}
