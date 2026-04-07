import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PROMPT_COMPILER_VERSION } from '@contrix/prompt-compiler';
import { createRuntimePlaceholder } from '@contrix/runtime-core';
import type { SpecVersion } from '@contrix/spec-core';
import { buildCorsOptions } from './config/cors.js';
import { isSilentModeEnabled } from './config/silent-mode.js';
import databasePlugin from './plugins/database.js';
import endpointRoutes from './modules/endpoint/routes.js';
import exportRoutes from './modules/export/routes.js';
import groupRoutes from './modules/group/routes.js';
import logsRoutes from './modules/logs/routes.js';
import metricsRoutes from './modules/metrics/routes.js';
import promptRoutes from './modules/prompt/routes.js';
import projectRoutes from './modules/project/routes.js';
import providerRoutes from './modules/provider/routes.js';
import runtimeSettingsRoutes from './modules/runtime-settings/routes.js';
import { RuntimeSettingsService } from './modules/runtime-settings/service.js';
import runtimeRoutes from './modules/runtime/routes.js';
import specRoutes from './modules/spec/routes.js';
import healthRoutes from './routes/health.js';

const SPEC_VERSION: SpecVersion = '0.1.0';

interface BuildAppOptions {
  silentMode?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const silentMode = options.silentMode ?? isSilentModeEnabled();
  const app = Fastify({
    logger: silentMode ? { level: 'error' } : true
  });

  await app.register(cors, buildCorsOptions());

  app.log.info(
    {
      specVersion: SPEC_VERSION,
      promptCompilerVersion: PROMPT_COMPILER_VERSION,
      runtimeCore: createRuntimePlaceholder()
    },
    'Shared workspace packages loaded'
  );

  await app.register(databasePlugin);

  const db = app.databaseContext.db;
  if (!db) {
    throw new Error('Database is unavailable.');
  }

  const runtimeSettingsService = new RuntimeSettingsService(db);
  const runtimeSettingsSnapshot = runtimeSettingsService.getRuntimeSettings();

  await app.register(healthRoutes);

  if (!silentMode) {
    await app.register(runtimeSettingsRoutes, {
      activeRuntimeSnapshot: runtimeSettingsSnapshot
    });
    await app.register(providerRoutes);
    await app.register(projectRoutes);
    await app.register(groupRoutes);
    await app.register(endpointRoutes);
    await app.register(specRoutes);
    await app.register(promptRoutes);
  }

  await app.register(runtimeRoutes, {
    routePrefix: runtimeSettingsSnapshot.effective.routePrefix,
    enableLegacyRuntimeAlias: runtimeSettingsSnapshot.effective.routePrefix !== '/runtime',
    activeRuntimeSnapshot: runtimeSettingsSnapshot
  });

  if (!silentMode) {
    await app.register(logsRoutes);
    await app.register(metricsRoutes);
    await app.register(exportRoutes);
  }

  return app;
}
