import type {
  EndpointSpecCurrentResponse,
  EndpointSpecDiffResponse,
  EndpointSpecExportResponse,
  EndpointSpecRegenerateResponse,
  EndpointSpecVersionItemResponse,
  EndpointSpecVersionsResponse
} from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import {
  endpointIdParamsSchema,
  specDiffQuerySchema,
  specExportQuerySchema,
  specVersionParamsSchema
} from './schemas.js';
import { SpecService } from './service.js';

interface EndpointIdParams {
  id: string;
}

interface VersionParams extends EndpointIdParams {
  version: string;
}

interface DiffQuery {
  from: string;
  to: string;
}

interface ExportQuery {
  version?: string;
}

function getSpecService(app: FastifyInstance): SpecService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new SpecService(db);
}

const specRoutes: FastifyPluginAsync = async (app) => {
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

    return sendModuleError(reply, error, 'SPEC_INTERNAL_ERROR', 'Unexpected spec builder error');
  });

  app.get<{ Params: EndpointIdParams }>(
    '/endpoints/:id/spec',
    { schema: endpointIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getSpecService(app);
        const result = service.getCurrentSpec(request.params.id);

        return reply.send(result satisfies EndpointSpecCurrentResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'SPEC_INTERNAL_ERROR', 'Unexpected spec builder error');
      }
    }
  );

  app.post<{ Params: EndpointIdParams }>(
    '/endpoints/:id/spec/regenerate',
    { schema: endpointIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getSpecService(app);
        const result = service.regenerateSpec(request.params.id);

        return reply.send(result satisfies EndpointSpecRegenerateResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'SPEC_INTERNAL_ERROR', 'Unexpected spec builder error');
      }
    }
  );

  app.get<{ Params: EndpointIdParams }>(
    '/endpoints/:id/spec/versions',
    { schema: endpointIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getSpecService(app);
        const result = service.listSpecVersions(request.params.id);

        return reply.send(result satisfies EndpointSpecVersionsResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'SPEC_INTERNAL_ERROR', 'Unexpected spec builder error');
      }
    }
  );

  app.get<{ Params: VersionParams }>(
    '/endpoints/:id/spec/versions/:version',
    { schema: specVersionParamsSchema },
    async (request, reply) => {
      try {
        const service = getSpecService(app);
        const result = service.getSpecVersion(request.params.id, Number(request.params.version));

        return reply.send(result satisfies EndpointSpecVersionItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'SPEC_INTERNAL_ERROR', 'Unexpected spec builder error');
      }
    }
  );

  app.get<{ Params: EndpointIdParams; Querystring: DiffQuery }>(
    '/endpoints/:id/spec/diff',
    { schema: { ...endpointIdParamsSchema, ...specDiffQuerySchema } },
    async (request, reply) => {
      try {
        const service = getSpecService(app);
        const result = service.getSpecDiff(
          request.params.id,
          Number(request.query.from),
          Number(request.query.to)
        );

        return reply.send(result satisfies EndpointSpecDiffResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'SPEC_INTERNAL_ERROR', 'Unexpected spec builder error');
      }
    }
  );

  app.get<{ Params: EndpointIdParams; Querystring: ExportQuery }>(
    '/endpoints/:id/spec/export',
    { schema: { ...endpointIdParamsSchema, ...specExportQuerySchema } },
    async (request, reply) => {
      try {
        const service = getSpecService(app);
        const result = service.exportSpec(
          request.params.id,
          request.query.version ? Number(request.query.version) : undefined
        );

        return reply.send(result satisfies EndpointSpecExportResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'SPEC_INTERNAL_ERROR', 'Unexpected spec builder error');
      }
    }
  );
};

export default specRoutes;
