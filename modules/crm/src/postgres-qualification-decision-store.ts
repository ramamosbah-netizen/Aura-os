import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { LeadStatus } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { QualificationDecision, QualificationEvidenceSnapshot } from './domain/qualification-decision';
import type { QualificationDecisionStore } from './qualification-decision-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  lead_id: string;
  from_status: string;
  to_status: string;
  qualified_by: string | null;
  qualified_at: Date;
  evidence_snapshot: QualificationEvidenceSnapshot;
  reason: string | null;
  created_at: Date;
}

const COLS =
  'id, tenant_id, company_id, lead_id, from_status, to_status, qualified_by, qualified_at, ' +
  'evidence_snapshot, reason, created_at';

function rowTo(r: Row): QualificationDecision {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    leadId: r.lead_id,
    fromStatus: r.from_status as LeadStatus,
    toStatus: 'qualified',
    qualifiedBy: r.qualified_by,
    qualifiedAt: r.qualified_at.toISOString(),
    evidenceSnapshot: r.evidence_snapshot,
    reason: r.reason,
    createdAt: r.created_at.toISOString(),
  };
}

export class PostgresQualificationDecisionStore implements QualificationDecisionStore {
  constructor(private readonly pool: Pool) {}

  async append(d: QualificationDecision): Promise<void> {
    await this.insert(this.pool, d);
  }

  async appendWithClient(tx: TxHandle | null, d: QualificationDecision): Promise<void> {
    if (tx === null) return this.append(d);
    await this.insert(tx as PoolClient, d);
  }

  private insert(executor: Pool | PoolClient, d: QualificationDecision): Promise<unknown> {
    // ON CONFLICT DO NOTHING keeps it append-only and idempotent — a decision id is written once.
    return executor.query(
      `INSERT INTO public.aura_crm_lead_qualification_decisions (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        d.id, d.tenantId, d.companyId, d.leadId, d.fromStatus, d.toStatus, d.qualifiedBy,
        d.qualifiedAt, JSON.stringify(d.evidenceSnapshot), d.reason, d.createdAt,
      ],
    );
  }

  async get(id: Id): Promise<QualificationDecision | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_lead_qualification_decisions WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async listForLead(tenantId: Id, leadId: Id): Promise<QualificationDecision[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_lead_qualification_decisions
       WHERE tenant_id = $1 AND lead_id = $2 ORDER BY qualified_at DESC`,
      [tenantId, leadId]);
    return res.rows.map(rowTo);
  }
}
