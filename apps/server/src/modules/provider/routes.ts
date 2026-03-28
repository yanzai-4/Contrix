import type {
  CreateProviderRequest,
  ProviderConnectionTestResponse,
  ProviderDeleteResponse,
  ProviderItemResponse,
  ProviderListResponse,
  UpdateProviderRequest
} from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ProviderModuleError, sendProviderError } from './errors.js';
import {
  createProviderSchema,
  providerIdParamsSchema,
  updateProviderSchema
} from './schemas.js';
import { ProviderService } from './service.js';

interface ProviderIdParams {
  id: string;
}

function getProviderService(app: FastifyInstance): ProviderService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new ProviderModuleError('DATABASE_UNAVAILABLE', 500, 'Database is not available.');
  }

  return new ProviderService(db);
}

const providerRoutes: FastifyPluginAsync = async (app) => {
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

    return sendProviderError(reply, error);
  });

  app.get('/providers', async (_request, reply) => {
    try {
      const service = getProviderService(app);
      const providers = service.listProviders();

      return reply.send({ providers } satisfies ProviderListResponse);
    } catch (error) {
      return sendProviderError(reply, error);
    }
  });

  app.get<{ Params: ProviderIdParams }>(
    '/providers/:id',
    { schema: providerIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getProviderService(app);
        const provider = service.getProviderById(request.params.id);

        return reply.send({ provider } satisfies ProviderItemResponse);
      } catch (error) {
        return sendProviderError(reply, error);
      }
    }
  );

  app.post<{ Body: CreateProviderRequest }>(
    '/providers',
    { schema: createProviderSchema },
    async (request, reply) => {
      try {
        const service = getProviderService(app);
        const provider = service.createProvider(request.body);

        return reply.code(201).send({ provider } satisfies ProviderItemResponse);
      } catch (error) {
        return sendProviderError(reply, error);
      }
    }
  );

  app.put<{ Params: ProviderIdParams; Body: UpdateProviderRequest }>(
    '/providers/:id',
    { schema: { ...providerIdParamsSchema, ...updateProviderSchema } },
    async (request, reply) => {
      try {
        const service = getProviderService(app);
        const provider = service.updateProvider(request.params.id, request.body);

        return reply.send({ provider } satisfies ProviderItemResponse);
      } catch (error) {
        return sendProviderError(reply, error);
      }
    }
  );

  app.delete<{ Params: ProviderIdParams }>(
    '/providers/:id',
    { schema: providerIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getProviderService(app);
        service.deleteProvider(request.params.id);

        return reply.send({ ok: true, id: request.params.id } satisfies ProviderDeleteResponse);
      } catch (error) {
        return sendProviderError(reply, error);
      }
    }
  );

  app.post<{ Params: ProviderIdParams }>(
    '/providers/:id/test',
    { schema: providerIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getProviderService(app);
        const result = await service.testProviderConnection(request.params.id);

        return reply.send(result satisfies ProviderConnectionTestResponse);
      } catch (error) {
        return sendProviderError(reply, error);
      }
    }
  );
};

export default providerRoutes;
