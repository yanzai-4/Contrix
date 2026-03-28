import type {
  RuntimeLogLevel,
  RuntimeSettingsConfigured,
  RuntimeSettingsEffective,
  RuntimeSettingsResponse,
  RuntimeSettingsSourceByField,
  RuntimeSettingsSourceValue
} from '@contrix/spec-core';

export interface RuntimeSettingsRow {
  port: number;
  route_prefix: string;
  log_level: RuntimeLogLevel;
  updated_at: string;
}

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettingsConfigured = {
  port: 4411,
  routePrefix: '/contrix',
  logLevel: 'info',
  enableDebugTrace: false
};

export const RESTART_REQUIRED_FIELDS: RuntimeSettingsResponse['restartRequiredFields'] = [
  'port',
  'routePrefix',
  'logLevel'
];

export interface RuntimeSettingsComputedResult {
  configured: RuntimeSettingsConfigured;
  effective: RuntimeSettingsEffective;
  sourceByField: RuntimeSettingsSourceByField;
}

export interface EffectiveValueResult<T> {
  value: T;
  source: RuntimeSettingsSourceValue;
}

export interface RuntimeActiveSnapshot {
  effective: Pick<RuntimeSettingsEffective, 'port' | 'routePrefix' | 'logLevel'>;
  sourceByField: Pick<RuntimeSettingsSourceByField, 'port' | 'routePrefix' | 'logLevel'>;
}
