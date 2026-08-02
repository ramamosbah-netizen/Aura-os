import type { Campaign } from './domain/campaign';

export const CAMPAIGN_STORE = Symbol('CAMPAIGN_STORE');

export interface CampaignStore {
  save(c: Campaign): Promise<void>;
  find(id: string, tenantId: string): Promise<Campaign | null>;
  list(tenantId: string, status?: string): Promise<Campaign[]>;
}
