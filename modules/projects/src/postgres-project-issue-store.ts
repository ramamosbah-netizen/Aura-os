import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import type { ProjectDeliveryArea } from './domain/project-risk';
import type {
  ProjectIssue, ProjectIssueReference, ProjectIssueSeverity, ProjectIssueStatus,
} from './domain/project-issue';
import type { ProjectIssueFilter, ProjectIssueStore } from './project-issue-store';

/**
 * §21 issue persistence, including the reference rows.
 *
 * The references are an ADDRESS table with no foreign key to the target — the target lives in
 * another module and a cross-module FK would couple two modules' migrations. Nothing here verifies
 * that a reference still resolves; that is Lineage Referential Integrity's question.
 */

const ts = (v: Date | string | null): string | null =>
  !v ? null : v instanceof Date ? v.toISOString() : String(v);

const day = (v: Date | string | null): string | null =>
  !v ? null : typeof v === 'string' ? v : v.toISOString().slice(0, 10);

interface IssueRow {
  id: string;
  tenant_id: string;
  project_id: string;
  reference: string | null;
  title: string;
  description: string | null;
  area: string;
  severity: string;
  status: string;
  owner_name: string | null;
  raised_at: Date | string;
  raised_by: string | null;
  due_date: Date | string | null;
  resolution: string | null;
  resolved_at: Date | string | null;
  resolved_by: string | null;
  origin_risk_id: string | null;
  created_at: Date | string;
  created_by: string | null;
  updated_at: Date | string;
}

interface RefRow {
  issue_id: string;
  module: string;
  record_type: string;
  record_id: string;
  label: string | null;
}

const toRef = (r: RefRow): ProjectIssueReference => ({
  module: r.module, recordType: r.record_type, recordId: r.record_id, label: r.label,
});

function rowToIssue(r: IssueRow, references: ProjectIssueReference[]): ProjectIssue {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    projectId: r.project_id,
    reference: r.reference,
    title: r.title,
    description: r.description,
    area: r.area as ProjectDeliveryArea,
    severity: r.severity as ProjectIssueSeverity,
    status: r.status as ProjectIssueStatus,
    owner: r.owner_name,
    raisedAt: ts(r.raised_at) ?? '',
    raisedBy: r.raised_by,
    dueDate: day(r.due_date),
    resolution: r.resolution,
    resolvedAt: ts(r.resolved_at),
    resolvedBy: r.resolved_by,
    originRiskId: r.origin_risk_id,
    references,
    createdAt: ts(r.created_at) ?? '',
    createdBy: r.created_by,
    updatedAt: ts(r.updated_at) ?? '',
  };
}

export class PostgresProjectIssueStore implements ProjectIssueStore {
  constructor(private readonly pool: Pool) {}

  async create(i: ProjectIssue): Promise<void> {
    await this.insert(this.pool, i);
  }

  async createWithClient(tx: TxHandle | null, i: ProjectIssue): Promise<void> {
    if (tx === null) return this.create(i);
    await this.insert(tx as PoolClient, i);
  }

  private async insert(executor: Pool | PoolClient, i: ProjectIssue): Promise<void> {
    // origin_risk_id carries UNIQUE and a composite FK on (tenant_id, project_id, origin_risk_id).
    // A second materialisation of the same risk, or one whose provenance crosses a project or a
    // tenant, is refused HERE — by the database, not only by the command that should have caught it.
    await executor.query(
      `INSERT INTO public.aura_projects_issues
        (id, tenant_id, project_id, reference, title, description, area, severity, status,
         owner_name, raised_at, raised_by, due_date, resolution, resolved_at, resolved_by,
         origin_risk_id, created_at, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [i.id, i.tenantId, i.projectId, i.reference, i.title, i.description, i.area, i.severity,
       i.status, i.owner, i.raisedAt, i.raisedBy, i.dueDate, i.resolution, i.resolvedAt,
       i.resolvedBy, i.originRiskId, i.createdAt, i.createdBy, i.updatedAt],
    );
    await this.writeReferences(executor, i);
  }

  async update(i: ProjectIssue): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_issues
       SET reference=$2, title=$3, description=$4, area=$5, severity=$6, status=$7, owner_name=$8,
           raised_at=$9, due_date=$10, resolution=$11, resolved_at=$12, resolved_by=$13,
           updated_at=$14
       WHERE id=$1`,
      [i.id, i.reference, i.title, i.description, i.area, i.severity, i.status, i.owner,
       i.raisedAt, i.dueDate, i.resolution, i.resolvedAt, i.resolvedBy, i.updatedAt],
    );
    // `origin_risk_id`, `project_id` and `raised_by` are provenance: written once, never patched.
    // An issue that could change which risk it came from would make the risk register unauditable.
    await this.writeReferences(this.pool, i);
  }

