import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AiService, FormCustomValuesService, FormOverridesService, NumberingService, TenantContext } from '@aura/core';
import { applyFormOverrides, assertFormValid, parsePageParams, pickCustomFieldValues, quotationFormSchema } from '@aura/shared';
import {
  QUOTATION_ACTIONS, type Quotation, type QuotationAction, type NewQuotationLine, QuotationService,
  analysePricing, type LineRefs, type SheetLineForAdvice,
} from '@aura/crm';
import { MarketItemService } from '@aura/market-intelligence';
import { type Contract, ContractService } from '@aura/contracts';

class CreateQuotationDto {
  /** Optional: left blank, the server allocates the next auto-incrementing reference. */
  @IsOptional() @IsString() quoteNumber?: string;
  @IsString() customerName!: string;
  @IsOptional() @IsString() accountId?: string;
  /** What the quote is for — travels downstream as the contract and project title. */
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() contactName?: string;
  /**
   * Provenance: the opportunity this quote answers. The column and the store filter always
   * existed, but the create API never accepted it — so a quote raised the ordinary way could
   * never link back to its deal, and only the tender path or R4's scope flow set it. G5's
   * negotiation gate ('is there a proposal yet?') is what surfaced the gap.
   */
  @IsOptional() @IsString() sourceOpportunityId?: string;
  @IsString() issueDate!: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsArray() lines!: NewQuotationLine[];
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsArray() exclusions?: string[];
  @IsOptional() @IsString() paymentConditions?: string;
  @IsOptional() @IsString() deliveryTerms?: string;
}

/** Editing the commercial terms of a quote that is still being worked up. Every field optional —
 *  a PATCH that only touches exclusions must not blank out the payment conditions. */
class UpdateTermsDto {
  @IsOptional() @IsString() terms?: string | null;
  @IsOptional() @IsArray() exclusions?: string[];
  @IsOptional() @IsString() paymentConditions?: string | null;
  @IsOptional() @IsString() deliveryTerms?: string | null;
}

/** CRM customer-quotation API — stamps tenant/actor, delegates to QuotationService. */
@Controller('crm/quotations')
export class CrmQuotationsController {
  constructor(
    private readonly quotations: QuotationService,
    private readonly contracts: ContractService,
    private readonly tenant: TenantContext,
    private readonly formOverrides: FormOverridesService,
    private readonly customValues: FormCustomValuesService,
    private readonly numbering: NumberingService,
    private readonly marketItems: MarketItemService,
    private readonly ai: AiService,
  ) {}

  /** One-click convert an accepted quotation into a draft contract (carries value + account). */
  @Post(':id/convert-to-contract')
  async convertToContract(@Param('id') id: string): Promise<Contract> {
    const q = await this.quotations.get(id);
    if (!q) throw new NotFoundException(`quotation ${id} not found`);
    if (q.status !== 'accepted') throw new BadRequestException(`quotation must be 'accepted' to convert (is '${q.status}')`);
    const ctx = this.tenant.get();
    // R3: the contract inherits the locked Commercial Baseline (approved price) — its value defaults
    // from the baseline total so the contract is provably tied to what was approved, not re-invented.
    const baseline = await this.quotations.getBaseline(ctx.tenantId, q.id);
    const contract = await this.contracts.create(
      {
        tenantId: ctx.tenantId,
        companyId: q.companyId,
        // The subject IS the job — carry it as the contract title so the words the customer saw on
        // the quote name the contract, and (through it) the project. Only fall back to the generic
        // "Contract from …" label when a quote was raised without a subject.
        title: q.subject?.trim() || `Contract from ${q.quoteNumber} — ${q.customerName}`,
        accountId: q.accountId,
        accountName: q.customerName,
        value: baseline ? baseline.total : q.total,
        commercialBaselineId: baseline?.id ?? null,
        status: 'draft',
        createdBy: ctx.actorId,
      },
      `contract-from-quotation:${q.id}`,
    );
    // Deal-chain link: the quotation remembers the contract it became.
    await this.quotations.linkContract(q.id, contract.id);
    return contract;
  }

