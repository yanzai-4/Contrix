import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import { availableMigrations } from './migrations/index.js';
import { runMigrations } from './migrator.js';
import type { DatabaseContext } from './types.js';

const DB_FILE_NAME = 'contrix.sqlite';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(MODULE_DIR, '../../data', DB_FILE_NAME);

export function createDatabaseContext(filePath = DEFAULT_DB_PATH): DatabaseContext {
  return {
    db: null,
    filePath,
    status: 'failed',
    error: null,
    initializedAt: null
  };
}

export function initializeDatabase(context: DatabaseContext): void {
  try {
    fs.mkdirSync(path.dirname(context.filePath), { recursive: true });

    const db = new BetterSqlite3(context.filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db, availableMigrations);

    const now = new Date().toISOString();
    const upsertMeta = db.prepare(`
      INSERT INTO app_meta (key, value, created_at)
      VALUES (@key, @value, @createdAt)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    upsertMeta.run({
      key: 'app_name',
      value: 'Contrix Local Builder',
      createdAt: now
    });

    upsertMeta.run({
      key: 'created_at',
      value: now,
      createdAt: now
    });

    context.db = db;
    context.status = 'initialized';
    context.error = null;
    context.initializedAt = now;
  } catch (error) {
    context.status = 'failed';
    context.error = error instanceof Error ? error.message : String(error);
    context.initializedAt = null;

    if (context.db) {
      context.db.close();
      context.db = null;
    }
  }
}

export function closeDatabase(context: DatabaseContext): void {
  if (context.db) {
    context.db.close();
    context.db = null;
  }
}
