import type {
  ProviderConnectionTestResponse,
  ProviderHeaders,
  ProviderType
} from '@contrix/spec-core';
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
  last_test_success: number | null;
  last_test_message: string | null;
  last_test_latency_ms: number | null;
  last_test_status_code: number | null;
  last_tested_at: string | null;
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

function parseConnectionTest(row: ProviderTableRow): ProviderConnectionTestResponse | null {
  if (
    row.last_test_success === null ||
    row.last_test_message === null ||
    row.last_test_latency_ms === null ||
    !row.last_tested_at
  ) {
    return null;
  }

  return {
    success: row.last_test_success === 1,
    message: row.last_test_message,
    latencyMs: row.last_test_latency_ms,
    providerId: row.id,
    testedAt: row.last_tested_at,
    statusCode: row.last_test_status_code ?? undefined
  };
}

function toConnectionTestColumns(input: ProviderConnectionTestResponse | null): {
  lastTestSuccess: number | null;
  lastTestMessage: string | null;
  lastTestLatencyMs: number | null;
  lastTestStatusCode: number | null;
  lastTestedAt: string | null;
} {
  if (!input) {
    return {
      lastTestSuccess: null,
      lastTestMessage: null,
      lastTestLatencyMs: null,
      lastTestStatusCode: null,
      lastTestedAt: null
    };
  }

  return {
    lastTestSuccess: input.success ? 1 : 0,
    lastTestMessage: input.message,
    lastTestLatencyMs: input.latencyMs,
    lastTestStatusCode: input.statusCode ?? null,
    lastTestedAt: input.testedAt
  };
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
    lastConnectionTest: parseConnectionTest(row),
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
    last_test_success,
    last_test_message,
    last_test_latency_ms,
    last_test_status_code,
    last_tested_at,
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
    const connectionTest = toConnectionTestColumns(input.lastConnectionTest);

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
            last_test_success,
            last_test_message,
            last_test_latency_ms,
            last_test_status_code,
            last_tested_at,
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
            @lastTestSuccess,
            @lastTestMessage,
            @lastTestLatencyMs,
            @lastTestStatusCode,
            @lastTestedAt,
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
        lastTestSuccess: connectionTest.lastTestSuccess,
        lastTestMessage: connectionTest.lastTestMessage,
        lastTestLatencyMs: connectionTest.lastTestLatencyMs,
        lastTestStatusCode: connectionTest.lastTestStatusCode,
        lastTestedAt: connectionTest.lastTestedAt,
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
    const connectionTest = toConnectionTestColumns(input.lastConnectionTest);

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
            last_test_success = @lastTestSuccess,
            last_test_message = @lastTestMessage,
            last_test_latency_ms = @lastTestLatencyMs,
            last_test_status_code = @lastTestStatusCode,
            last_tested_at = @lastTestedAt,
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
        lastTestSuccess: connectionTest.lastTestSuccess,
        lastTestMessage: connectionTest.lastTestMessage,
        lastTestLatencyMs: connectionTest.lastTestLatencyMs,
        lastTestStatusCode: connectionTest.lastTestStatusCode,
        lastTestedAt: connectionTest.lastTestedAt,
        updatedAt: input.updatedAt
      });

    if (result.changes === 0) {
      return null;
    }

    return this.findById(input.id);
  }

  saveConnectionTest(providerId: string, result: ProviderConnectionTestResponse): void {
    const connectionTest = toConnectionTestColumns(result);
    this.db
      .prepare(
        `
          UPDATE providers
          SET
            last_test_success = @lastTestSuccess,
            last_test_message = @lastTestMessage,
            last_test_latency_ms = @lastTestLatencyMs,
            last_test_status_code = @lastTestStatusCode,
            last_tested_at = @lastTestedAt
          WHERE id = @id
        `
      )
      .run({
        id: providerId,
        lastTestSuccess: connectionTest.lastTestSuccess,
        lastTestMessage: connectionTest.lastTestMessage,
        lastTestLatencyMs: connectionTest.lastTestLatencyMs,
        lastTestStatusCode: connectionTest.lastTestStatusCode,
        lastTestedAt: connectionTest.lastTestedAt
      });
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
