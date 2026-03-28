import type {
  PromptPreviewResponse,
  PromptRenderRequest,
  PromptRenderResponse
} from '@contrix/spec-core';
import type { PromptCompileResponse, PromptStateResponse } from '@contrix/runtime-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { promptEndpointIdParamsSchema, promptRenderBodySchema, promptStateParamsSchema } from './schemas.js';
import { PromptService } from './service.js';

interface EndpointIdParams {
  endpointId: string;
}

interface PromptStateParams {
  id: string;
}

function getPromptService(app: FastifyInstance): PromptService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new PromptService(db);
}

const promptRoutes: FastifyPluginAsync = async (app) => {
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

    return sendModuleError(reply, error, 'PROMPT_INTERNAL_ERROR', 'Unexpected prompt compiler error');
  });

  app.get<{ Params: EndpointIdParams }>(
    '/prompt/:endpointId/preview',
    { schema: promptEndpointIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getPromptService(app);
        const result = service.getPromptPreview(request.params.endpointId);

        return reply.send(result satisfies PromptPreviewResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROMPT_INTERNAL_ERROR', 'Unexpected prompt compiler error');
      }
    }
  );

  app.get<{ Params: PromptStateParams }>(
    '/endpoints/:id/prompt/state',
    { schema: promptStateParamsSchema },
    async (request, reply) => {
      try {
        const service = getPromptService(app);
        const result = service.getPromptState(request.params.id);

        return reply.send(result satisfies PromptStateResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROMPT_INTERNAL_ERROR', 'Unexpected prompt state error');
      }
    }
  );

  app.post<{ Params: PromptStateParams }>(
    '/endpoints/:id/prompt/compile',
    { schema: promptStateParamsSchema },
    async (request, reply) => {
      try {
        const service = getPromptService(app);
        const result = service.compilePrompt(request.params.id, 'manual_compile');

        return reply.send(result satisfies PromptCompileResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROMPT_INTERNAL_ERROR', 'Unexpected prompt compile error');
      }
    }
  );

  app.post<{ Params: EndpointIdParams; Body: PromptRenderRequest }>(
    '/prompt/:endpointId/render',
    {
      schema: {
        ...promptEndpointIdParamsSchema,
        ...promptRenderBodySchema
      }
    },
    async (request, reply) => {
      try {
        const service = getPromptService(app);
        const result = service.renderPrompt(request.params.endpointId, request.body);

        return reply.send(result satisfies PromptRenderResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROMPT_INTERNAL_ERROR', 'Unexpected prompt render error');
      }
    }
  );
};

export default promptRoutes;
