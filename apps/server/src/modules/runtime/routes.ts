import { randomUUID } from 'node:crypto';
import type {
  RuntimeFailureResponse,
  RuntimeErrorStage,
  RuntimeErrorType,
  RuntimeMetaResponse,
  RuntimePreflightResponse,
  RuntimeRequest,
  RuntimeRequestPreviewResponse,
  RuntimeResponse
} from '@contrix/runtime-core';
import type { RuntimeSettingsResponse } from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { RuntimeSettingsService } from '../runtime-settings/service.js';
import { normalizeRuntimeError, toRuntimeFailureResponse } from './errors.js';
import {
  runtimeEndpointIdParamsSchema,
  runtimeRequestBodySchema,
  runtimeRouteParamsSchema
} from './schemas.js';
import { RuntimeService } from './service.js';

interface RuntimeRouteParams {
  namespace: string;
  pathSlug: string;
}

interface RuntimeByEndpointParams {
  endpointId: string;
}

interface RuntimeRoutesOptions {
  routePrefix?: string;
  enableLegacyRuntimeAlias?: boolean;
  activeRuntimeSnapshot?: RuntimeSettingsResponse;
}

function normalizeRoutePrefix(routePrefix: string | undefined): string {
  const raw = routePrefix?.trim() || '/runtime';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  const collapsed = withLeading.replace(/\/+/g, '/');
  const normalized = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  if (normalized === '/') {
    return '';
  }

  return normalized || '/runtime';
}

function getRuntimeService(app: FastifyInstance, runtimeSettingsService: RuntimeSettingsService): RuntimeService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new RuntimeService(db, runtimeSettingsService);
}

function runtimeFailure(
  error: unknown,
  fallback: { message: string; type?: RuntimeErrorType; stage?: RuntimeErrorStage },
  runId?: string,
  requestId?: string
): RuntimeFailureResponse {
  const normalized = normalizeRuntimeError(error, {
    type: fallback.type ?? 'RUNTIME_INTERNAL_ERROR',
    stage: fallback.stage ?? 'runtime',
    message: fallback.message
  });

  return toRuntimeFailureResponse(normalized, [], runId ?? randomUUID(), requestId ?? randomUUID());
}

