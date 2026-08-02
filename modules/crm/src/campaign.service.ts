import { Inject, Injectable } from '@nestjs/common';
import { CAMPAIGN_STORE, type CampaignStore } from './campaign-store';
import {
  type Campaign, type CampaignChannel, type CampaignStatus,
  makeCampaign, recordResults, setCampaignStatus,
} from './domain/campaign';

/** Marketing campaign register — top-of-funnel spend + the pipeline it produced. */
@Injectable()
export class CampaignService {
  constructor(@Inject(CAMPAIGN_STORE) private readonly store: CampaignStore) {}

  create(params: {
    tenantId: string; companyId?: string | null; name: string; channel?: CampaignChannel;
    budget?: number; startDate?: string | null; endDate?: string | null; targetLeads?: number;
    notes?: string | null; createdBy?: string | null;
  }): Promise<Campaign> {
    const c = makeCampaign(params);
    return this.store.save(c).then(() => c);
  }
  list(tenantId: string, status?: string): Promise<Campaign[]> { return this.store.list(tenantId, status); }
  get(id: string, tenantId: string): Promise<Campaign | null> { return this.store.find(id, tenantId); }

  async recordResults(id: string, tenantId: string, patch: { leadsGenerated?: number; wonValue?: number }): Promise<Campaign> {
    const next = recordResults(await this.mustFind(id, tenantId), patch);
    await this.store.save(next);
    return next;
  }
  async setStatus(id: string, tenantId: string, status: CampaignStatus): Promise<Campaign> {
    const next = setCampaignStatus(await this.mustFind(id, tenantId), status);
    await this.store.save(next);
    return next;
  }
  private async mustFind(id: string, tenantId: string): Promise<Campaign> {
    const c = await this.store.find(id, tenantId);
    if (!c) throw new Error(`not found: campaign ${id}`);
    return c;
  }
}
