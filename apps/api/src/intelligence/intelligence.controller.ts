import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenantContext, AiService } from '@aura/core';
import {
  type Briefing,
  type Funnel,
  type ProjectLedger,
  type PricingCalibration,
  type AutonomyProposal,
  InsightService,
  PipelineProjection,
  PricingService,
  AutonomyService,
  winRate,
} from '@aura/intelligence';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatDto {
  message: string;
  history?: ChatMessage[];
}

/**
 * Intelligence API — read-only views of the deal-chain projection + an on-demand AI
 * briefing + a context-aware ERP Copilot + IEC Pricing Calibrator + Autonomy Engine.
 */
@Controller('intelligence')
export class IntelligenceController {
  constructor(
    private readonly projection: PipelineProjection,
    private readonly insights: InsightService,
    private readonly pricing: PricingService,
    private readonly autonomy: AutonomyService,
    private readonly tenant: TenantContext,
    private readonly ai: AiService,
  ) {}

  // ── Deal-chain ─────────────────────────────────────────────────────────────

  @Get('pipeline')
  pipeline(): { funnel: Funnel; winRate: number | null } {
    const funnel = this.projection.snapshot(this.tenant.get().tenantId);
    return { funnel, winRate: winRate(funnel) };
  }

  @Get('projects')
  projects(): ProjectLedger[] {
    return this.projection.ledgers(this.tenant.get().tenantId);
  }

  @Post('insights')
  generate(): Promise<Briefing> {
    const ctx = this.tenant.get();
    return this.insights.generateBriefing(ctx.tenantId, ctx.actorId);
  }

  // ── IEC Pricing Engine ─────────────────────────────────────────────────────

  @Get('calibrations')
  listCalibrations(): Promise<PricingCalibration[]> {
    return this.pricing.listCalibrations(this.tenant.get().tenantId);
  }

  @Post('calibrations/trigger')
  async triggerCalibration(): Promise<{ calibrated: number; items: PricingCalibration[] }> {
    const ctx = this.tenant.get();
    return this.pricing.calibrate(ctx.tenantId, ctx.actorId);
  }

  @Post('pricing-sources')
  async recordSource(@Body() dto: {
    itemCode: string;
    description?: string;
    sourceType?: string;
    unitPrice: number;
    currency?: string;
    quantity?: number;
    supplierId?: string;
    projectId?: string;
  }) {
    return this.pricing.recordSource(this.tenant.get().tenantId, {
      itemCode: dto.itemCode,
      description: dto.description ?? null,
      sourceType: (dto.sourceType ?? 'po') as any,
      unitPrice: dto.unitPrice,
      currency: dto.currency ?? 'AED',
      quantity: dto.quantity ?? 1,
      supplierId: dto.supplierId ?? null,
      projectId: dto.projectId ?? null,
    });
  }

  // ── Autonomy Engine ────────────────────────────────────────────────────────

  @Get('proposals')
  listProposals(@Query('status') status?: string): Promise<AutonomyProposal[]> {
    return this.autonomy.list(
      this.tenant.get().tenantId,
      status as any ?? undefined,
    );
  }

  @Post('proposals')
  createProposal(@Body() dto: {
    title: string;
    description?: string;
    category?: string;
    severity?: string;
    mode?: string;
    targetModule?: string;
    targetAction?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
    valueAmount?: number;
    variancePercent?: number;
  }): Promise<AutonomyProposal> {
    const ctx = this.tenant.get();
    return this.autonomy.propose(ctx.tenantId, dto as any, ctx.actorId);
  }

  @Post('proposals/:id/execute')
  executeProposal(@Param('id') id: string): Promise<AutonomyProposal> {
    const ctx = this.tenant.get();
    return this.autonomy.execute(ctx.tenantId, id, ctx.actorId);
  }

  @Post('proposals/:id/reject')
  rejectProposal(@Param('id') id: string): Promise<AutonomyProposal> {
    const ctx = this.tenant.get();
    return this.autonomy.reject(ctx.tenantId, id, ctx.actorId);
  }

  // ── AI Chat ────────────────────────────────────────────────────────────────

  @Post('chat')
  async chat(@Body() dto: ChatDto): Promise<{ text: string; provider: string; model: string }> {
    const ctx = this.tenant.get();
    const funnel = this.projection.snapshot(ctx.tenantId);
    const ledgers = this.projection.ledgers(ctx.tenantId);

    const systemPrompt = `You are AURA AI, the virtual CFO, COO, and executive copilot for AURA OS (a Tier-1 ERP Operating System).
You have real-time access to the company's modular event spine. Here is the current snapshot of the business:

=== CRM & TENDERING FUNNEL ===
- Active Accounts: ${funnel.accounts}
- Tenders in Pipeline: ${funnel.tenders} (Total Value: $${(funnel.tenderValue || 0).toLocaleString()})
- Contracts Signed: ${funnel.contracts} (Total Value: $${(funnel.contractValue || 0).toLocaleString()})
- Active Projects: ${funnel.projects} (Total Value: $${(funnel.projectValue || 0).toLocaleString()})
- Tender-to-Contract Win Rate: ${winRate(funnel) === null ? 'N/A' : `${Math.round(winRate(funnel)! * 100)}%`}

=== PROJECT LEDGERS ===
${ledgers.length === 0 ? 'No projects registered.' : ledgers.map(l => `- Project "${l.projectName ?? l.projectId}": Budget $${(l.budget || 0).toLocaleString()}, Committed $${(l.committed || 0).toLocaleString()}, Invoiced $${(l.invoiced || 0).toLocaleString()}, Variance $${(l.variance || 0).toLocaleString()}`).join('\n')}

=== INSTRUCTIONS ===
- Act as a senior enterprise ERP consultant and executive strategist.
- Keep answers concise, highly structured (use lists and markdown tables where appropriate), and practical.
- Highlight negative variances, schedule issues, or low conversion rates immediately.
- If the user asks general questions, frame them within this company context.
- Your response will be displayed in the executive AI drawer.`;

    const response = await this.ai.complete({
      system: systemPrompt,
      messages: [
        ...(dto.history ?? []).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: dto.message ?? '' },
      ],
    });

    return {
      text: response.text,
      provider: response.provider,
      model: response.model,
    };
  }
}
