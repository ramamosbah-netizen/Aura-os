import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ProjectResponsibility, ProjectResponsibilityStatus, ProjectResponsibilityWorkstream } from './domain/project-responsibility';
import type { ProjectResponsibilityFilter, ProjectResponsibilityStore } from './project-responsibility-store';

interface Row {
  id: string; tenant_id: string; project_id: string; workstream: string; wbs_node_id: string | null; title: string;
  description: string | null; assignee_id: string; assigned_by: string; due_date: Date | string | null;
  status: string; accepted_at: Date | string | null; started_at: Date | string | null;
  completed_at: Date | string | null; source_type: string | null; source_id: string | null;
  source_reference: string | null; source_revision: string | null; transmittal_ref: string | null;
  linked_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
}
const iso = (value: Date | string | null): string | null => value === null ? null : value instanceof Date ? value.toISOString() : String(value);
const day = (value: Date | string | null): string | null => value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const fromRow = (row: Row): ProjectResponsibility => ({
  id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
  workstream: row.workstream as ProjectResponsibilityWorkstream, wbsNodeId: row.wbs_node_id, title: row.title, description: row.description,
  assigneeId: row.assignee_id, assignedBy: row.assigned_by, dueDate: day(row.due_date),
  status: row.status as ProjectResponsibilityStatus, acceptedAt: iso(row.accepted_at), startedAt: iso(row.started_at),
  completedAt: iso(row.completed_at), createdAt: iso(row.created_at) ?? '', updatedAt: iso(row.updated_at) ?? '',
  sourceType: row.source_type as ProjectResponsibility['sourceType'], sourceId: row.source_id,
  sourceReference: row.source_reference, sourceRevision: row.source_revision,
  transmittalRef: row.transmittal_ref, linkedAt: iso(row.linked_at),
});

export class PostgresProjectResponsibilityStore implements ProjectResponsibilityStore {
  constructor(private readonly pool: Pool) {}
  async create(v: ProjectResponsibility): Promise<void> {
    await this.pool.query(
      `insert into public.aura_projects_responsibilities
       (id, tenant_id, project_id, workstream, wbs_node_id, title, description, assignee_id, assigned_by, due_date,
        status, accepted_at, started_at, completed_at, source_type, source_id, source_reference,
        source_revision, transmittal_ref, linked_at, created_at, updated_at)
       values ($1,$2,$3,$4,$22,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [v.id, v.tenantId, v.projectId, v.workstream, v.title, v.description, v.assigneeId, v.assignedBy,
       v.dueDate, v.status, v.acceptedAt, v.startedAt, v.completedAt, v.sourceType, v.sourceId,
       v.sourceReference, v.sourceRevision, v.transmittalRef, v.linkedAt, v.createdAt, v.updatedAt, v.wbsNodeId],
    );
  }
  async update(v: ProjectResponsibility, expectedUpdatedAt?: string): Promise<boolean> {
    const result = await this.pool.query(
      `update public.aura_projects_responsibilities set status=$2, accepted_at=$3, started_at=$4,
       completed_at=$5, source_type=$6, source_id=$7, source_reference=$8, source_revision=$9,
       transmittal_ref=$10, linked_at=$11, updated_at=$12 where id=$1 and tenant_id=$13
       and ($14::timestamptz is null or updated_at=$14::timestamptz)`,
      [v.id, v.status, v.acceptedAt, v.startedAt, v.completedAt, v.sourceType, v.sourceId,
       v.sourceReference, v.sourceRevision, v.transmittalRef, v.linkedAt, v.updatedAt, v.tenantId,
       expectedUpdatedAt ?? null],
    );
    return (result.rowCount ?? 0) === 1;
  }
  async get(id: Id): Promise<ProjectResponsibility | null> {
    const result = await this.pool.query<Row>('select * from public.aura_projects_responsibilities where id=$1', [id]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }
  async list(filter: ProjectResponsibilityFilter): Promise<ProjectResponsibility[]> {
    const params: unknown[] = [filter.tenantId];
    const where = ['tenant_id=$1'];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id=$${params.length}`); }
    if (filter.assigneeId) { params.push(filter.assigneeId); where.push(`assignee_id=$${params.length}`); }
    if (filter.openOnly) where.push("status <> 'completed'");
    params.push(filter.limit ?? 1000);
    const result = await this.pool.query<Row>(
      `select * from public.aura_projects_responsibilities where ${where.join(' and ')}
       order by due_date asc nulls last, updated_at desc limit $${params.length}`, params,
    );
    return result.rows.map(fromRow);
  }
}
