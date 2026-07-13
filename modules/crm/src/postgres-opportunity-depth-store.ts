import type { Pool } from 'pg';
import type {
  Id, Commitment, CommitmentDirection, CommitmentStatus, InfluenceLevel, Sentiment,
  OpportunityDealMember, OpportunityStakeholder, StakeholderRole, DealTeamRole,
} from '@aura/shared';
import type {
  CommitmentFilter, DealTeamFilter, OpportunityDepthStore, StakeholderFilter,
} from './opportunity-depth-store';

// Durable opportunity-depth collections on Postgres (migration 0159).

interface SRow {
  id: string; tenant_id: string; opportunity_id: string; contact_id: string | null; contact_name: string;
  role: string; influence: string; decision_power: boolean; sentiment: string; is_champion: boolean;
  is_primary: boolean; notes: string | null; created_at: Date; updated_at: Date;
}
interface TRow {
  id: string; tenant_id: string; opportunity_id: string; user_id: string; user_name: string | null;
  role: string; responsibility: string | null; active: boolean; joined_at: Date;
}
interface CRow {
  id: string; tenant_id: string; related_type: string; related_id: string; direction: string;
  committed_by: string | null; committed_to: string | null; description: string; due_at: string | null;
  status: string; evidence: string | null; fulfilled_at: Date | null; created_at: Date; updated_at: Date;
}

const S_COLS = 'id, tenant_id, opportunity_id, contact_id, contact_name, role, influence, decision_power, sentiment, is_champion, is_primary, notes, created_at, updated_at';
const T_COLS = 'id, tenant_id, opportunity_id, user_id, user_name, role, responsibility, active, joined_at';
const C_COLS = 'id, tenant_id, related_type, related_id, direction, committed_by, committed_to, description, due_at, status, evidence, fulfilled_at, created_at, updated_at';

