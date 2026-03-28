import type { SpecTriggerReason } from '@contrix/spec-core';
import {
  specTriggerReasons,
  type EndpointSpec,
  type EndpointSpecVersionRecord,
  type EndpointSpecVersionSummary
} from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import type { EndpointSpecMetaRecord, EndpointSpecVersionInsertInput } from './model.js';

interface EndpointSpecMetaRow {
  endpoint_id: string;
  current_version: number;
  current_hash: string | null;
  last_generated_at: string | null;
  updated_at: string;
  pending_trigger_reason: string;
}

interface EndpointSpecVersionRow {
  id: string;
  endpoint_id: string;
  version: number;
  spec_json: string;
  hash: string;
  created_at: string;
  trigger_reason: string;
  is_current: number;
}

const VALID_TRIGGER_REASONS = new Set<string>(specTriggerReasons);

function normalizeTriggerReason(value: string): SpecTriggerReason {
  return VALID_TRIGGER_REASONS.has(value) ? (value as SpecTriggerReason) : 'system_rebuild';
}

function mapMetaRow(row: EndpointSpecMetaRow): EndpointSpecMetaRecord {
  return {
    endpointId: row.endpoint_id,
    currentVersion: row.current_version,
    currentHash: row.current_hash,
    lastGeneratedAt: row.last_generated_at,
    updatedAt: row.updated_at,
    pendingTriggerReason: normalizeTriggerReason(row.pending_trigger_reason)
  };
}

function parseSpecJson(rawSpecJson: string): EndpointSpec {
  const parsed = JSON.parse(rawSpecJson) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored spec JSON is invalid.');
  }

  return parsed as EndpointSpec;
}

function mapVersionRow(row: EndpointSpecVersionRow): EndpointSpecVersionRecord {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    version: row.version,
    hash: row.hash,
    createdAt: row.created_at,
    triggerReason: normalizeTriggerReason(row.trigger_reason),
    isCurrent: row.is_current === 1,
    spec: parseSpecJson(row.spec_json)
  };
}

function mapVersionSummaryRow(row: EndpointSpecVersionRow): EndpointSpecVersionSummary {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    version: row.version,
    hash: row.hash,
    createdAt: row.created_at,
    triggerReason: normalizeTriggerReason(row.trigger_reason),
    isCurrent: row.is_current === 1
  };
}

export class SpecRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  ensureMeta(endpointId: string, pendingTriggerReason: SpecTriggerReason = 'initial'): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
          INSERT INTO endpoint_specs (
            endpoint_id,
            current_version,
            current_hash,
            last_generated_at,
            updated_at,
            pending_trigger_reason
          ) VALUES (
            @endpointId,
            0,
            NULL,
            NULL,
            @updatedAt,
            @pendingTriggerReason
          )
          ON CONFLICT(endpoint_id) DO NOTHING
        `
      )
      .run({
        endpointId,
        updatedAt: now,
        pendingTriggerReason
      });
  }

  getMeta(endpointId: string): EndpointSpecMetaRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            endpoint_id,
            current_version,
            current_hash,
            last_generated_at,
            updated_at,
            pending_trigger_reason
          FROM endpoint_specs
          WHERE endpoint_id = ?
          LIMIT 1
        `
      )
      .get(endpointId) as EndpointSpecMetaRow | undefined;

    return row ? mapMetaRow(row) : null;
  }

  setPendingTriggerReason(endpointId: string, reason: SpecTriggerReason): void {
    this.ensureMeta(endpointId, reason);

    this.db
      .prepare(
        `
          UPDATE endpoint_specs
          SET
            pending_trigger_reason = @reason,
            updated_at = @updatedAt
          WHERE endpoint_id = @endpointId
        `
      )
      .run({
        endpointId,
        reason,
        updatedAt: new Date().toISOString()
      });
  }

  touchMeta(endpointId: string, generatedAt: string): void {
    this.ensureMeta(endpointId, 'system_rebuild');

    this.db
      .prepare(
        `
          UPDATE endpoint_specs
          SET
            last_generated_at = @generatedAt,
            updated_at = @updatedAt
          WHERE endpoint_id = @endpointId
        `
      )
      .run({
        endpointId,
        generatedAt,
        updatedAt: generatedAt
      });
  }

  setCurrentMeta(
    endpointId: string,
    currentVersion: number,
    currentHash: string,
    generatedAt: string
  ): void {
    this.ensureMeta(endpointId, 'system_rebuild');

    this.db
      .prepare(
        `
          UPDATE endpoint_specs
          SET
            current_version = @currentVersion,
            current_hash = @currentHash,
            last_generated_at = @generatedAt,
            pending_trigger_reason = 'system_rebuild',
            updated_at = @updatedAt
          WHERE endpoint_id = @endpointId
        `
      )
      .run({
        endpointId,
        currentVersion,
        currentHash,
        generatedAt,
        updatedAt: generatedAt
      });
  }

  insertVersion(input: EndpointSpecVersionInsertInput): EndpointSpecVersionRecord {
    const tx = this.db.transaction(() => {
      this.db
        .prepare('UPDATE endpoint_spec_versions SET is_current = 0 WHERE endpoint_id = ?')
        .run(input.endpointId);

      this.db
        .prepare(
          `
            INSERT INTO endpoint_spec_versions (
              id,
              endpoint_id,
              version,
              spec_json,
              hash,
              created_at,
              trigger_reason,
              is_current
            ) VALUES (
              @id,
              @endpointId,
              @version,
              @specJson,
              @hash,
              @createdAt,
              @triggerReason,
              1
            )
          `
        )
        .run({
          id: input.id,
          endpointId: input.endpointId,
          version: input.version,
          specJson: JSON.stringify(input.spec),
          hash: input.hash,
          createdAt: input.createdAt,
          triggerReason: input.triggerReason
        });
    });

    tx();

    const stored = this.getVersion(input.endpointId, input.version);

    if (!stored) {
      throw new Error('Spec version insert succeeded but record could not be reloaded.');
    }

    return stored;
  }

  getCurrentVersion(endpointId: string): EndpointSpecVersionRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            endpoint_id,
            version,
            spec_json,
            hash,
            created_at,
            trigger_reason,
            is_current
          FROM endpoint_spec_versions
          WHERE endpoint_id = ? AND is_current = 1
          ORDER BY version DESC
          LIMIT 1
        `
      )
      .get(endpointId) as EndpointSpecVersionRow | undefined;

    return row ? mapVersionRow(row) : null;
  }

  getVersion(endpointId: string, version: number): EndpointSpecVersionRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            endpoint_id,
            version,
            spec_json,
            hash,
            created_at,
            trigger_reason,
            is_current
          FROM endpoint_spec_versions
          WHERE endpoint_id = ? AND version = ?
          LIMIT 1
        `
      )
      .get(endpointId, version) as EndpointSpecVersionRow | undefined;

    return row ? mapVersionRow(row) : null;
  }

  listVersions(endpointId: string): EndpointSpecVersionSummary[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            endpoint_id,
            version,
            spec_json,
            hash,
            created_at,
            trigger_reason,
            is_current
          FROM endpoint_spec_versions
          WHERE endpoint_id = ?
          ORDER BY version DESC
        `
      )
      .all(endpointId) as EndpointSpecVersionRow[];

    return rows.map(mapVersionSummaryRow);
  }
}
