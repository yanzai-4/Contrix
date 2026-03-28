import type {
  CreateEndpointRequest,
  EndpointDeleteResponse,
  EndpointItemResponse,
  EndpointListResponse,
  EndpointSchemaItemResponse,
  SaveEndpointSchemaRequest,
  UpdateEndpointRequest
} from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { EndpointService } from './service.js';
import {
  createEndpointSchema,
  endpointIdParamsSchema,
  endpointListQuerySchema,
  saveEndpointSchemaSchema,
  updateEndpointSchema
} from './schemas.js';

interface EndpointIdParams {
  id: string;
}

interface EndpointListQuery {
  projectId?: string;
  groupId?: string;
}

function getEndpointService(app: FastifyInstance): EndpointService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new EndpointService(db);
}

const endpointRoutes: FastifyPluginAsync = async (app) => {
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

    return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint error');
  });

  app.get<{ Querystring: EndpointListQuery }>(
    '/endpoints',
    { schema: endpointListQuerySchema },
    async (request, reply) => {
      try {
        const service = getEndpointService(app);
        const endpoints = service.listEndpoints(request.query.projectId, request.query.groupId);

        return reply.send({ endpoints } satisfies EndpointListResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint error');
      }
    }
  );

  app.get<{ Params: EndpointIdParams }>(
    '/endpoints/:id',
    { schema: endpointIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getEndpointService(app);
        const endpoint = service.getEndpointById(request.params.id);

        return reply.send({ endpoint } satisfies EndpointItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint error');
      }
    }
  );

  app.get<{ Params: EndpointIdParams }>(
    '/endpoints/:id/schema',
    { schema: endpointIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getEndpointService(app);
        const schema = service.getEndpointSchema(request.params.id);

        return reply.send({ schema } satisfies EndpointSchemaItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint schema error');
      }
    }
  );

  app.post<{ Body: CreateEndpointRequest }>(
    '/endpoints',
    { schema: createEndpointSchema },
    async (request, reply) => {
      try {
        const service = getEndpointService(app);
        const endpoint = service.createEndpoint(request.body);

        return reply.code(201).send({ endpoint } satisfies EndpointItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint error');
      }
    }
  );

  app.put<{ Params: EndpointIdParams; Body: UpdateEndpointRequest }>(
    '/endpoints/:id',
    { schema: { ...endpointIdParamsSchema, ...updateEndpointSchema } },
    async (request, reply) => {
      try {
        const service = getEndpointService(app);
        const endpoint = service.updateEndpoint(request.params.id, request.body);

        return reply.send({ endpoint } satisfies EndpointItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint error');
      }
    }
  );

  app.put<{ Params: EndpointIdParams; Body: SaveEndpointSchemaRequest }>(
    '/endpoints/:id/schema',
    { schema: { ...endpointIdParamsSchema, ...saveEndpointSchemaSchema } },
    async (request, reply) => {
      try {
        const service = getEndpointService(app);
        const schema = service.saveEndpointSchema(request.params.id, request.body);

        return reply.send({ schema } satisfies EndpointSchemaItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint schema error');
      }
    }
  );

  app.delete<{ Params: EndpointIdParams }>(
    '/endpoints/:id',
    { schema: endpointIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getEndpointService(app);
        service.deleteEndpoint(request.params.id);

        return reply.send({ ok: true, id: request.params.id } satisfies EndpointDeleteResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'ENDPOINT_INTERNAL_ERROR', 'Unexpected endpoint error');
      }
    }
  );
};

export default endpointRoutes;
