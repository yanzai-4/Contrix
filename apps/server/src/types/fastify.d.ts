import type { DatabaseContext } from '../db/types.js';

declare module 'fastify' {
  interface FastifyInstance {
    databaseContext: DatabaseContext;
  }
}

export {};
