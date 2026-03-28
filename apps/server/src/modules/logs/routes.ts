import type {
  CallLogCleanupRequest,
  CallLogCleanupResponse,
  CallLogDebugSnapshotResponse,
  CallLogItemResponse,
  CallLogListQuery,
  CallLogListResponse
} from '@contrix/runtime-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { callLogCleanupBodySchema, callLogIdParamsSchema, callLogListQuerySchema } from './schemas.js';
import { CallLogService } from './service.js';

interface LogIdParams {
  id: string;
}

interface LogsQueryRaw {
  project?: string;
  endpoint?: string;
  provider?: string;
  success?: boolean | 'true' | 'false';
  dateFrom?: string;
  dateTo?: string;
  page?: string | number;
  pageSize?: string | number;
}

interface LogsCleanupBodyRaw {
  window: '7d' | '1m' | '3m' | 'all';
  dryRun?: boolean;
}

function getLogsService(app: FastifyInstance): CallLogService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new CallLogService(db);
}

function toBoolean(value: LogsQueryRaw['success']): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function toNumber(value: LogsQueryRaw['page']): number | undefined {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeQuery(query: LogsQueryRaw): CallLogListQuery {
  return {
    project: query.project,
    endpoint: query.endpoint,
    provider: query.provider,
    success: toBoolean(query.success),
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: toNumber(query.page),
    pageSize: toNumber(query.pageSize)
  };
}

const logsRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    const validationError = error as { validation?: unknown; message: string };

    if (validationError.validation) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: validationError.message
        }
      });
    }

    return sendModuleError(reply, error, 'LOGS_ERROR', 'Unexpected logs module error.');
  });

  app.post<{ Body: LogsCleanupBodyRaw }>(
    '/logs/cleanup',
    { schema: callLogCleanupBodySchema },
    async (request, reply) => {
      try {
        const service = getLogsService(app);
        const result = service.cleanupLogs(request.body as CallLogCleanupRequest);
        return reply.send(result satisfies CallLogCleanupResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'LOGS_CLEANUP_FAILED', 'Failed to clean up call logs.');
      }
    }
  );

  app.get<{ Querystring: LogsQueryRaw }>(
    '/logs',
    { schema: callLogListQuerySchema },
    async (request, reply) => {
      try {
        const service = getLogsService(app);
        const result = service.listLogs(normalizeQuery(request.query));
        return reply.send(result satisfies CallLogListResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'LOGS_LIST_FAILED', 'Failed to load call logs.');
      }
    }
  );

  app.get<{ Params: LogIdParams }>(
    '/logs/:id/debug',
    { schema: callLogIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getLogsService(app);
        const result = service.getDebugSnapshotById(request.params.id);
        return reply.send(result satisfies CallLogDebugSnapshotResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'LOGS_DEBUG_FAILED', 'Failed to load debug snapshot.');
      }
    }
  );

  app.get<{ Params: LogIdParams }>(
    '/logs/:id',
    { schema: callLogIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getLogsService(app);
        const result = service.getLogById(request.params.id);
        return reply.send(result satisfies CallLogItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'LOGS_DETAIL_FAILED', 'Failed to load call log detail.');
      }
    }
  );
};

export default logsRoutes;
