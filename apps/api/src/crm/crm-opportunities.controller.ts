import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { FORECAST_CATEGORIES, EXECUTION_TYPES, parsePageParams, type ForecastCategory, type Opportunity, type OpportunityStage, type ExecutionType, type BuyingStage, type PursuitDecision, type PursuitDimensions, type StageEvidence } from '@aura/shared';
import { type Quotation, AccountService, ContactService, OpportunityService, QuotationService, quotationReadiness, quotationReadinessMessage } from '@aura/crm';
import { TenderService, type Tender } from '@aura/tendering';
import { accountSnapshotPatch, resolveAccountSnapshot } from '../common/account-snapshot';

/** The create drawer posts select values as strings — accept both. */
function coerceBool(v: boolean | string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === true || v === 'true';
}

class CreateOpportunityDto {
  @IsString() title!: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stage?: OpportunityStage;
  @IsOptional() @IsNumber() winProbability?: number;
  /** §23 — explicit commitment call; CLOSED is earned by the stage, never posted. */
  @IsOptional() @IsIn(FORECAST_CATEGORIES.filter((c) => c !== 'CLOSED')) forecastCategory?: ForecastCategory;
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() requiresTender?: boolean | string;
  @IsOptional() @IsIn(EXECUTION_TYPES as readonly string[]) executionType?: ExecutionType;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsString() nextActionDueDate?: string;
  @IsOptional() budgetConfirmed?: boolean | string;
  @IsOptional() authorityConfirmed?: boolean | string;
  @IsOptional() needConfirmed?: boolean | string;
  @IsOptional() timelineConfirmed?: boolean | string;
  @IsOptional() @IsString() competitors?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() lossReason?: string;
  @IsOptional() @IsString() winReason?: string;
}

class UpdateOpportunityDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stage?: OpportunityStage;
  @IsOptional() @IsNumber() winProbability?: number;
  @IsOptional() @IsIn(FORECAST_CATEGORIES.filter((c) => c !== 'CLOSED')) forecastCategory?: ForecastCategory;
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() requiresTender?: boolean | string;
  @IsOptional() @IsIn(EXECUTION_TYPES as readonly string[]) executionType?: ExecutionType;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsString() nextActionDueDate?: string;
  @IsOptional() budgetConfirmed?: boolean | string;
  @IsOptional() authorityConfirmed?: boolean | string;
  @IsOptional() needConfirmed?: boolean | string;
  @IsOptional() timelineConfirmed?: boolean | string;
  @IsOptional() @IsString() competitors?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() lossReason?: string;
  // G5 — the winning context the `won` gate requires (§40.3). Sent in the same PATCH as the
  // stage, which is why the gate checks the post-patch record.
  @IsOptional() @IsString() winReason?: string;
  @IsOptional() @IsString() buyingStage?: BuyingStage;
}

class PursuitDto {
  @IsString() decision!: PursuitDecision;
  @IsOptional() @IsObject() dimensions?: PursuitDimensions;
  @IsOptional() @IsString() rationale?: string;
}

