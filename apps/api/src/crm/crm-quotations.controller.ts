import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { FormCustomValuesService, FormOverridesService, NumberingService, TenantContext } from '@aura/core';
import { applyFormOverrides, assertFormValid, parsePageParams, pickCustomFieldValues, quotationFormSchema } from '@aura/shared';
import { QUOTATION_ACTIONS, type Quotation, type QuotationAction, type NewQuotationLine, QuotationService } from '@aura/crm';
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

  /** Internal rate build-up (cost factors → direct/indirect → margin) + lock state. */
  @Get(':id/pricing')
  getPricing(@Param('id') id: string) {
    // Domain errors flow to the taxonomy filter: "not found" → 404.
    return this.quotations.getPricing(id);
  }

  /**
   * Save the per-line cost build-up for this revision.
   * Refused with 409 once the quotation is approved — the sheet is locked
   * (the taxonomy filter classifies the "only … can be re-priced" guard).
   */
  @Put(':id/pricing')
  setPricing(@Param('id') id: string, @Body() dto: unknown) {
    return this.quotations.setPricing(id, dto);
  }

  /**
   * Author the quote FROM its sheet: save the cost build-up, derive each line's
   * sell price from its cost + target margin, and write those prices onto the
   * quotation. Refused with 409 once approved (the sheet is locked).
   */
  @Post(':id/pricing/apply')
  applyPricing(@Param('id') id: string, @Body() dto: { lines?: unknown; targetMargins?: unknown }) {
    return this.quotations.applyPricing(id, dto ?? {});
  }

  /**
   * Generate the quote's LINES from pricing-sheet items — the sheet-first authoring path. Each
   * item carries its own description, quantity, cost build-up and target margin; the line is
   * written with a sell price derived from cost and margin. Refused (409) once approved.
   */
  @Post(':id/pricing/generate-lines')
  generateFromSheet(@Param('id') id: string, @Body() dto: { items?: unknown }): Promise<Quotation> {
    return this.quotations.generateFromSheet(id, dto?.items ?? []);
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
