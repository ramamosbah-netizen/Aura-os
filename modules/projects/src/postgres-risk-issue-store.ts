import type { Pool } from 'pg';
import type { Id, RiskImpact, RiskLikelihood, RiskSeverity, RiskStatus } from '@aura/shared';
import type { ProjectDeliveryArea, ProjectRisk } from './domain/project-risk';
import type { ProjectIssue, ProjectIssueLink, ProjectIssueSeverity, ProjectIssueStatus } from './domain/project-issue';
import type {
  ProjectIssueFilter, ProjectIssueStore, ProjectRiskFilter, ProjectRiskStore,
} from './risk-issue-store';

/**
 * §21 persistence. Tenant scoping is RLS's job here, as everywhere else in this module — the
 * services check the bound tenant before handing a row back (gap register N-08).
 *
 * `date` columns arrive as strings (core/src/events/pg-pool.ts sets that parser); `timestamptz`
 * arrives as a Date, so every one of those goes through `ts()`.
 */

const ts = (v: Date | string | null): string | null => {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
};

const day = (v: Date | string | null): string | null => {
  if (!v) return null;
  return typeof v === 'string' ? v : v.toISOString().slice(0, 10);
};

// ── Risks ──────────────────────────────────────────────────────────────────

interface RiskRow {
  id: string;
  tenant_id: string;
  project_id: string;
  reference: string | null;
  title: string;
  description: string | null;
  area: string;
  likelihood: string;
  impact: string;
  severity: string;
  mitigation: string | null;
  owner_name: string | null;
  target_date: Date | string | null;
  status: string;
  linked_issue_id: string | null;
  created_at: Date | string;
  created_by: string | null;
  updated_at: Date | string;
}

function rowToRisk(r: RiskRow): ProjectRisk {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    projectId: r.project_id,
    reference: r.reference,
    title: r.title,
    description: r.description,
    area: r.area as ProjectDeliveryArea,
    likelihood: r.likelihood as RiskLikelihood,
    impact: r.impact as RiskImpact,
    severity: r.severity as RiskSeverity,
    mitigation: r.mitigation,
    owner: r.owner_name,
    targetDate: day(r.target_date),
    status: r.status as RiskStatus,
    linkedIssueId: r.linked_issue_id,
    createdAt: ts(r.created_at) ?? '',
    createdBy: r.created_by,
    updatedAt: ts(r.updated_at) ?? '',
  };
}

export class PostgresProjectRiskStore implements ProjectRiskStore {
  constructor(private readonly pool: Pool) {}