@Controller('crm/opportunities')
export class CrmOpportunitiesController {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly quotations: QuotationService,
    private readonly contacts: ContactService,
    private readonly accounts: AccountService,
    private readonly tenders: TenderService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * The TENDER execution path — the mirror of convert-to-quotation (the direct-sale path). Starts a
   * competitive bid for this opportunity: creates ONE linked Tender in `draft`, to be qualified
   * (Go/No-Go), estimated, priced and submitted through the tender lifecycle gate. Bidding PRECEDES
   * winning, so — unlike the deal-chain reactor's already-won formality — it starts at `draft`, not
   * `submitted`.
   *
   * A deal has a SINGLE bid: a second click (or a deal whose tender was already started) hands back
   * the existing tender. The guard reads the PERSISTED link (sourceOpportunityId), so it stays
   * idempotent across restarts, not only within one process's command cache.
   */
  @Post(':id/start-tender')
  async startTender(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Tender> {
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    if (opp.executionType !== 'tender') {
      throw new BadRequestException(`set execution to Tender before starting a tender (is '${opp.executionType}')`);
    }
    const ctx = this.tenant.get();
    const existing = (await this.tenders.list({ tenantId: ctx.tenantId, accountId: opp.accountId ?? undefined }))
      .find((t) => t.sourceOpportunityId === id);
    const tender = existing ?? await this.tenders.create(
      {
        tenantId: ctx.tenantId,
        companyId: opp.companyId,
        title: opp.title,
        accountId: opp.accountId,
        accountName: opp.accountName,
        value: opp.value,
        status: 'draft',
        sourceOpportunityId: id,
        ownerId: opp.ownerId,
        createdBy: ctx.actorId,
      },
      // Shares the deal-chain reactor's key so the two paths can never both spawn a tender for the
      // same opportunity within one process (the persisted-link check above covers restarts).
      `tender-from-opportunity:${id}`,
    );
    // Hand commercial ownership to the tender: from here the opportunity is a projection and its
    // update() guard refuses any manual proposal/negotiation/won/lost or direct quotation. Idempotent.
    await this.opportunities.markTenderOwned(id, tender.id);
    return tender;
  }

  /**
   * Raise a draft quotation from a DIRECT-sale deal (carries value + account). A quotation/proposal
   * PRECEDES the win, so this is NOT gated on stage 'won' (that gate was backwards). It is gated by
   * the quotation-readiness domain rule: a tender-route deal is quoted through its tender, and a lost
   * deal cannot be quoted — extended in Phase 2 to require an approved Scope + Estimate + frozen
   * Pricing. A refused gate returns the reason (409-style), never a silent pass.
   */
  @Post(':id/convert-to-quotation')
  async convertToQuotation(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Quotation> {
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    // Governance facts (Phase 2b): once a Pre-Award package backs the deal, the quotation gate also
    // requires the approved Scope + Estimate + frozen Pricing chain; legacy deals stay grandfathered.
    const gov = await this.opportunities.governanceForOpportunity(this.tenant.get().tenantId, id);
    const readiness = quotationReadiness(
      { stage: opp.stage, executionType: opp.executionType, tenderId: opp.tenderId },
      { governed: gov.governed, scopeApproved: gov.scopeApproved, estimateApproved: gov.estimateApproved, pricingFrozen: gov.pricingFrozen },
    );
    if (!readiness.ready) throw new BadRequestException(quotationReadinessMessage(readiness.gaps));
    const ctx = this.tenant.get();
    return this.quotations.create({
      tenantId: ctx.tenantId,
      companyId: opp.companyId,
      quoteNumber: `QT-OPP-${opp.id.slice(0, 8)}`,
      customerName: opp.accountName ?? 'Client',
      accountId: opp.accountId,
      sourceOpportunityId: opp.id,
      ownerId: opp.ownerId ?? null,
      issueDate: new Date().toISOString().slice(0, 10),
      lines: [{ description: opp.title, quantity: 1, unitPrice: opp.value, vatRate: 5 }],
      createdBy: ctx.actorId,
    });
  }

  @Post()
  async create(@Body() dto: CreateOpportunityDto): Promise<Opportunity> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.opportunities.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      leadId: dto.leadId,
      accountId: dto.accountId,
      // The deal is the head of the chain: this snapshot is what the auto-created tender copies
      // from the `opportunityCreated` payload, so leaving it null strands the whole chain.
      accountName: await resolveAccountSnapshot(this.accounts, dto.accountId, dto.accountName),
      title: dto.title,
      value: dto.value,
      stage: dto.stage,
      winProbability: dto.winProbability,
      forecastCategory: dto.forecastCategory,
      closeDate: dto.closeDate,
      requiresTender: coerceBool(dto.requiresTender),
      executionType: dto.executionType,
      ownerId: dto.ownerId,
      nextAction: dto.nextAction,
      nextActionDueDate: dto.nextActionDueDate,
      budgetConfirmed: coerceBool(dto.budgetConfirmed),
      authorityConfirmed: coerceBool(dto.authorityConfirmed),
      needConfirmed: coerceBool(dto.needConfirmed),
      timelineConfirmed: coerceBool(dto.timelineConfirmed),
      competitors: dto.competitors,
      source: dto.source,
      lossReason: dto.lossReason,
      winReason: dto.winReason,
      actorId: ctx.actorId,
    });
  }

  /**
   * G5 — evidence for the stage gate. Quotations and stakeholders live outside the opportunity
   * aggregate, so the composition layer gathers them (ADR-0011) and the domain rule stays pure.
   * Only gathered on an actual stage change: an ordinary PATCH must not pay for two extra reads.
   */
  private async stageEvidence(opp: Opportunity, tenantId: string): Promise<StageEvidence> {
    const [quotes, contacts] = await Promise.all([
      this.quotations.list({ tenantId, sourceOpportunityId: opp.id }),
      // "Someone to propose to" = a named contact on the deal's account, which is what Opportunity
      // 360 already presents as the stakeholders. The per-deal buying committee (S6) would be the
      // stricter source, but reading it costs five queries and would block deals that legitimately
      // have a known contact and no formal committee yet. G6 (relationship graph) is where per-deal
      // decision-maker coverage gets real teeth; this gate only refuses proposing to NOBODY.
      opp.accountId ? this.contacts.list({ tenantId, accountId: opp.accountId }) : Promise.resolve([]),
    ]);
    return {
      hasStakeholder: contacts.length > 0,
      hasQuotation: quotes.length > 0,
      // "Submitted" means it actually reached the client: a draft or an internal review is not a
      // proposal. Anything past `sent` (negotiation/accepted/revised) has by definition been sent.
      quotationSubmitted: quotes.some((q) => q.status !== 'draft' && q.status !== 'internal_review'),
    };
  }

  @Patch(':id')
  async update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateOpportunityDto): Promise<Opportunity> {
    const ctx = this.tenant.get();
    const patch = {
      ...dto,
      ...(await accountSnapshotPatch(this.accounts, dto.accountId, dto.accountName)),
      ...(dto.requiresTender !== undefined ? { requiresTender: coerceBool(dto.requiresTender) } : {}),
      ...(dto.executionType !== undefined ? { executionType: dto.executionType } : {}),
      ...(dto.budgetConfirmed !== undefined ? { budgetConfirmed: coerceBool(dto.budgetConfirmed) } : {}),
      ...(dto.authorityConfirmed !== undefined ? { authorityConfirmed: coerceBool(dto.authorityConfirmed) } : {}),
      ...(dto.needConfirmed !== undefined ? { needConfirmed: coerceBool(dto.needConfirmed) } : {}),
      ...(dto.timelineConfirmed !== undefined ? { timelineConfirmed: coerceBool(dto.timelineConfirmed) } : {}),
    };
    // Only a stage change pays for the evidence reads.
    let evidence: StageEvidence = {};
    if (dto.stage) {
      const current = await this.opportunities.get(id);
      if (!current) throw new NotFoundException(`opportunity ${id} not found`);
      evidence = await this.stageEvidence(current, ctx.tenantId);
    }
    return this.opportunities.update(id, patch as Parameters<typeof this.opportunities.update>[1], ctx.actorId, evidence);
  }

  /** §14 — merge Win Plan fields (unknown keys dropped, whitespace → null); returns derived,
   * size-aware coverage. Never a gate: small deals legitimately carry a two-line plan. */
  @Patch(':id/win-plan')
  async winPlan(@Param('id', ParseUuidOr404Pipe) id: string, @Body() patch: Record<string, string | null>) {
    try {
      return await this.opportunities.updateWinPlan(id, patch ?? {});
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  @Post(':id/forecast')
  forecast(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ winProbability: number; reason: string }> {
    return this.opportunities.forecastWinProbability(id);
  }

  /** Record a Pursue / No-Pursue decision (scored from the assessment dimensions). */
  @Post(':id/pursuit')
  pursuit(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: PursuitDto): Promise<Opportunity> {
    if (dto?.decision !== 'PURSUE' && dto?.decision !== 'NO_PURSUE') {
      throw new BadRequestException('decision must be PURSUE or NO_PURSUE');
    }
    const ctx = this.tenant.get();
    return this.opportunities.recordPursuit(id, { decision: dto.decision, dimensions: dto.dimensions, rationale: dto.rationale, actorId: ctx.actorId });
  }

  @Get()
  list(@Query('stage') stage?: OpportunityStage, @Query('leadId') leadId?: string): Promise<Opportunity[]> {
    const ctx = this.tenant.get();
    return this.opportunities.list({ tenantId: ctx.tenantId, stage, leadId, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('stage') stage?: OpportunityStage,
    @Query('leadId') leadId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.opportunities.listPaged(
      { tenantId: this.tenant.get().tenantId, stage, leadId },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Opportunity> {
    const found = await this.opportunities.get(id);
    if (!found) throw new NotFoundException(`Opportunity ${id} not found`);
    return found;
  }
}
