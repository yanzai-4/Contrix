import type { SQLiteDatabase } from '../../db/types.js';
import type { ProjectInsertInput, ProjectRecord, ProjectUpdateInput } from './model.js';

interface ProjectTableRow {
  id: string;
  name: string;
  description: string | null;
  base_instruction: string | null;
  default_provider_id: string | null;
  default_provider_name: string | null;
  api_namespace: string;
  created_at: string;
  updated_at: string;
}

function mapProjectRow(row: ProjectTableRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    baseInstruction: row.base_instruction,
    defaultProviderId: row.default_provider_id,
    defaultProviderName: row.default_provider_name,
    apiNamespace: row.api_namespace,
    enableObservability: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const PROJECT_BASE_SELECT = `
  SELECT
    projects.id,
    projects.name,
    projects.description,
    projects.base_instruction,
    projects.default_provider_id,
    projects.api_namespace,
    projects.created_at,
    projects.updated_at,
    providers.name AS default_provider_name
  FROM projects
  LEFT JOIN providers ON providers.id = projects.default_provider_id
`;

export class ProjectRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  list(): ProjectRecord[] {
    const rows = this.db
      .prepare(`${PROJECT_BASE_SELECT} ORDER BY projects.created_at DESC`)
      .all() as ProjectTableRow[];

    return rows.map(mapProjectRow);
  }

  findById(id: string): ProjectRecord | null {
    const row = this.db
      .prepare(`${PROJECT_BASE_SELECT} WHERE projects.id = ? LIMIT 1`)
      .get(id) as ProjectTableRow | undefined;

    return row ? mapProjectRow(row) : null;
  }

  findByName(name: string): ProjectRecord | null {
    const row = this.db
      .prepare(`${PROJECT_BASE_SELECT} WHERE projects.name = ? COLLATE NOCASE LIMIT 1`)
      .get(name) as ProjectTableRow | undefined;

    return row ? mapProjectRow(row) : null;
  }

  findByApiNamespace(apiNamespace: string): ProjectRecord | null {
    const row = this.db
      .prepare(`${PROJECT_BASE_SELECT} WHERE projects.api_namespace = ? COLLATE NOCASE LIMIT 1`)
      .get(apiNamespace) as ProjectTableRow | undefined;

    return row ? mapProjectRow(row) : null;
  }

  create(input: ProjectInsertInput): ProjectRecord {
    this.db
      .prepare(
        `
          INSERT INTO projects (
            id,
            name,
            description,
            base_instruction,
            default_provider_id,
            api_namespace,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @name,
            @description,
            @baseInstruction,
            @defaultProviderId,
            @apiNamespace,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run({
        id: input.id,
        name: input.name,
        description: input.description,
        baseInstruction: input.baseInstruction,
        defaultProviderId: input.defaultProviderId,
        apiNamespace: input.apiNamespace,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt
      });

    const created = this.findById(input.id);

    if (!created) {
      throw new Error('Project insert succeeded but row could not be reloaded');
    }

    return created;
  }

  update(input: ProjectUpdateInput): ProjectRecord | null {
    const result = this.db
      .prepare(
        `
          UPDATE projects
          SET
            name = @name,
            description = @description,
            base_instruction = @baseInstruction,
            default_provider_id = @defaultProviderId,
            api_namespace = @apiNamespace,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run({
        id: input.id,
        name: input.name,
        description: input.description,
        baseInstruction: input.baseInstruction,
        defaultProviderId: input.defaultProviderId,
        apiNamespace: input.apiNamespace,
        updatedAt: input.updatedAt
      });

    if (result.changes === 0) {
      return null;
    }

    return this.findById(input.id);
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
