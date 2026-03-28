import type {
  MetricsBreakdownResponse,
  MetricsOverviewResponse,
  MetricsTimeseriesResponse
} from '@contrix/runtime-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { MetricsService } from './service.js';

interface MetricsTimeseriesQuery {
  range?: string;
}

interface MetricsBreakdownQuery {
  range?: string;
}

const timeseriesQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      range: { type: 'string', minLength: 2, maxLength: 6 }
    }
  }
} as const;

function getMetricsService(app: FastifyInstance): MetricsService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new MetricsService(db);
}

const metricsRoutes: FastifyPluginAsync = async (app) => {
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

    return sendModuleError(reply, error, 'METRICS_ERROR', 'Unexpected metrics module error.');
  });

  app.get('/metrics/overview', async (_request, reply) => {
    try {
      const service = getMetricsService(app);
      const result = service.getOverview();
      return reply.send(result satisfies MetricsOverviewResponse);
    } catch (error) {
      return sendModuleError(reply, error, 'METRICS_OVERVIEW_FAILED', 'Failed to load metrics overview.');
    }
  });

  app.get<{ Querystring: MetricsTimeseriesQuery }>(
    '/metrics/timeseries',
    { schema: timeseriesQuerySchema },
    async (request, reply) => {
      try {
        const service = getMetricsService(app);
        const result = service.getTimeseries(request.query.range);
        return reply.send(result satisfies MetricsTimeseriesResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'METRICS_TIMESERIES_FAILED', 'Failed to load metrics timeseries.');
      }
    }
  );

  app.get<{ Querystring: MetricsBreakdownQuery }>(
    '/metrics/breakdown',
    { schema: timeseriesQuerySchema },
    async (request, reply) => {
      try {
        const service = getMetricsService(app);
        const result = service.getBreakdown(request.query.range);
        return reply.send(result satisfies MetricsBreakdownResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'METRICS_BREAKDOWN_FAILED', 'Failed to load metrics breakdown.');
      }
    }
  );
};

export default metricsRoutes;
