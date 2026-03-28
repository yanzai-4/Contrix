import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '../types/http.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (): Promise<HealthResponse> => {
    const database = app.databaseContext.status;

    return {
      ok: database === 'initialized',
      server: 'up',
      database,
      timestamp: new Date().toISOString()
    };
  });
};

export default healthRoutes;