const runtimeRoutes: FastifyPluginAsync<RuntimeRoutesOptions> = async (app, options) => {
  const db = app.databaseContext.db;
  if (!db) {
    throw new Error('Database is unavailable.');
  }

  const runtimeSettingsSnapshot = options.activeRuntimeSnapshot
    ? {
        effective: {
          port: options.activeRuntimeSnapshot.effective.port,
          routePrefix: options.activeRuntimeSnapshot.effective.routePrefix,
          logLevel: options.activeRuntimeSnapshot.effective.logLevel
        },
        sourceByField: {
          port: options.activeRuntimeSnapshot.sourceByField.port,
          routePrefix: options.activeRuntimeSnapshot.sourceByField.routePrefix,
          logLevel: options.activeRuntimeSnapshot.sourceByField.logLevel
        }
      }
    : null;
  const runtimeSettingsService = new RuntimeSettingsService(db, runtimeSettingsSnapshot);

  const primaryPrefix = normalizeRoutePrefix(options.routePrefix);
  const shouldRegisterLegacyAlias = Boolean(options.enableLegacyRuntimeAlias) && primaryPrefix !== '/runtime';

  app.setErrorHandler((error, _request, reply) => {
    const validationError = error as { validation?: unknown; message: string };

    if (validationError.validation) {
      const runId = randomUUID();
      const requestId = randomUUID();
      const failure: RuntimeFailureResponse = {
        success: false,
        runId,
        requestId,
        error: {
          type: 'VALIDATION_ERROR',
          stage: 'request_validation',
          message: validationError.message,
          attemptCount: 0,
          endpointId: null,
          providerType: null,
          model: null,
          specVersion: null,
          promptHash: null,
          lastRawOutput: null,
          lastValidationIssues: [],
          requestId,
          runId,
          timestamp: new Date().toISOString()
        },
        attemptCount: 0,
        attempts: [],
        lastRawOutput: null,
        lastValidationIssues: []
      };

      return reply.code(400).send(failure);
    }

    const failure = runtimeFailure(error, {
      message: 'Unexpected runtime execution error.'
    });
    return reply.code(500).send(failure);
  });

  app.addHook('onRequest', async (request) => {
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url
      },
      'Runtime request'
    );
  });

  app.addHook('preHandler', async (request) => {
    const settings = runtimeSettingsService.getRuntimeSettings().effective;
    if (!settings.enableDebugTrace) {
      return;
    }

    request.log.debug(
      {
        requestId: request.id,
        params: request.params,
        query: request.query,
        body: request.body
      },
      'Runtime debug trace'
    );
  });

  const registerRuntimeHandlers = (basePrefix: string) => {
    app.get<{ Params: RuntimeRouteParams }>(
      `${basePrefix}/:namespace/:pathSlug/meta`,
      { schema: runtimeRouteParamsSchema },
      async (request, reply) => {
        try {
          const service = getRuntimeService(app, runtimeSettingsService);
          const result = service.getRuntimeMeta(request.params.namespace, request.params.pathSlug);

          return reply.send(result satisfies RuntimeMetaResponse);
        } catch (error) {
          const failure = runtimeFailure(error, {
            message: 'Failed to load runtime metadata.'
          });
          return reply.code(400).send(failure);
        }
      }
    );

    app.get<{ Params: RuntimeRouteParams }>(
      `${basePrefix}/:namespace/:pathSlug/preflight`,
      { schema: runtimeRouteParamsSchema },
      async (request, reply) => {
        try {
          const service = getRuntimeService(app, runtimeSettingsService);
          const result = service.getPreflightByRoute(request.params.namespace, request.params.pathSlug);

          return reply.send(result satisfies RuntimePreflightResponse);
        } catch (error) {
          const failure = runtimeFailure(error, {
            message: 'Runtime preflight failed.',
            type: 'PREFLIGHT_FAILED',
            stage: 'preflight'
          });
          return reply.code(400).send(failure);
        }
      }
    );

    app.get<{ Params: RuntimeByEndpointParams }>(
      `${basePrefix}/by-endpoint/:endpointId/preflight`,
      { schema: runtimeEndpointIdParamsSchema },
      async (request, reply) => {
        try {
          const service = getRuntimeService(app, runtimeSettingsService);
          const result = service.getPreflightByEndpointId(request.params.endpointId);

          return reply.send(result satisfies RuntimePreflightResponse);
        } catch (error) {
          const failure = runtimeFailure(error, {
            message: 'Runtime preflight failed.',
            type: 'PREFLIGHT_FAILED',
            stage: 'preflight'
          });
          return reply.code(400).send(failure);
        }
      }
    );

    app.post<{ Params: RuntimeByEndpointParams; Body: RuntimeRequest }>(
      `${basePrefix}/by-endpoint/:endpointId/preview-request`,
      {
        schema: {
          ...runtimeEndpointIdParamsSchema,
          ...runtimeRequestBodySchema
        }
      },
      async (request, reply) => {
        try {
          const service = getRuntimeService(app, runtimeSettingsService);
          const result = service.previewRequestByEndpointId(request.params.endpointId, request.body ?? {});

          return reply.send(result satisfies RuntimeRequestPreviewResponse);
        } catch (error) {
          const failure = runtimeFailure(error, {
            message: 'Runtime request preview failed.',
            type: 'REQUEST_PREVIEW_FAILED',
            stage: 'preview_request'
          });
          return reply.code(400).send(failure);
        }
      }
    );

    app.post<{ Params: RuntimeRouteParams; Body: RuntimeRequest }>(
      `${basePrefix}/:namespace/:pathSlug`,
      {
        schema: {
          ...runtimeRouteParamsSchema,
          ...runtimeRequestBodySchema
        }
      },
      async (request, reply) => {
        const runId = randomUUID();
        const requestId = request.id || randomUUID();

        try {
          const service = getRuntimeService(app, runtimeSettingsService);
          const result = await service.executeByRoute(
            request.params.namespace,
            request.params.pathSlug,
            request.body ?? {},
            { runId, requestId }
          );

          return reply.send(result satisfies RuntimeResponse);
        } catch (error) {
          const failure = runtimeFailure(
            error,
            {
              message: 'Runtime execution failed.'
            },
            runId,
            requestId
          );
          return reply.code(500).send(failure);
        }
      }
    );

    app.post<{ Params: RuntimeByEndpointParams; Body: RuntimeRequest }>(
      `${basePrefix}/by-endpoint/:endpointId`,
      {
        schema: {
          ...runtimeEndpointIdParamsSchema,
          ...runtimeRequestBodySchema
        }
      },
      async (request, reply) => {
        const runId = randomUUID();
        const requestId = request.id || randomUUID();

        try {
          const service = getRuntimeService(app, runtimeSettingsService);
          const result = await service.executeByEndpointId(request.params.endpointId, request.body ?? {}, {
            runId,
            requestId
          });

          return reply.send(result satisfies RuntimeResponse);
        } catch (error) {
          const failure = runtimeFailure(
            error,
            {
              message: 'Runtime execution failed.'
            },
            runId,
            requestId
          );
          return reply.code(500).send(failure);
        }
      }
    );
  };

  registerRuntimeHandlers(primaryPrefix);
  if (shouldRegisterLegacyAlias) {
    registerRuntimeHandlers('/runtime');
  }
};

export default runtimeRoutes;
