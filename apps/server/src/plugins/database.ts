import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { closeDatabase, createDatabaseContext, initializeDatabase } from '../db/client.js';

const databasePluginImpl: FastifyPluginAsync = async (app) => {
  const databaseContext = createDatabaseContext();
  initializeDatabase(databaseContext);

  app.decorate('databaseContext', databaseContext);

  if (databaseContext.status === 'initialized') {
    app.log.info({ filePath: databaseContext.filePath }, 'SQLite database initialized');
  } else {
    app.log.error(
      { filePath: databaseContext.filePath, error: databaseContext.error },
      'SQLite database initialization failed'
    );
  }

  app.addHook('onClose', async () => {
    closeDatabase(databaseContext);
  });
};

const databasePlugin = fp(databasePluginImpl, {
  name: 'database-plugin'
});

export default databasePlugin;
