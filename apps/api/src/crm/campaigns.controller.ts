import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  CampaignService, campaignMetrics,
  type Campaign, type CampaignChannel, type CampaignStatus,
} from '@aura/crm';

type CampaignView = Campaign & { metrics: ReturnType<typeof campaignMetrics> };
const withMetrics = (c: Campaign): CampaignView => ({ ...c, metrics: campaignMetrics(c) });

/** Marketing campaigns — the pre-lead funnel stage: spend in, pipeline out, ROI. */
@Controller('crm/campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  async list(@Query('status') status?: string): Promise<CampaignView[]> {
    const rows = await this.campaigns.list(this.tenant.get().tenantId, status);
    return rows.map(withMetrics);
  }

  @Post()
  async create(@Body() body: {
    name: string; channel?: CampaignChannel; budget?: number;
    startDate?: string | null; endDate?: string | null; targetLeads?: number; notes?: string | null;
  }): Promise<CampaignView> {
    const ctx = this.tenant.get();
    const c = await this.campaigns.create({
      tenantId: ctx.tenantId, companyId: ctx.companyId ?? null, createdBy: ctx.actorId,
      name: body.name, channel: body.channel, budget: body.budget,
      startDate: body.startDate, endDate: body.endDate, targetLeads: body.targetLeads, notes: body.notes,
    });
    return withMetrics(c);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CampaignView | null> {
    const c = await this.campaigns.get(id, this.tenant.get().tenantId);
    return c ? withMetrics(c) : null;
  }

  @Patch(':id/results')
  async results(@Param('id') id: string, @Body() body: { leadsGenerated?: number; wonValue?: number }): Promise<CampaignView> {
    return withMetrics(await this.campaigns.recordResults(id, this.tenant.get().tenantId, body));
  }

  @Patch(':id/status')
  async status(@Param('id') id: string, @Body() body: { status: CampaignStatus }): Promise<CampaignView> {
    return withMetrics(await this.campaigns.setStatus(id, this.tenant.get().tenantId, body.status));
  }
}
