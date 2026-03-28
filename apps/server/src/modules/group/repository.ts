import type { SQLiteDatabase } from '../../db/types.js';
import type { GroupInsertInput, GroupListFilters, GroupRecord, GroupUpdateInput } from './model.js';

interface GroupTableRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  group_instruction: string | null;
  created_at: string;
  updated_at: string;
}

function mapGroupRow(row: GroupTableRow): GroupRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    groupInstruction: row.group_instruction,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class GroupRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  list(filters: GroupListFilters = {}): GroupRecord[] {
    let query = `
      SELECT
        id,
        project_id,
        name,
        description,
        group_instruction,
        created_at,
        updated_at
      FROM groups
    `;

    const params: string[] = [];

    if (filters.projectId) {
      query += ' WHERE project_id = ?';
      params.push(filters.projectId);
    }

    query += ' ORDER BY created_at ASC';

    const rows = this.db.prepare(query).all(...params) as GroupTableRow[];

    return rows.map(mapGroupRow);
  }

  findById(id: string): GroupRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            project_id,
            name,
            description,
            group_instruction,
            created_at,
            updated_at
          FROM groups
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as GroupTableRow | undefined;

    return row ? mapGroupRow(row) : null;
  }

  findByProjectAndName(projectId: string, name: string): GroupRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            project_id,
            name,
            description,
            group_instruction,
            created_at,
            updated_at
          FROM groups
          WHERE project_id = ? AND name = ? COLLATE NOCASE
          LIMIT 1
        `
      )
      .get(projectId, name) as GroupTableRow | undefined;

    return row ? mapGroupRow(row) : null;
  }

  create(input: GroupInsertInput): GroupRecord {
    this.db
      .prepare(
        `
          INSERT INTO groups (
            id,
            project_id,
            name,
            description,
            group_instruction,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @projectId,
            @name,
            @description,
            @groupInstruction,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run({
        id: input.id,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        groupInstruction: input.groupInstruction,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt
      });

    const created = this.findById(input.id);

    if (!created) {
      throw new Error('Group insert succeeded but row could not be reloaded');
    }

    return created;
  }

  update(input: GroupUpdateInput): GroupRecord | null {
    const result = this.db
      .prepare(
        `
          UPDATE groups
          SET
            name = @name,
            description = @description,
            group_instruction = @groupInstruction,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run({
        id: input.id,
        name: input.name,
        description: input.description,
        groupInstruction: input.groupInstruction,
        updatedAt: input.updatedAt
      });

    if (result.changes === 0) {
      return null;
    }

    return this.findById(input.id);
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
