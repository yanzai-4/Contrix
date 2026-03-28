export type DatabaseHealth = 'initialized' | 'failed';

export interface HealthResponse {
  ok: boolean;
  server: 'up';
  database: DatabaseHealth;
  timestamp: string;
}