const toStakeholder = (r: SRow): OpportunityStakeholder => ({
  id: r.id, tenantId: r.tenant_id, opportunityId: r.opportunity_id, contactId: r.contact_id, contactName: r.contact_name,
  role: r.role as StakeholderRole, influence: r.influence as InfluenceLevel, decisionPower: r.decision_power,
  sentiment: r.sentiment as Sentiment, isChampion: r.is_champion, isPrimary: r.is_primary, notes: r.notes,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const toDealMember = (r: TRow): OpportunityDealMember => ({
  id: r.id, tenantId: r.tenant_id, opportunityId: r.opportunity_id, userId: r.user_id, userName: r.user_name,
  role: r.role as DealTeamRole, responsibility: r.responsibility, active: r.active, joinedAt: r.joined_at.toISOString(),
});
const toCommitment = (r: CRow): Commitment => ({
  id: r.id, tenantId: r.tenant_id, relatedType: r.related_type, relatedId: r.related_id,
  direction: r.direction as CommitmentDirection, committedBy: r.committed_by, committedTo: r.committed_to,
  description: r.description, dueAt: r.due_at, status: r.status as CommitmentStatus, evidence: r.evidence,
  fulfilledAt: r.fulfilled_at ? r.fulfilled_at.toISOString() : null,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

export class PostgresOpportunityDepthStore implements OpportunityDepthStore {
  constructor(private readonly pool: Pool) {}

  async saveStakeholder(s: OpportunityStakeholder): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_opportunity_stakeholders (${S_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET contact_id=EXCLUDED.contact_id, contact_name=EXCLUDED.contact_name,
         role=EXCLUDED.role, influence=EXCLUDED.influence, decision_power=EXCLUDED.decision_power,
         sentiment=EXCLUDED.sentiment, is_champion=EXCLUDED.is_champion, is_primary=EXCLUDED.is_primary,
         notes=EXCLUDED.notes, updated_at=now()`,
      [s.id, s.tenantId, s.opportunityId, s.contactId, s.contactName, s.role, s.influence, s.decisionPower,
       s.sentiment, s.isChampion, s.isPrimary, s.notes, s.createdAt, s.updatedAt],
    );
  }
  async getStakeholder(id: Id): Promise<OpportunityStakeholder | null> {
    const r = await this.pool.query<SRow>(`SELECT ${S_COLS} FROM public.aura_crm_opportunity_stakeholders WHERE id=$1`, [id]);
    return r.rows.length ? toStakeholder(r.rows[0]) : null;
  }
  async listStakeholders(f: StakeholderFilter): Promise<OpportunityStakeholder[]> {
    const r = await this.pool.query<SRow>(
      `SELECT ${S_COLS} FROM public.aura_crm_opportunity_stakeholders
        WHERE tenant_id=$1 AND ($2::text IS NULL OR opportunity_id=$2) ORDER BY created_at ASC`,
      [f.tenantId, f.opportunityId ?? null]);
    return r.rows.map(toStakeholder);
  }
  async deleteStakeholder(id: Id): Promise<void> {
    await this.pool.query(`DELETE FROM public.aura_crm_opportunity_stakeholders WHERE id=$1`, [id]);
  }

  async saveDealMember(m: OpportunityDealMember): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_opportunity_deal_team (${T_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET user_name=EXCLUDED.user_name, role=EXCLUDED.role,
         responsibility=EXCLUDED.responsibility, active=EXCLUDED.active`,
      [m.id, m.tenantId, m.opportunityId, m.userId, m.userName, m.role, m.responsibility, m.active, m.joinedAt],
    );
  }
  async getDealMember(id: Id): Promise<OpportunityDealMember | null> {
    const r = await this.pool.query<TRow>(`SELECT ${T_COLS} FROM public.aura_crm_opportunity_deal_team WHERE id=$1`, [id]);
    return r.rows.length ? toDealMember(r.rows[0]) : null;
  }
  async listDealTeam(f: DealTeamFilter): Promise<OpportunityDealMember[]> {
    const r = await this.pool.query<TRow>(
      `SELECT ${T_COLS} FROM public.aura_crm_opportunity_deal_team
        WHERE tenant_id=$1 AND ($2::text IS NULL OR opportunity_id=$2) ORDER BY joined_at ASC`,
      [f.tenantId, f.opportunityId ?? null]);
    return r.rows.map(toDealMember);
  }
  async deleteDealMember(id: Id): Promise<void> {
    await this.pool.query(`DELETE FROM public.aura_crm_opportunity_deal_team WHERE id=$1`, [id]);
  }

  async saveCommitment(c: Commitment): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_commitments (${C_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET direction=EXCLUDED.direction, committed_by=EXCLUDED.committed_by,
         committed_to=EXCLUDED.committed_to, description=EXCLUDED.description, due_at=EXCLUDED.due_at,
         status=EXCLUDED.status, evidence=EXCLUDED.evidence, fulfilled_at=EXCLUDED.fulfilled_at, updated_at=now()`,
      [c.id, c.tenantId, c.relatedType, c.relatedId, c.direction, c.committedBy, c.committedTo, c.description,
       c.dueAt, c.status, c.evidence, c.fulfilledAt, c.createdAt, c.updatedAt],
    );
  }
  async getCommitment(id: Id): Promise<Commitment | null> {
    const r = await this.pool.query<CRow>(`SELECT ${C_COLS} FROM public.aura_crm_commitments WHERE id=$1`, [id]);
    return r.rows.length ? toCommitment(r.rows[0]) : null;
  }
  async listCommitments(f: CommitmentFilter): Promise<Commitment[]> {
    const r = await this.pool.query<CRow>(
      `SELECT ${C_COLS} FROM public.aura_crm_commitments
        WHERE tenant_id=$1 AND ($2::text IS NULL OR related_type=$2)
          AND ($3::text IS NULL OR related_id=$3) AND ($4::text IS NULL OR status=$4)
        ORDER BY created_at ASC`,
      [f.tenantId, f.relatedType ?? null, f.relatedId ?? null, f.status ?? null]);
    return r.rows.map(toCommitment);
  }
}
