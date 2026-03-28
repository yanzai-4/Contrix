import type { InputMode, SpecStatus, SpecTriggerReason } from '@contrix/spec-core';
import { buildRuntimeRoutePreview } from '@contrix/spec-core';
import type { SQLiteDatabase } from '../../db/types.js';
import type {
  EndpointInsertInput,
  EndpointListFilters,
  EndpointRecord,
  EndpointSchemaUpdateInput,
  EndpointUpdateInput
} from './model.js';

interface EndpointTableRow {
  id: string;
  project_id: string;
  project_api_namespace: string;
  group_id: string | null;
  provider_id: string | null;
  provider_name: string | null;
  group_name: string | null;
  name: string;
  path_slug: string;
  model: string | null;
  endpoint_instruction: string | null;
  description: string | null;
  constraints_text: string | null;
  examples_text: string | null;
  tone: string | null;
  fallback_text: string | null;
  validation_text: string | null;
  timeout_ms: number | null;
  enable_structured_output: number;
  enable_deterministic_repair: number;
  max_api_retries: number;
  max_repair_rounds: number;
  temperature: number | null;
  top_p: number | null;
  spec_status: SpecStatus;
  created_at: string;
  updated_at: string;
}

interface EndpointSchemaRow {
  endpoint_id: string;
  input_mode: InputMode;
  input_schema: string | null;
  output_schema: string | null;
  schema_updated_at: string | null;
}

function mapEndpointRow(row: EndpointTableRow): EndpointRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    groupId: row.group_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    groupName: row.group_name,
    name: row.name,
    pathSlug: row.path_slug,
    model: row.model,
    endpointInstruction: row.endpoint_instruction,
    description: row.description,
    rules: row.constraints_text,
    examples: row.examples_text,
    tone: row.tone,
    fallback: row.fallback_text,
    validation: row.validation_text,
    timeoutMs: row.timeout_ms,
    enableStructuredOutput: row.enable_structured_output === 1,
    enableDeterministicRepair: row.enable_deterministic_repair === 1,
    maxApiRetries: row.max_api_retries,
    maxRepairRounds: row.max_repair_rounds,
    temperature: row.temperature,
    topP: row.top_p,
    routePreview: buildRuntimeRoutePreview(row.project_api_namespace, row.path_slug),
    specStatus: row.spec_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const BASE_QUERY = `
  SELECT
    endpoints.id,
    endpoints.project_id,
    projects.api_namespace AS project_api_namespace,
    endpoints.group_id,
    endpoints.provider_id,
    endpoints.name,
    endpoints.path_slug,
    endpoints.model,
    endpoints.endpoint_instruction,
    endpoints.description,
    endpoints.constraints_text,
    endpoints.examples_text,
    endpoints.tone,
    endpoints.fallback_text,
    endpoints.validation_text,
    endpoints.timeout_ms,
    endpoints.enable_structured_output,
    endpoints.enable_deterministic_repair,
    endpoints.max_api_retries,
    endpoints.max_repair_rounds,
    endpoints.temperature,
    endpoints.top_p,
    endpoints.spec_status,
    endpoints.created_at,
    endpoints.updated_at,
    providers.name AS provider_name,
    groups.name AS group_name
  FROM endpoints
  LEFT JOIN providers ON providers.id = endpoints.provider_id
  LEFT JOIN groups ON groups.id = endpoints.group_id
  INNER JOIN projects ON projects.id = endpoints.project_id
`;

export class EndpointRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  private ensureRuntimeStateRows(endpointIds: string[], specStatus: SpecStatus, updatedAt: string): void {
    if (endpointIds.length === 0) {
      return;
    }

