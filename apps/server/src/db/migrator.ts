import type { MigrationDefinition, SQLiteDatabase } from './types.js';

interface AppliedMigrationRow {
  id: string;
}

export function runMigrations(db: SQLiteDatabase, migrations: MigrationDefinition[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT id FROM schema_migrations').all() as AppliedMigrationRow[];
  const appliedMigrationIds = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (appliedMigrationIds.has(migration.id)) {
      continue;
    }

    const now = new Date().toISOString();
    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)'
      ).run(migration.id, migration.description, now);
    });

    applyMigration();
  }
}