  /** Replace the reference set. The rows carry no state of their own, so a rewrite loses nothing. */
  private async writeReferences(executor: Pool | PoolClient, i: ProjectIssue): Promise<void> {
    await executor.query('DELETE FROM public.aura_projects_issue_references WHERE issue_id = $1', [i.id]);
    for (const r of i.references) {
      await executor.query(
        `INSERT INTO public.aura_projects_issue_references
           (issue_id, tenant_id, module, record_type, record_id, label)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [i.id, i.tenantId, r.module, r.recordType, r.recordId, r.label],
      );
    }
  }

  async get(id: Id): Promise<ProjectIssue | null> {
    const res = await this.pool.query<IssueRow>('SELECT * FROM public.aura_projects_issues WHERE id = $1', [id]);
    return res.rows.length ? this.hydrateOne(res.rows[0]) : null;
  }

  async findByOriginRisk(riskId: Id): Promise<ProjectIssue | null> {
    const res = await this.pool.query<IssueRow>(
      'SELECT * FROM public.aura_projects_issues WHERE origin_risk_id = $1', [riskId]);
    return res.rows.length ? this.hydrateOne(res.rows[0]) : null;
  }

  private async hydrateOne(row: IssueRow): Promise<ProjectIssue> {
    const refs = await this.pool.query<RefRow>(
      `SELECT * FROM public.aura_projects_issue_references WHERE issue_id = $1
       ORDER BY module, record_type, record_id`, [row.id]);
    return rowToIssue(row, refs.rows.map(toRef));
  }

  async list(filter: ProjectIssueFilter = {}): Promise<ProjectIssue[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
    if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
    if (filter.area) { params.push(filter.area); where.push(`area = $${params.length}`); }
    if (filter.severity) { params.push(filter.severity); where.push(`severity = $${params.length}`); }
    if (filter.openOnly) where.push(`status IN ('open', 'in_progress')`);
    if (filter.fromRiskOnly) where.push('origin_risk_id IS NOT NULL');
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = filter.limit ? ` LIMIT ${Number(filter.limit)}` : '';
    const res = await this.pool.query<IssueRow>(
      `SELECT * FROM public.aura_projects_issues ${w} ORDER BY raised_at DESC${lim}`, params,
    );
    if (!res.rows.length) return [];

    // One query for every reference rather than one per issue: this list backs a dashboard, and
    // the N+1 would only show up once a project had a real register.
    const refs = await this.pool.query<RefRow>(
      `SELECT * FROM public.aura_projects_issue_references WHERE issue_id = ANY($1::uuid[])
       ORDER BY module, record_type, record_id`,
      [res.rows.map((r) => r.id)],
    );
    const byIssue = new Map<string, ProjectIssueReference[]>();
    for (const row of refs.rows) {
      const bucket = byIssue.get(row.issue_id);
      if (bucket) bucket.push(toRef(row));
      else byIssue.set(row.issue_id, [toRef(row)]);
    }
    return res.rows.map((r) => rowToIssue(r, byIssue.get(r.id) ?? []));
  }
}
