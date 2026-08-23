import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ScopeAssistProposal, SuggestedScopeItem, ScopeAssumption, ScopeGap } from './domain/scope-assist';
import type { ScopeAssistStore } from './scope-assist-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  opportunity_id: string;
  version: number | string;
  status: string;
  evidence_fingerprint: string;
  generator: string;
  items: SuggestedScopeItem[] | string;
  assumptions: ScopeAssumption[] | string;
  gaps: ScopeGap[] | string;
  generated_by: string | null;
  generated_at: Date | string;
  accepted_by: string | null;
  accepted_at: Date | string | null;
  accepted_basis_revision_id: string | null;
  created_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const arr = <T>(v: T[] | string): T[] => (typeof v === 'string' ? (JSON.parse(v) as T[]) : (v ?? []));

function rowTo(r: Row): ScopeAssistProposal {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    opportunityId: r.opportunity_id,
    version: Number(r.version),
    status: r.status as ScopeAssistProposal['status'],
    evidenceFingerprint: r.evidence_fingerprint,
    generator: r.generator,
    items: arr<SuggestedScopeItem>(r.items),
    assumptions: arr<ScopeAssumption>(r.assumptions),
    gaps: arr<ScopeGap>(r.gaps),
    generatedBy: r.generated_by,
    generatedAt: iso(r.generated_at),
    acceptedBy: r.accepted_by,
    acceptedAt: r.accepted_at ? iso(r.accepted_at) : null,
    acceptedBasisRevisionId: r.accepted_basis_revision_id,
    createdAt: iso(r.created_at),
  };
}

const COLS =
  'id, tenant_id, company_id, opportunity_id, version, status, evidence_fingerprint, generator, items, assumptions, gaps, generated_by, generated_at, accepted_by, accepted_at, accepted_basis_revision_id, created_at';

export class PostgresScopeAssistStore implements ScopeAssistStore {
  constructor(private readonly pool: Pool) {}

  async save(p: ScopeAssistProposal): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_scope_assist_proposals (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, accepted_by = EXCLUDED.accepted_by, accepted_at = EXCLUDED.accepted_at,
         accepted_basis_revision_id = EXCLUDED.accepted_basis_revision_id`,
      [p.id, p.tenantId, p.companyId, p.opportunityId, p.version, p.status, p.evidenceFingerprint, p.generator,
       JSON.stringify(p.items), JSON.stringify(p.assumptions), JSON.stringify(p.gaps),
       p.generatedBy, p.generatedAt, p.acceptedBy, p.acceptedAt, p.acceptedBasisRevisionId, p.createdAt],
    );
  }

  async get(tenantId: Id, id: Id): Promise<ScopeAssistProposal | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_scope_assist_proposals WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async listForOpportunity(tenantId: Id, opportunityId: Id): Promise<ScopeAssistProposal[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_scope_assist_proposals WHERE tenant_id = $1 AND opportunity_id = $2::uuid ORDER BY version DESC`,
      [tenantId, opportunityId]);
    return res.rows.map(rowTo);
  }
}
