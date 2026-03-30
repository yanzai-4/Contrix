import type { MigrationDefinition } from '../types.js';

export const providerConnectionTestStateMigration: MigrationDefinition = {
  id: '002_provider_connection_test_state',
  description: 'Persist provider connectivity test state to avoid in-memory reset.',
  sql: `
    ALTER TABLE providers
      ADD COLUMN last_test_success INTEGER;

    ALTER TABLE providers
      ADD COLUMN last_test_message TEXT;

    ALTER TABLE providers
      ADD COLUMN last_test_latency_ms INTEGER;

    ALTER TABLE providers
      ADD COLUMN last_test_status_code INTEGER;

    ALTER TABLE providers
      ADD COLUMN last_tested_at TEXT;
  `
};
