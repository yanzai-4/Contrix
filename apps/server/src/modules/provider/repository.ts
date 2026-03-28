import type { ProviderHeaders, ProviderType } from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import type { ProviderInsertInput, ProviderRecord, ProviderUpdateInput } from './model.js';

interface ProviderTableRow {
  id: string;
  name: string;
  type: ProviderType;
  base_url: string | null;
  api_key_encrypted: string;
  default_model: string;
  supports_structured_output: number;
  timeout_ms: number;
  headers_json: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function parseHeaders(headersJson: string): ProviderHeaders {
  try {
    const parsed = JSON.parse(headersJson) as unknown;

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    const result: ProviderHeaders = {};

    for (const [key, value] of Object.entries(parsed)) {
      result[key] = String(value);
    }

    return result;
  } catch {
    return {};
  }
}

function mapRow(row: ProviderTableRow): ProviderRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    apiKeyEncrypted: row.api_key_encrypted,
    defaultModel: row.default_model,
    supportsStructuredOutput: row.supports_structured_output === 1,
    timeoutMs: row.timeout_ms,
    headers: parseHeaders(row.headers_json),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const PROVIDER_SELECT = `
  SELECT
    id,
    name,
    type,
    base_url,
    api_key_encrypted,
    default_model,
    supports_structured_output,
    timeout_ms,
    headers_json,
    notes,
    created_at,
    updated_at
  FROM providers
`;

export class ProviderRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  list(): ProviderRecord[] {
    const rows = this.db.prepare(`${PROVIDER_SELECT} ORDER BY created_at DESC`).all() as ProviderTableRow[];
    return rows.map(mapRow);
  }

  findById(id: string): ProviderRecord | null {
    const row = this.db.prepare(`${PROVIDER_SELECT} WHERE id = ? LIMIT 1`).get(id) as
      | ProviderTableRow
      | undefined;

    return row ? mapRow(row) : null;
  }

  findByName(name: string): ProviderRecord | null {
    const row = this.db.prepare(`${PROVIDER_SELECT} WHERE name = ? COLLATE NOCASE LIMIT 1`).get(name) as
      | ProviderTableRow
      | undefined;

    return row ? mapRow(row) : null;
  }

  create(input: ProviderInsertInput): ProviderRecord {
    this.db
      .prepare(
        `
          INSERT INTO providers (
            id,
            name,
            type,
            base_url,
            api_key_encrypted,
            default_model,
            supports_structured_output,
            timeout_ms,
            headers_json,
            notes,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @name,
            @type,
            @baseUrl,
            @apiKeyEncrypted,
            @defaultModel,
            @supportsStructuredOutput,
            @timeoutMs,
            @headersJson,
            @notes,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run({
        id: input.id,
        name: input.name,
        type: input.type,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: input.apiKeyEncrypted,
        defaultModel: input.defaultModel,
        supportsStructuredOutput: input.supportsStructuredOutput ? 1 : 0,
        timeoutMs: input.timeoutMs,
        headersJson: JSON.stringify(input.headers),
        notes: input.notes,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt
      });

    const created = this.findById(input.id);

    if (!created) {
      throw new Error('Provider insert succeeded but row could not be reloaded');
    }

    return created;
  }

  update(input: ProviderUpdateInput): ProviderRecord | null {
    const result = this.db
      .prepare(
        `
          UPDATE providers
          SET
            name = @name,
            type = @type,
            base_url = @baseUrl,
            api_key_encrypted = @apiKeyEncrypted,
            default_model = @defaultModel,
            supports_structured_output = @supportsStructuredOutput,
            timeout_ms = @timeoutMs,
            headers_json = @headersJson,
            notes = @notes,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run({
        id: input.id,
        name: input.name,
        type: input.type,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: input.apiKeyEncrypted,
        defaultModel: input.defaultModel,
        supportsStructuredOutput: input.supportsStructuredOutput ? 1 : 0,
        timeoutMs: input.timeoutMs,
        headersJson: JSON.stringify(input.headers),
        notes: input.notes,
        updatedAt: input.updatedAt
      });

    if (result.changes === 0) {
      return null;
    }

    return this.findById(input.id);
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
