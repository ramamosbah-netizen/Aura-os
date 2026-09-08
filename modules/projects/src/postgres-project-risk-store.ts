import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Id, RiskImpact, RiskLikelihood, RiskSeverity } from '@aura/shared';
import type { ProjectDeliveryArea, ProjectRisk, ProjectRiskStatus } from './domain/project-risk';
import type { ProjectRiskFilter, ProjectRiskStore } from './project-risk-store';

/**
 * §21 risk persistence. Tenant scoping is RLS's job here, as everywhere else in this module — the
 * services check the bound tenant before handing a row back (gap register N-08).
 *
 * `date` columns arrive as strings (core/src/events/pg-pool.ts sets that parser); `timestamptz`
 * arrives as a Date, so every one of those goes through `ts()`.
 */

const ts = (v: Date | string | null): string | null =>
  !v ? null : v instanceof Date ? v.toISOString() : String(v);

const day = (v: Date | string | null): string | null =>
  !v ? null : typeof v === 'string' ? v : v.toISOString().slice(0, 10);

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
  acceptance_reason: string | null;
  owner_name: string | null;
  target_date: Date | string | null;
  status: string;
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
    acceptanceReason: r.acceptance_reason,
    owner: r.owner_name,
    targetDate: day(r.target_date),
    status: r.status as ProjectRiskStatus,
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
         severity, mitigation, acceptance_reason, owner_name, target_date, status,
         created_at, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [r.id, r.tenantId, r.projectId, r.reference, r.title, r.description, r.area, r.likelihood,
       r.impact, r.severity, r.mitigation, r.acceptanceReason, r.owner, r.targetDate, r.status,
       r.createdAt, r.createdBy, r.updatedAt],
    );
  }

  async update(r: ProjectRisk): Promise<void> {
    await this.write(this.pool, r);
  }

  async updateWithClient(tx: TxHandle | null, r: ProjectRisk): Promise<void> {
    if (tx === null) return this.update(r);
    await this.write(tx as PoolClient, r);
  }

  private write(executor: Pool | PoolClient, r: ProjectRisk): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_projects_risks
       SET reference=$2, title=$3, description=$4, area=$5, likelihood=$6, impact=$7, severity=$8,
           mitigation=$9, acceptance_reason=$10, owner_name=$11, target_date=$12, status=$13,
           updated_at=$14
       WHERE id=$1`,
      [r.id, r.reference, r.title, r.description, r.area, r.likelihood, r.impact, r.severity,
       r.mitigation, r.acceptanceReason, r.owner, r.targetDate, r.status, r.updatedAt],
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
    // The same set the domain's `PROJECT_RISK_OPEN_STATUSES` holds — kept literal so the two paths
    // cannot drift on what "still carried as an exposure" means.
    if (filter.openOnly) where.push(`status IN ('OPEN', 'MITIGATING', 'ACCEPTED')`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<RiskRow>(
      `SELECT * FROM public.aura_projects_risks ${w} ORDER BY created_at DESC`, params,
    );
    return res.rows.map(rowToRisk);
  }
}
