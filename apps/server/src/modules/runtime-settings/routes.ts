import type { RuntimeSettingsResponse, UpdateRuntimeSettingsRequest } from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { runtimeSettingsUpdateBodySchema } from './schemas.js';
import { RuntimeSettingsService } from './service.js';

interface RuntimeSettingsRoutesOptions {
  activeRuntimeSnapshot?: RuntimeSettingsResponse;
}

function getRuntimeSettingsService(
  app: FastifyInstance,
  options?: RuntimeSettingsRoutesOptions
): RuntimeSettingsService {
  const db = app.databaseContext.db;
  if (!db) {
    throw new Error('Database is unavailable.');
  }

  const snapshot = options?.activeRuntimeSnapshot
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

  return new RuntimeSettingsService(db, snapshot);
}

const runtimeSettingsRoutes: FastifyPluginAsync<RuntimeSettingsRoutesOptions> = async (app, options) => {
  const service = getRuntimeSettingsService(app, options);

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

    return sendModuleError(reply, error, 'RUNTIME_SETTINGS_ERROR', 'Unexpected runtime settings module error.');
  });

  app.get('/settings/runtime', async (_request, reply) => {
    try {
      const result = service.getRuntimeSettings();
      return reply.send(result satisfies RuntimeSettingsResponse);
    } catch (error) {
      return sendModuleError(
        reply,
        error,
        'RUNTIME_SETTINGS_FETCH_FAILED',
        'Failed to fetch runtime settings.'
      );
    }
  });

  app.put<{ Body: UpdateRuntimeSettingsRequest }>(
    '/settings/runtime',
    { schema: runtimeSettingsUpdateBodySchema },
    async (request, reply) => {
      try {
        const result = service.updateRuntimeSettings(request.body ?? {});
        return reply.send(result satisfies RuntimeSettingsResponse);
      } catch (error) {
        return sendModuleError(
          reply,
          error,
          'RUNTIME_SETTINGS_UPDATE_FAILED',
          'Failed to update runtime settings.'
        );
      }
    }
  );
};

export default runtimeSettingsRoutes;
