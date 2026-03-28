import type {
  RuntimeLogLevel,
  RuntimeSettingsConfigured,
  RuntimeSettingsSourceValue,
  RuntimeSettingsResponse,
  UpdateRuntimeSettingsRequest
} from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import { ModuleError } from '../common/errors.js';
import {
  DEFAULT_RUNTIME_SETTINGS,
  type EffectiveValueResult,
  type RuntimeActiveSnapshot,
  type RuntimeSettingsComputedResult,
  type RuntimeSettingsRow,
  RESTART_REQUIRED_FIELDS
} from './model.js';

const LOG_LEVELS: RuntimeLogLevel[] = ['debug', 'info', 'warn', 'error'];

function normalizePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ModuleError('INVALID_RUNTIME_SETTINGS', 400, 'Runtime port must be an integer between 1 and 65535.');
  }

  return value;
}

function normalizeRoutePrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ModuleError('INVALID_RUNTIME_SETTINGS', 400, 'Route prefix is required.');
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/+/g, '/');
  const normalized = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(normalized)) {
    throw new ModuleError(
      'INVALID_RUNTIME_SETTINGS',
      400,
      'Route prefix may only include letters, numbers, "-", "_" and "/".'
    );
  }

  return normalized;
}

function normalizeLogLevel(value: string): RuntimeLogLevel {
  if (LOG_LEVELS.includes(value as RuntimeLogLevel)) {
    return value as RuntimeLogLevel;
  }

  throw new ModuleError('INVALID_RUNTIME_SETTINGS', 400, `Unsupported log level "${value}".`);
}


function normalizeHost(rawValue: string | undefined): string {
  const trimmed = rawValue?.trim() ?? '';
  return trimmed || 'localhost';
}

function pickEnvPort(configured: number): EffectiveValueResult<number> {
  const explicit = process.env.CONTRIX_RUNTIME_PORT?.trim();
  if (explicit) {
    const parsed = Number(explicit);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return { value: parsed, source: 'env:CONTRIX_RUNTIME_PORT' };
    }
  }

  const compatibility = process.env.PORT?.trim();
  if (compatibility) {
    const parsed = Number(compatibility);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return { value: parsed, source: 'env:PORT' };
    }
  }

  return { value: configured, source: 'config' };
}

function pickEnvRoutePrefix(configured: string): EffectiveValueResult<string> {
  const raw = process.env.CONTRIX_RUNTIME_ROUTE_PREFIX?.trim();
  if (raw) {
    try {
      return {
        value: normalizeRoutePrefix(raw),
        source: 'env:CONTRIX_RUNTIME_ROUTE_PREFIX'
      };
    } catch {
      return { value: configured, source: 'config' };
    }
  }

  return { value: configured, source: 'config' };
}

function pickEnvLogLevel(configured: RuntimeLogLevel): EffectiveValueResult<RuntimeLogLevel> {
  const raw = process.env.CONTRIX_RUNTIME_LOG_LEVEL?.trim();
  if (raw) {
    if (LOG_LEVELS.includes(raw as RuntimeLogLevel)) {
      return {
        value: raw as RuntimeLogLevel,
        source: 'env:CONTRIX_RUNTIME_LOG_LEVEL'
      };
    }

    return { value: configured, source: 'config' };
  }

  return { value: configured, source: 'config' };
}

function rowToConfigured(row: RuntimeSettingsRow): RuntimeSettingsConfigured {
  return {
    port: row.port,
    routePrefix: row.route_prefix,
    logLevel: row.log_level,
    // Debug trace now follows log level automatically.
    enableDebugTrace: row.log_level === 'debug'
  };
}

export class RuntimeSettingsService {
  constructor(
    private readonly db: SQLiteDatabase,
    private readonly activeSnapshot: RuntimeActiveSnapshot | null = null
  ) {}

  getRuntimeSettings(): RuntimeSettingsResponse {
    const computed = this.computeSettings();
    const legacyRuntimeAliasActive = computed.effective.routePrefix !== '/runtime';

    return {
      configured: computed.configured,
      effective: computed.effective,
      sourceByField: computed.sourceByField,
      restartRequiredFields: RESTART_REQUIRED_FIELDS,
      deprecation: {
        legacyRuntimeAliasActive,
        message: legacyRuntimeAliasActive
          ? 'Legacy alias "/runtime" is temporarily active for compatibility and will be removed in a future release.'
          : null
      }
    };
  }

