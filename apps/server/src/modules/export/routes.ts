import type {
  ExportProjectOptions,
  ExportProjectPreflightResponse,
  ExportProjectResponse
} from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { exportProjectBodySchema, exportProjectParamsSchema } from './schemas.js';
import { ExportService } from './service.js';

interface ExportProjectParams {
  projectId: string;
}

function getExportService(app: FastifyInstance): ExportService {
  const db = app.databaseContext.db;
  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new ExportService(db);
}

const exportRoutes: FastifyPluginAsync = async (app) => {
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

    return sendModuleError(reply, error, 'EXPORT_ERROR', 'Unexpected export module error.');
  });

  app.get<{ Params: ExportProjectParams }>(
    '/export/projects/:projectId/preflight',
    { schema: exportProjectParamsSchema },
    async (request, reply) => {
      try {
        const service = getExportService(app);
        const result = service.getPreflight(request.params.projectId);
        return reply.send(result satisfies ExportProjectPreflightResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'EXPORT_PREFLIGHT_FAILED', 'Failed to run export preflight.');
      }
    }
  );

  app.post<{ Params: ExportProjectParams; Body: ExportProjectOptions }>(
    '/export/projects/:projectId',
    { schema: { ...exportProjectParamsSchema, ...exportProjectBodySchema } },
    async (request, reply) => {
      try {
        const service = getExportService(app);
        const result = await service.exportProject(request.params.projectId, request.body ?? {});
        return reply.send(result satisfies ExportProjectResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'EXPORT_EXECUTION_FAILED', 'Failed to export project.');
      }
    }
  );
};

export default exportRoutes;
