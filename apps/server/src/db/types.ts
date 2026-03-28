import type BetterSqlite3 from 'better-sqlite3';

export type DatabaseStatus = 'initialized' | 'failed';

export interface MigrationDefinition {
  id: string;
  description: string;
  sql: string;
}

export type SQLiteDatabase = InstanceType<typeof BetterSqlite3>;

export interface DatabaseContext {
  db: SQLiteDatabase | null;
  filePath: string;
  status: DatabaseStatus;
  error: string | null;
  initializedAt: string | null;
}
