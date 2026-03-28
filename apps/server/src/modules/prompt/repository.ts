import type { PromptSnapshotModel, PromptSections } from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import type { PromptSnapshotInsertInput } from './model.js';

interface PromptSnapshotRow {
  id: string;
  spec_id: string;
  spec_version: number;
  prompt_hash: string;
  prompt_text: string;
  sections_json: string;
  created_at: string;
}

function parseSections(value: string): PromptSections {
  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored prompt sections are invalid.');
  }

  const candidate = parsed as Record<string, unknown>;

  return {
    instructionBlock: String(candidate.instructionBlock ?? ''),
    schemaBlock: String(candidate.schemaBlock ?? ''),
    constraintsBlock: String(candidate.constraintsBlock ?? ''),
    examplesBlock: String(candidate.examplesBlock ?? ''),
    toneBlock: String(candidate.toneBlock ?? ''),
    fallbackBlock: String(candidate.fallbackBlock ?? ''),
    validationBlock: String(candidate.validationBlock ?? '')
  };
}

function mapPromptSnapshotRow(row: PromptSnapshotRow): PromptSnapshotModel {
  return {
    id: row.id,
    specId: row.spec_id,
    specVersion: row.spec_version,
    promptHash: row.prompt_hash,
    promptText: row.prompt_text,
    sections: parseSections(row.sections_json),
    createdAt: row.created_at
  };
}

export class PromptRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  findById(id: string): PromptSnapshotModel | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            spec_id,
            spec_version,
            prompt_hash,
            prompt_text,
            sections_json,
            created_at
          FROM prompt_snapshots
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as PromptSnapshotRow | undefined;

    return row ? mapPromptSnapshotRow(row) : null;
  }

  findBySpecVersion(specId: string, specVersion: number): PromptSnapshotModel | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            spec_id,
            spec_version,
            prompt_hash,
            prompt_text,
            sections_json,
            created_at
          FROM prompt_snapshots
          WHERE spec_id = ? AND spec_version = ?
          LIMIT 1
        `
      )
      .get(specId, specVersion) as PromptSnapshotRow | undefined;

    return row ? mapPromptSnapshotRow(row) : null;
  }

  upsertSnapshot(input: PromptSnapshotInsertInput): PromptSnapshotModel {
    this.db
      .prepare(
        `
          INSERT INTO prompt_snapshots (
            id,
            spec_id,
            spec_version,
            prompt_hash,
            prompt_text,
            sections_json,
            created_at
          ) VALUES (
            @id,
            @specId,
            @specVersion,
            @promptHash,
            @promptText,
            @sectionsJson,
            @createdAt
          )
          ON CONFLICT(spec_id, spec_version) DO UPDATE SET
            prompt_hash = excluded.prompt_hash,
            prompt_text = excluded.prompt_text,
            sections_json = excluded.sections_json,
            created_at = excluded.created_at
        `
      )
      .run({
        id: input.id,
        specId: input.specId,
        specVersion: input.specVersion,
        promptHash: input.promptHash,
        promptText: input.promptText,
        sectionsJson: JSON.stringify(input.sections),
        createdAt: input.createdAt
      });

    const stored = this.findBySpecVersion(input.specId, input.specVersion);

    if (!stored) {
      throw new Error('Prompt snapshot upsert succeeded but row could not be reloaded.');
    }

    return stored;
  }
}