  updateRuntimeSettings(payload: UpdateRuntimeSettingsRequest): RuntimeSettingsResponse {
    const current = this.getConfiguredSettings();
    const nextLogLevel = payload.logLevel === undefined ? current.logLevel : normalizeLogLevel(payload.logLevel);
    const next: RuntimeSettingsConfigured = {
      ...current,
      ...(payload.port === undefined ? null : { port: normalizePort(payload.port) }),
      ...(payload.routePrefix === undefined
        ? null
        : { routePrefix: normalizeRoutePrefix(payload.routePrefix) }),
      logLevel: nextLogLevel,
      enableDebugTrace: nextLogLevel === 'debug'
    };

    const now = new Date().toISOString();

    this.db
      .prepare(
        `
          UPDATE runtime_settings
          SET
            port = @port,
            route_prefix = @routePrefix,
            log_level = @logLevel,
            updated_at = @updatedAt
          WHERE id = 1
        `
      )
      .run({
        port: next.port,
        routePrefix: next.routePrefix,
        logLevel: next.logLevel,
        updatedAt: now
      });

    return this.getRuntimeSettings();
  }

  getConfiguredSettings(): RuntimeSettingsConfigured {
    const row = this.ensureRuntimeSettingsRow();
    return rowToConfigured(row);
  }

  private computeSettings(): RuntimeSettingsComputedResult {
    const configured = this.getConfiguredSettings();
    const hostRaw = process.env.HOST?.trim();
    const host = normalizeHost(hostRaw);
    const hostSource: RuntimeSettingsSourceValue = hostRaw ? 'env:HOST' : 'default';
    const effectivePort = pickEnvPort(configured.port);
    const effectiveRoutePrefix = pickEnvRoutePrefix(configured.routePrefix);
    const effectiveLogLevel = pickEnvLogLevel(configured.logLevel);
    const effectiveDebugTrace = {
      value: effectiveLogLevel.value === 'debug',
      source: effectiveLogLevel.source
    } satisfies EffectiveValueResult<boolean>;

    const effective = {
      port: effectivePort.value,
      routePrefix: effectiveRoutePrefix.value,
      logLevel: effectiveLogLevel.value,
      enableDebugTrace: effectiveDebugTrace.value,
      host,
      baseUrl: `http://${host}:${effectivePort.value}`
    };

    const sourceByField = {
      port: effectivePort.source,
      routePrefix: effectiveRoutePrefix.source,
      logLevel: effectiveLogLevel.source,
      enableDebugTrace: effectiveDebugTrace.source,
      host: hostSource
    };

    if (this.activeSnapshot) {
      effective.port = this.activeSnapshot.effective.port;
      effective.routePrefix = this.activeSnapshot.effective.routePrefix;
      effective.logLevel = this.activeSnapshot.effective.logLevel;
      effective.baseUrl = `http://${host}:${effective.port}`;

      sourceByField.port = this.activeSnapshot.sourceByField.port;
      sourceByField.routePrefix = this.activeSnapshot.sourceByField.routePrefix;
      sourceByField.logLevel = this.activeSnapshot.sourceByField.logLevel;
    }

    return {
      configured,
      effective,
      sourceByField
    };
  }

  private ensureRuntimeSettingsRow(): RuntimeSettingsRow {
    const existing = this.db
      .prepare(
        `
          SELECT
            port,
            route_prefix,
            log_level,
            updated_at
          FROM runtime_settings
          WHERE id = 1
          LIMIT 1
        `
      )
      .get() as RuntimeSettingsRow | undefined;

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
          INSERT INTO runtime_settings (
            id,
            port,
            route_prefix,
            log_level,
            updated_at
          ) VALUES (
            1,
            @port,
            @routePrefix,
            @logLevel,
            @updatedAt
          )
        `
      )
      .run({
        port: DEFAULT_RUNTIME_SETTINGS.port,
        routePrefix: DEFAULT_RUNTIME_SETTINGS.routePrefix,
        logLevel: DEFAULT_RUNTIME_SETTINGS.logLevel,
        updatedAt: now
      });

    const inserted = this.db
      .prepare(
        `
          SELECT
            port,
            route_prefix,
            log_level,
            updated_at
          FROM runtime_settings
          WHERE id = 1
          LIMIT 1
        `
      )
      .get() as RuntimeSettingsRow | undefined;

    if (!inserted) {
      throw new ModuleError('RUNTIME_SETTINGS_ERROR', 500, 'Runtime settings row could not be initialized.');
    }

    return inserted;
  }
}