    const insert = this.db.prepare(`
      INSERT INTO endpoint_runtime_state (
        endpoint_id,
        current_spec_id,
        current_spec_version,
        spec_status,
        current_prompt_snapshot_id,
        current_prompt_hash,
        prompt_status,
        last_prompt_compiled_at,
        last_prompt_compile_error,
        runtime_readiness,
        last_runtime_checked_at,
        updated_at
      ) VALUES (
        @endpointId,
        NULL,
        NULL,
        @specStatus,
        NULL,
        NULL,
        'missing',
        NULL,
        NULL,
        'not_ready',
        NULL,
        @updatedAt
      )
      ON CONFLICT(endpoint_id) DO NOTHING
    `);

    const tx = this.db.transaction((ids: string[]) => {
      for (const endpointId of ids) {
        insert.run({
          endpointId,
          specStatus,
          updatedAt
        });
      }
    });

    tx(endpointIds);
  }

  private syncRuntimeStateForSpecStatus(endpointIds: string[], status: SpecStatus, updatedAt: string): void {
    if (endpointIds.length === 0) {
      return;
    }

    this.ensureRuntimeStateRows(endpointIds, status, updatedAt);

    let sql = '';
    if (status === 'stale') {
      sql = `
        UPDATE endpoint_runtime_state
        SET
          spec_status = 'stale',
          prompt_status = CASE
            WHEN prompt_status = 'missing' THEN 'missing'
            ELSE 'stale'
          END,
          runtime_readiness = 'not_ready',
          updated_at = @updatedAt
        WHERE endpoint_id = @endpointId
      `;
    } else if (status === 'current') {
      sql = `
        UPDATE endpoint_runtime_state
        SET
          spec_status = 'current',
          updated_at = @updatedAt
        WHERE endpoint_id = @endpointId
      `;
    } else {
      sql = `
        UPDATE endpoint_runtime_state
        SET
          current_spec_id = NULL,
          current_spec_version = NULL,
          spec_status = 'missing',
          current_prompt_snapshot_id = NULL,
          current_prompt_hash = NULL,
          prompt_status = 'missing',
          runtime_readiness = 'not_ready',
          updated_at = @updatedAt
        WHERE endpoint_id = @endpointId
      `;
    }

    const update = this.db.prepare(sql);
    const tx = this.db.transaction((ids: string[]) => {
      for (const endpointId of ids) {
        update.run({
          endpointId,
          updatedAt
        });
      }
    });

    tx(endpointIds);
  }

  private upsertPendingTriggerReason(endpointIds: string[], triggerReason: SpecTriggerReason): void {
    if (endpointIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const upsert = this.db.prepare(`
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
        @triggerReason
      )
      ON CONFLICT(endpoint_id) DO UPDATE SET
        pending_trigger_reason = excluded.pending_trigger_reason,
        updated_at = excluded.updated_at
    `);

    const tx = this.db.transaction((ids: string[]) => {
      for (const endpointId of ids) {
        upsert.run({
          endpointId,
          updatedAt: now,
          triggerReason
        });
      }
    });

    tx(endpointIds);
  }

  list(filters: EndpointListFilters = {}): EndpointRecord[] {
    let query = BASE_QUERY;
    const params: string[] = [];
    const conditions: string[] = [];

    if (filters.projectId) {
      conditions.push('endpoints.project_id = ?');
      params.push(filters.projectId);
    }

    if (filters.groupId) {
      conditions.push('endpoints.group_id = ?');
      params.push(filters.groupId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY endpoints.created_at DESC';

    const rows = this.db.prepare(query).all(...params) as EndpointTableRow[];

    return rows.map(mapEndpointRow);
  }

  findById(id: string): EndpointRecord | null {
    const row = this.db
      .prepare(`${BASE_QUERY} WHERE endpoints.id = ? LIMIT 1`)
      .get(id) as EndpointTableRow | undefined;

    return row ? mapEndpointRow(row) : null;
  }

  findByProjectAndSlug(projectId: string, pathSlug: string): EndpointRecord | null {
    const row = this.db
      .prepare(
        `${BASE_QUERY}
         WHERE endpoints.project_id = ? AND endpoints.path_slug = ? COLLATE NOCASE
         LIMIT 1`
      )
      .get(projectId, pathSlug) as EndpointTableRow | undefined;

    return row ? mapEndpointRow(row) : null;
  }

  findByNamespaceAndPathSlug(namespace: string, pathSlug: string): EndpointRecord | null {
    const normalizedNamespace = namespace.trim();
    const normalizedPathSlug = pathSlug.trim();

    if (!normalizedNamespace || !normalizedPathSlug) {
      return null;
    }

    const row = this.db
      .prepare(
        `${BASE_QUERY}
         WHERE projects.api_namespace = ? COLLATE NOCASE
           AND endpoints.path_slug = ? COLLATE NOCASE
         LIMIT 1`
      )
      .get(normalizedNamespace, normalizedPathSlug) as EndpointTableRow | undefined;

    return row ? mapEndpointRow(row) : null;
  }

  create(input: EndpointInsertInput): EndpointRecord {
    this.db
      .prepare(
        `
          INSERT INTO endpoints (
            id,
            project_id,
            group_id,
            provider_id,
            name,
            path_slug,
            model,
            endpoint_instruction,
            description,
            constraints_text,
            examples_text,
            tone,
            fallback_text,
            validation_text,
            timeout_ms,
            enable_structured_output,
            enable_deterministic_repair,
            max_api_retries,
            max_repair_rounds,
            temperature,
            top_p,
            input_mode,
            spec_status,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @projectId,
            @groupId,
            @providerId,
            @name,
            @pathSlug,
            @model,
            @endpointInstruction,
            @description,
            @rules,
            @examples,
            @tone,
            @fallback,
            @validation,
            @timeoutMs,
            @enableStructuredOutput,
            @enableDeterministicRepair,
            @maxApiRetries,
            @maxRepairRounds,
            @temperature,
            @topP,
            @inputMode,
            @specStatus,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run({
        id: input.id,
        projectId: input.projectId,
        groupId: input.groupId,
        providerId: input.providerId,
        name: input.name,
        pathSlug: input.pathSlug,
        model: input.model,
        endpointInstruction: input.endpointInstruction,
        description: input.description,
        rules: input.rules,
        examples: input.examples,
        tone: input.tone,
        fallback: input.fallback,
        validation: input.validation,
        timeoutMs: input.timeoutMs,
        enableStructuredOutput: input.enableStructuredOutput ? 1 : 0,
        enableDeterministicRepair: input.enableDeterministicRepair ? 1 : 0,
        maxApiRetries: input.maxApiRetries,
        maxRepairRounds: input.maxRepairRounds,
        temperature: input.temperature,
        topP: input.topP,
        inputMode: 'json',
        specStatus: input.specStatus,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt
      });

    this.ensureRuntimeStateRows([input.id], input.specStatus, input.updatedAt);

    const created = this.findById(input.id);

    if (!created) {
      throw new Error('Endpoint insert succeeded but row could not be reloaded');
    }

    return created;
  }

  update(input: EndpointUpdateInput): EndpointRecord | null {
    const result = this.db
      .prepare(
        `
          UPDATE endpoints
          SET
            group_id = @groupId,
            provider_id = @providerId,
            name = @name,
            path_slug = @pathSlug,
            model = @model,
            endpoint_instruction = @endpointInstruction,
            description = @description,
            constraints_text = @rules,
            examples_text = @examples,
            tone = @tone,
            fallback_text = @fallback,
            validation_text = @validation,
            timeout_ms = @timeoutMs,
            enable_structured_output = @enableStructuredOutput,
            enable_deterministic_repair = @enableDeterministicRepair,
            max_api_retries = @maxApiRetries,
            max_repair_rounds = @maxRepairRounds,
            temperature = @temperature,
            top_p = @topP,
            spec_status = @specStatus,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run({
        id: input.id,
        groupId: input.groupId,
        providerId: input.providerId,
        name: input.name,
        pathSlug: input.pathSlug,
        model: input.model,
        endpointInstruction: input.endpointInstruction,
        description: input.description,
        rules: input.rules,
        examples: input.examples,
        tone: input.tone,
        fallback: input.fallback,
        validation: input.validation,
        timeoutMs: input.timeoutMs,
        enableStructuredOutput: input.enableStructuredOutput ? 1 : 0,
        enableDeterministicRepair: input.enableDeterministicRepair ? 1 : 0,
        maxApiRetries: input.maxApiRetries,
        maxRepairRounds: input.maxRepairRounds,
        temperature: input.temperature,
        topP: input.topP,
        specStatus: input.specStatus,
        updatedAt: input.updatedAt
      });

    if (result.changes === 0) {
      return null;
    }

    return this.findById(input.id);
  }

  getSchemaByEndpointId(endpointId: string): EndpointSchemaRow | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id AS endpoint_id,
            input_mode,
            input_schema,
            output_schema,
            schema_updated_at
          FROM endpoints
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(endpointId) as EndpointSchemaRow | undefined;

    return row ?? null;
  }

  updateSchema(input: EndpointSchemaUpdateInput): boolean {
    const result = this.db
      .prepare(
        `
          UPDATE endpoints
          SET
            input_mode = @inputMode,
            input_schema = @inputSchema,
            output_schema = @outputSchema,
            schema_updated_at = @schemaUpdatedAt,
            spec_status = @specStatus,
            updated_at = @schemaUpdatedAt
          WHERE id = @id
        `
      )
      .run({
        id: input.id,
        inputMode: input.inputMode,
        inputSchema: input.inputSchema,
        outputSchema: input.outputSchema,
        schemaUpdatedAt: input.schemaUpdatedAt,
        specStatus: input.specStatus
      });

    return result.changes > 0;
  }

  markSpecStatusByEndpointId(
    endpointId: string,
    status: SpecStatus,
    triggerReason: SpecTriggerReason = 'system_rebuild'
  ): void {
    const now = new Date().toISOString();

    this.db.prepare('UPDATE endpoints SET spec_status = ?, updated_at = ? WHERE id = ?').run(status, now, endpointId);
    this.syncRuntimeStateForSpecStatus([endpointId], status, now);

    if (status === 'stale') {
      this.upsertPendingTriggerReason([endpointId], triggerReason);
    }
  }

  markSpecStatusByGroupId(
    groupId: string,
    status: SpecStatus,
    triggerReason: SpecTriggerReason = 'group_updated'
  ): void {
    const now = new Date().toISOString();

    this.db.prepare('UPDATE endpoints SET spec_status = ?, updated_at = ? WHERE group_id = ?').run(
      status,
      now,
      groupId
    );

    const rows = this.db.prepare('SELECT id FROM endpoints WHERE group_id = ?').all(groupId) as Array<{
      id: string;
    }>;
    const endpointIds = rows.map((row) => row.id);
    this.syncRuntimeStateForSpecStatus(endpointIds, status, now);

    if (status === 'stale') {
      this.upsertPendingTriggerReason(
        endpointIds,
        triggerReason
      );
    }
  }

  markSpecStatusByProjectId(
    projectId: string,
    status: SpecStatus,
    triggerReason: SpecTriggerReason = 'project_updated'
  ): void {
    const now = new Date().toISOString();

    this.db.prepare('UPDATE endpoints SET spec_status = ?, updated_at = ? WHERE project_id = ?').run(
      status,
      now,
      projectId
    );

    const rows = this.db
      .prepare('SELECT id FROM endpoints WHERE project_id = ?')
      .all(projectId) as Array<{ id: string }>;
    const endpointIds = rows.map((row) => row.id);
    this.syncRuntimeStateForSpecStatus(endpointIds, status, now);

    if (status === 'stale') {
      this.upsertPendingTriggerReason(
        endpointIds,
        triggerReason
      );
    }
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

