import type { MigrationDefinition } from '../types.js';
import { baselineMigration } from './001_baseline.js';

export const availableMigrations: MigrationDefinition[] = [
  baselineMigration
];