  /** Supersede this quotation (status 'revised') and draft Rev n+1 with the same number, lines and terms. */
  @Post(':id/revise')
  async revise(@Param('id') id: string): Promise<Quotation> {
    try {
      return await this.quotations.revise(id);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'revise failed');
    }
  }

  @Post()
  async create(@Body() dto: CreateQuotationDto, @Req() req: { body?: Record<string, unknown> }): Promise<Quotation> {
    // Server-side metadata-form enforcement (gap #8) — same schema the renderer runs.
    // Raw body: designer-added cf_* fields (P2) are stripped from the decorated DTO.
    const ctx = this.tenant.get();
    const merged = applyFormOverrides(quotationFormSchema, await this.formOverrides.get(ctx.tenantId, quotationFormSchema.id));
    // Auto-reference: when the author didn't set a number, allocate the next gapless, concurrency-
    // safe one (same 'crm'/'quotation'/'QUO' sequence the tender-generated path uses, so both
    // draw from one series). A typed number still wins — the reference auto-increments but stays
    // editable. Injected into `raw` BEFORE validation so the schema's required 'quoteNumber' is
    // satisfied by the generated value rather than rejecting a deliberately-blank field.
    const quoteNumber = dto.quoteNumber?.trim()
      || (await this.numbering.generateNextNumber(ctx.tenantId, ctx.companyId ?? null, 'crm', 'quotation', 'QUO'));
    const raw = { ...(req.body ?? dto), quoteNumber } as Record<string, unknown>;
    // The schema's 'lines' field validates via opts.lines rows (evaluateForm
    // contract) — without this every create carrying line items is rejected
    // with "Add at least one line item".
    assertFormValid(merged, raw, {
      lines: { lines: (Array.isArray(raw.lines) ? raw.lines : []) as Array<Record<string, string | number | boolean | null>> },
    });
    if (!dto?.customerName?.trim()) throw new BadRequestException('customerName is required');
    if (!dto?.issueDate) throw new BadRequestException('issueDate is required');
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) throw new BadRequestException('at least one line item is required');
    const quotation = await this.quotations.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      quoteNumber,
      customerName: dto.customerName,
      accountId: dto.accountId ?? null,
      subject: dto.subject ?? null,
      contactName: dto.contactName ?? null,
      sourceOpportunityId: dto.sourceOpportunityId ?? null,
      issueDate: dto.issueDate,
      validUntil: dto.validUntil ?? null,
      lines: dto.lines,
      terms: dto.terms ?? null,
      exclusions: dto.exclusions,
      paymentConditions: dto.paymentConditions ?? null,
      deliveryTerms: dto.deliveryTerms ?? null,
      createdBy: ctx.actorId,
    });
    await this.customValues.save(ctx.tenantId, merged.id, quotation.id, pickCustomFieldValues(merged, req.body));
    return quotation;
  }

  @Get()
  list(@Query('status') status?: Quotation['status'], @Query('accountId') accountId?: string): Promise<Quotation[]> {
    return this.quotations.list({ tenantId: this.tenant.get().tenantId, status, accountId, limit: 100 });
  }

  /** What this item has been quoted for before — the historic half of the pricing library. */
  @Get('price-history')
  priceHistory(@Query('q') q?: string) {
    return this.quotations.priceHistory(this.tenant.get().tenantId, q);
  }

  @Get('paged')
  paged(
    @Query('status') status?: Quotation['status'],
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.quotations.listPaged(
      { tenantId: this.tenant.get().tenantId, status, accountId },
      parsePageParams(limit, offset),
    );
  }

  /** All revisions of this quotation (same quote number), oldest first. */
  @Get(':id/revisions')
  revisions(@Param('id') id: string): Promise<Quotation[]> {
    return this.quotations.listRevisions(this.tenant.get().tenantId, id);
  }

  /**
   * Internal rate build-up view (cost factors → direct/indirect → margin) + lock state. READ ONLY:
   * all pricing WRITES go through the PricingSheet aggregate (crm/pricing-sheets — draft → freeze →
   * generate). The legacy write endpoints (set/apply/generate-lines/estimation) were removed once
   * the sheet became the single source; the quotation is an output, not a place prices are typed.
   */
  @Get(':id/pricing')
  getPricing(@Param('id') id: string) {
    // Domain errors flow to the taxonomy filter: "not found" → 404.
    return this.quotations.getPricing(id);
  }

  /**
   * AI pricing review. The FINDINGS are computed deterministically — each line's margin, and how
   * its price sits against the Market Intelligence benchmark and past quotes — so they can be
   * verified. The AI only narrates them into advice; it never invents a number. When no AI provider
   * is configured the findings still stand, and `narrative` is null.
   */
  @Get(':id/pricing/advice')
  async pricingAdvice(@Param('id') id: string): Promise<{ advice: ReturnType<typeof analysePricing>; narrative: string | null; provider: string }> {
    const tenantId = this.tenant.get().tenantId;
    const view = await this.quotations.getPricing(id); // throws → 404 via the taxonomy filter
    const lines: SheetLineForAdvice[] = view.lines.map((l) => ({
      description: l.description, quantity: l.quantity, unitCost: l.unitCostTotal, unitPrice: l.unitPrice,
    }));

    // Best-effort match each line to a catalogue benchmark and to its own price history (excluding
    // THIS quote, so a line is never compared against itself). Findings degrade gracefully when a
    // line matches nothing — the margin analysis still holds.
    const refs: LineRefs[] = await Promise.all(lines.map(async (l) => {
      const [cat] = await this.marketItems.list({ tenantId, q: l.description, limit: 1 });
      const [hist] = await this.quotations.priceHistory(tenantId, l.description, id);
      return {
        benchmark: cat ? { benchmarkCost: cat.benchmarkCost, benchmarkSell: cat.benchmarkSell, source: cat.source } : null,
        historic: hist ? { lastPrice: hist.lastPrice, minPrice: hist.minPrice, maxPrice: hist.maxPrice, count: hist.count } : null,
      };
    }));

    const advice = analysePricing(lines, refs);
    const { narrative, provider } = await this.narratePricing(advice, view.quoteNumber);
    return { advice, narrative, provider };
  }

  /** Turn the deterministic findings into a couple of sentences of advice. Never throws — a missing
   *  or failing provider just means no narrative, not a broken endpoint. */
  private async narratePricing(
    advice: ReturnType<typeof analysePricing>,
    quoteNumber: string,
  ): Promise<{ narrative: string | null; provider: string }> {
    try {
      const facts = [
        `Quote ${quoteNumber}. Blended margin ${advice.blendedMargin}%.`,
        `${advice.lossLines} line(s) below cost, ${advice.thinLines} thin, ${advice.aboveMarketLines} above market, ${advice.belowMarketLines} below market.`,
        ...advice.findings.flatMap((f) => f.notes.map((n) => `- ${f.description}: ${n}`)),
      ].join('\n');
      const res = await this.ai.complete({
        system:
          'You are a commercial pricing manager for an ELV/MEP contractor. Given deterministic findings ' +
          'about a quotation pricing sheet, give at most 3 short, concrete sentences of advice — what to fix ' +
          'and where the risk is. Use only the findings provided; do not invent numbers.',
        messages: [{ role: 'user', content: facts }],
        maxTokens: 220,
      });
      // The local/dev provider echoes the prompt rather than reasoning over it. Showing that back
      // as "AI advice" would be a lie, so a written narrative appears only from a real provider —
      // the deterministic findings are the substance and stand on their own without it.
      const narrative = res.provider === 'local' ? null : (res.text?.trim() || null);
      return { narrative, provider: res.provider };
    } catch {
      return { narrative: null, provider: 'unavailable' };
    }
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Quotation> {
    const found = await this.quotations.get(id);
    if (!found) throw new NotFoundException(`quotation ${id} not found`);
    return found;
  }

  /** The locked Commercial Baseline (approved-price snapshot) for this quotation, or null. */
  @Get(':id/baseline')
  async baseline(@Param('id') id: string) {
    return (await this.quotations.getBaseline(this.tenant.get().tenantId, id)) ?? null;
  }

  /**
   * Edit the commercial terms (notes, exclusions, payment & delivery conditions) of a quote still
   * being worked up. The service refuses (409) once the quote is approved or sent — after that the
   * terms are what the customer and the baseline hold, and a change means a revision.
   */
  @Patch(':id/terms')
  async updateTerms(@Param('id') id: string, @Body() dto: UpdateTermsDto): Promise<Quotation> {
    return this.quotations.updateCommercialTerms(id, dto);
  }

  @Patch(':id/status')
  async changeStatus(@Param('id') id: string, @Body() dto: { action: QuotationAction }): Promise<Quotation> {
    if (!QUOTATION_ACTIONS.includes(dto?.action)) {
      throw new BadRequestException(`action must be one of ${QUOTATION_ACTIONS.join(', ')}`);
    }
    // Pass the actor so approval records who locked the commercial baseline (R3 governance).
    return await this.quotations.changeStatus(id, dto.action, this.tenant.get().actorId);
  }
}
