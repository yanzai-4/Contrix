import { buildApp } from './app.js';
import { isSilentModeEnabled } from './config/silent-mode.js';
import { RuntimeSettingsService } from './modules/runtime-settings/service.js';

const HOST = process.env.HOST ?? 'localhost';

async function startServer() {
  const silentMode = isSilentModeEnabled();
  const app = await buildApp({ silentMode });
  const db = app.databaseContext.db;

  if (!db) {
    app.log.error('Database is unavailable.');
    process.exit(1);
  }

  const runtimeSettingsService = new RuntimeSettingsService(db);
  const runtimeSettings = runtimeSettingsService.getRuntimeSettings();
  const effectivePort = runtimeSettings.effective.port;
  app.log.level = silentMode ? 'error' : runtimeSettings.effective.logLevel;

  try {
    await app.listen({ port: effectivePort, host: HOST });
    app.log.info(
      {
        port: effectivePort,
        routePrefix: runtimeSettings.effective.routePrefix,
        sourceByField: runtimeSettings.sourceByField
      },
      `Server listening on http://${HOST}:${effectivePort}`
    );
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

void startServer();
