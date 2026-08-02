import { type Id, newId } from '@aura/shared';

// CRM domain — framework-free. A Campaign is a top-of-funnel marketing effort (email blast, event,
// referral push, paid ads) with a budget and the results it produced. It fills the pre-lead stage
// of the funnel and answers "which marketing spend actually generated pipeline" via ROI + cost/lead.

export type CampaignChannel = 'email' | 'event' | 'referral' | 'web' | 'social' | 'paid_ads' | 'other';
export type CampaignStatus = 'planned' | 'active' | 'completed';

export const CAMPAIGN_CHANNELS: CampaignChannel[] = ['email', 'event', 'referral', 'web', 'social', 'paid_ads', 'other'];

export interface Campaign {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  budget: number;
  startDate: string | null;
  endDate: string | null;
  targetLeads: number;
  leadsGenerated: number;
  wonValue: number;
  notes: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewCampaign {
  tenantId: Id;
  companyId?: Id | null;
  name: string;
  channel?: CampaignChannel;
  budget?: number;
  startDate?: string | null;
  endDate?: string | null;
  targetLeads?: number;
  notes?: string | null;
  createdBy?: Id | null;
}

const chan = (v: unknown): CampaignChannel =>
  (CAMPAIGN_CHANNELS as string[]).includes(v as string) ? (v as CampaignChannel) : 'other';

export function makeCampaign(input: NewCampaign): Campaign {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    name: input.name.trim(),
    channel: chan(input.channel),
    status: 'planned',
    budget: Math.max(0, Number(input.budget) || 0),
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    targetLeads: Math.max(0, Math.floor(input.targetLeads ?? 0)),
    leadsGenerated: 0,
    wonValue: 0,
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Record the outcome of a campaign (leads produced + won revenue attributed). */
export function recordResults(c: Campaign, patch: { leadsGenerated?: number; wonValue?: number }): Campaign {
  return {
    ...c,
    leadsGenerated: patch.leadsGenerated != null ? Math.max(0, Math.floor(patch.leadsGenerated)) : c.leadsGenerated,
    wonValue: patch.wonValue != null ? Math.max(0, Number(patch.wonValue)) : c.wonValue,
    updatedAt: new Date().toISOString(),
  };
}

export function setCampaignStatus(c: Campaign, status: CampaignStatus): Campaign {
  return { ...c, status, updatedAt: new Date().toISOString() };
}

/** ROI = (won − budget) / budget; cost-per-lead = budget / leads. Pure, for display + tests. */
export function campaignMetrics(c: Campaign): { roi: number | null; costPerLead: number | null } {
  return {
    roi: c.budget > 0 ? Number(((c.wonValue - c.budget) / c.budget).toFixed(2)) : null,
    costPerLead: c.leadsGenerated > 0 ? Number((c.budget / c.leadsGenerated).toFixed(2)) : null,
  };
}