  async create(r: ProjectRisk): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_risks
        (id, tenant_id, project_id, reference, title, description, area, likelihood, impact,
         severity, mitigation, owner_name, target_date, status, linked_issue_id,
         created_at, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [r.id, r.tenantId, r.projectId, r.reference, r.title, r.description, r.area, r.likelihood,
       r.impact, r.severity, r.mitigation, r.owner, r.targetDate, r.status, r.linkedIssueId,
       r.createdAt, r.createdBy, r.updatedAt],
    );
  }

  async update(r: ProjectRisk): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_risks
       SET reference=$2, title=$3, description=$4, area=$5, likelihood=$6, impact=$7, severity=$8,
           mitigation=$9, owner_name=$10, target_date=$11, status=$12, linked_issue_id=$13,
           updated_at=$14
       WHERE id=$1`,
      [r.id, r.reference, r.title, r.description, r.area, r.likelihood, r.impact, r.severity,
       r.mitigation, r.owner, r.targetDate, r.status, r.linkedIssueId, r.updatedAt],
    );
  }

  async get(id: Id): Promise<ProjectRisk | null> {
    const res = await this.pool.query<RiskRow>('SELECT * FROM public.aura_projects_risks WHERE id = $1', [id]);
    return res.rows.length ? rowToRisk(res.rows[0]) : null;
  }

  async list(filter: ProjectRiskFilter = {}): Promise<ProjectRisk[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
    if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
    if (filter.area) { params.push(filter.area); where.push(`area = $${params.length}`); }
    // The same predicate the domain's `projectRiskIsOpen` encodes — kept literal so the two paths
    // cannot drift on what "still carried as an exposure" means.
    if (filter.openOnly) where.push(`status IN ('OPEN', 'MITIGATING')`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<RiskRow>(
      `SELECT * FROM public.aura_projects_risks ${w} ORDER BY created_at DESC`, params,
    );
    return res.rows.map(rowToRisk);
  }
}

// ── Issues ─────────────────────────────────────────────────────────────────

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

interface LinkRow {
  issue_id: string;
  module: string;
  record_type: string;
  record_id: string;
  label: string | null;
}

function rowToIssue(r: IssueRow, links: ProjectIssueLink[]): ProjectIssue {
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
    links,
    createdAt: ts(r.created_at) ?? '',
    createdBy: r.created_by,
    updatedAt: ts(r.updated_at) ?? '',
  };
}

const toLink = (l: LinkRow): ProjectIssueLink => ({
  module: l.module, recordType: l.record_type, recordId: l.record_id, label: l.label,
});

export class PostgresProjectIssueStore implements ProjectIssueStore {
  constructor(private readonly pool: Pool) {}

  async create(i: ProjectIssue): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_issues
        (id, tenant_id, project_id, reference, title, description, area, severity, status,
         owner_name, raised_at, raised_by, due_date, resolution, resolved_at, resolved_by,
         origin_risk_id, created_at, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [i.id, i.tenantId, i.projectId, i.reference, i.title, i.description, i.area, i.severity,
       i.status, i.owner, i.raisedAt, i.raisedBy, i.dueDate, i.resolution, i.resolvedAt,
       i.resolvedBy, i.originRiskId, i.createdAt, i.createdBy, i.updatedAt],
    );
    await this.writeLinks(i);
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
    // `origin_risk_id` and `raised_by` are provenance: written once, never patched. An issue that
    // could change which risk it came from would make the risk register unauditable.
    await this.writeLinks(i);
  }

  /** Replace the link set. The rows carry no state of their own, so a rewrite loses nothing. */
  private async writeLinks(i: ProjectIssue): Promise<void> {
    await this.pool.query('DELETE FROM public.aura_projects_issue_links WHERE issue_id = $1', [i.id]);
    for (const l of i.links) {
      await this.pool.query(
        `INSERT INTO public.aura_projects_issue_links (issue_id, tenant_id, module, record_type, record_id, label)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [i.id, i.tenantId, l.module, l.recordType, l.recordId, l.label],
      );
    }
  }

  async get(id: Id): Promise<ProjectIssue | null> {
    const res = await this.pool.query<IssueRow>('SELECT * FROM public.aura_projects_issues WHERE id = $1', [id]);
    if (!res.rows.length) return null;
    const links = await this.pool.query<LinkRow>(
      'SELECT * FROM public.aura_projects_issue_links WHERE issue_id = $1 ORDER BY module, record_type, record_id',
      [id],
    );
    return rowToIssue(res.rows[0], links.rows.map(toLink));
  }

  async list(filter: ProjectIssueFilter = {}): Promise<ProjectIssue[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
    if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
    if (filter.area) { params.push(filter.area); where.push(`area = $${params.length}`); }
    if (filter.severity) { params.push(filter.severity); where.push(`severity = $${params.length}`); }
    if (filter.openOnly) where.push(`status IN ('open', 'in_progress')`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<IssueRow>(
      `SELECT * FROM public.aura_projects_issues ${w} ORDER BY raised_at DESC`, params,
    );
    if (!res.rows.length) return [];

    // One query for every link rather than one per issue: this list backs a dashboard, and the
    // N+1 would only show up once a project had a real register.
    const ids = res.rows.map((r) => r.id);
    const links = await this.pool.query<LinkRow>(
      'SELECT * FROM public.aura_projects_issue_links WHERE issue_id = ANY($1::uuid[]) ORDER BY module, record_type, record_id',
      [ids],
    );
    const byIssue = new Map<string, ProjectIssueLink[]>();
    for (const row of links.rows) {
      const bucket = byIssue.get(row.issue_id);
      if (bucket) bucket.push(toLink(row));
      else byIssue.set(row.issue_id, [toLink(row)]);
    }
    return res.rows.map((r) => rowToIssue(r, byIssue.get(r.id) ?? []));
  }
}
