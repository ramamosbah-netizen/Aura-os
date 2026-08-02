import type { Pool } from 'pg';
import type { CampaignStore } from './campaign-store';
import type { Campaign, CampaignChannel, CampaignStatus } from './domain/campaign';

interface Row {
  id: string; tenant_id: string; company_id: string | null; name: string; channel: string;
  status: string; budget: string; start_date: string | null; end_date: string | null;
  target_leads: number; leads_generated: number; won_value: string; notes: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
const COLS = `id, tenant_id, company_id, name, channel, status, budget, start_date::text, end_date::text,
  target_leads, leads_generated, won_value, notes, created_by, created_at, updated_at`;
const INS = `id, tenant_id, company_id, name, channel, status, budget, start_date, end_date,
  target_leads, leads_generated, won_value, notes, created_by, created_at, updated_at`;

function toC(r: Row): Campaign {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, name: r.name,
    channel: r.channel as CampaignChannel, status: r.status as CampaignStatus, budget: Number(r.budget),
    startDate: r.start_date, endDate: r.end_date, targetLeads: Number(r.target_leads),
    leadsGenerated: Number(r.leads_generated), wonValue: Number(r.won_value), notes: r.notes,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}

export class PostgresCampaignStore implements CampaignStore {
  constructor(private readonly pool: Pool) {}
  async save(c: Campaign): Promise<void> {
    await this.pool.query(
      `insert into public.aura_crm_campaigns (${INS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (id) do update set name=excluded.name, channel=excluded.channel, status=excluded.status,
         budget=excluded.budget, start_date=excluded.start_date, end_date=excluded.end_date,
         target_leads=excluded.target_leads, leads_generated=excluded.leads_generated,
         won_value=excluded.won_value, notes=excluded.notes, updated_at=excluded.updated_at`,
      [c.id, c.tenantId, c.companyId, c.name, c.channel, c.status, c.budget, c.startDate, c.endDate,
       c.targetLeads, c.leadsGenerated, c.wonValue, c.notes, c.createdBy, c.createdAt, c.updatedAt],
    );
  }
  async find(id: string, tenantId: string): Promise<Campaign | null> {
    const r = await this.pool.query<Row>(`select ${COLS} from public.aura_crm_campaigns where id=$1 and tenant_id=$2`, [id, tenantId]);
    return r.rows[0] ? toC(r.rows[0]) : null;
  }
  async list(tenantId: string, status?: string): Promise<Campaign[]> {
    const r = status
      ? await this.pool.query<Row>(`select ${COLS} from public.aura_crm_campaigns where tenant_id=$1 and status=$2 order by created_at desc limit 500`, [tenantId, status])
      : await this.pool.query<Row>(`select ${COLS} from public.aura_crm_campaigns where tenant_id=$1 order by created_at desc limit 500`, [tenantId]);
    return r.rows.map(toC);
  }
}
