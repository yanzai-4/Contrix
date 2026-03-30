import type { MigrationDefinition } from '../types.js';
import { baselineMigration } from './001_baseline.js';
import { providerConnectionTestStateMigration } from './002_provider_connection_test_state.js';

export const availableMigrations: MigrationDefinition[] = [
  baselineMigration,
  providerConnectionTestStateMigration
];
