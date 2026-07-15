import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Requirement, RequirementPriority, RequirementStatus, ScopeLine, ScopeStatus, SolutionScope } from './domain/solution-scope';
import type { PreAwardStore } from './pre-award-store';

interface ReqRow {
  id: string; tenant_id: string; opportunity_id: string; title: string; detail: string | null;
  priority: string; status: string; created_at: Date; updated_at: Date;
}
interface ScopeRow {
  id: string; tenant_id: string; opportunity_id: string; title: string; status: string;
  lines: ScopeLine[]; total: string; approved_by: string | null; approved_at: Date | null;
  generated_quotation_id: string | null; created_at: Date; updated_at: Date;
}

const REQ_COLS = 'id, tenant_id, opportunity_id, title, detail, priority, status, created_at, updated_at';
const SCOPE_COLS =
  'id, tenant_id, opportunity_id, title, status, lines, total, approved_by, approved_at, generated_quotation_id, created_at, updated_at';

const reqTo = (r: ReqRow): Requirement => ({
  id: r.id, tenantId: r.tenant_id, opportunityId: r.opportunity_id, title: r.title, detail: r.detail,
  priority: r.priority as RequirementPriority, status: r.status as RequirementStatus,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const scopeTo = (r: ScopeRow): SolutionScope => ({
  id: r.id, tenantId: r.tenant_id, opportunityId: r.opportunity_id, title: r.title, status: r.status as ScopeStatus,
  lines: r.lines ?? [], total: Number(r.total), approvedBy: r.approved_by,
  approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
  generatedQuotationId: r.generated_quotation_id,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

export class PostgresPreAwardStore implements PreAwardStore {
  constructor(private readonly pool: Pool) {}

  async saveRequirement(r: Requirement): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_requirements (${REQ_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET title=$4, detail=$5, priority=$6, status=$7, updated_at=$9`,
      [r.id, r.tenantId, r.opportunityId, r.title, r.detail, r.priority, r.status, r.createdAt, r.updatedAt],
    );
  }
  async listRequirements(tenantId: Id, opportunityId: Id): Promise<Requirement[]> {
    const res = await this.pool.query<ReqRow>(
      `SELECT ${REQ_COLS} FROM public.aura_crm_requirements WHERE tenant_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC`,
      [tenantId, opportunityId]);
    return res.rows.map(reqTo);
  }

  async saveScope(s: SolutionScope): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_solution_scopes (${SCOPE_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET title=$4, status=$5, lines=$6, total=$7, approved_by=$8,
         approved_at=$9, generated_quotation_id=$10, updated_at=$12`,
      [s.id, s.tenantId, s.opportunityId, s.title, s.status, JSON.stringify(s.lines), s.total,
       s.approvedBy, s.approvedAt, s.generatedQuotationId, s.createdAt, s.updatedAt],
    );
  }
  async getScope(id: Id): Promise<SolutionScope | null> {
    const res = await this.pool.query<ScopeRow>(
      `SELECT ${SCOPE_COLS} FROM public.aura_crm_solution_scopes WHERE id=$1`, [id]);
    return res.rows.length ? scopeTo(res.rows[0]) : null;
  }
  async listScopes(tenantId: Id, opportunityId: Id): Promise<SolutionScope[]> {
    const res = await this.pool.query<ScopeRow>(
      `SELECT ${SCOPE_COLS} FROM public.aura_crm_solution_scopes WHERE tenant_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC`,
      [tenantId, opportunityId]);
    return res.rows.map(scopeTo);
  }
}
