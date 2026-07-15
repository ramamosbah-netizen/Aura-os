import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { FormCustomValuesService, FormOverridesService, TenantContext } from '@aura/core';
import { applyFormOverrides, assertFormValid, parsePageParams, pickCustomFieldValues, quotationFormSchema } from '@aura/shared';
import { QUOTATION_ACTIONS, type Quotation, type QuotationAction, type NewQuotationLine, QuotationService } from '@aura/crm';
import { type Contract, ContractService } from '@aura/contracts';

class CreateQuotationDto {
  @IsString() quoteNumber!: string;
  @IsString() customerName!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsString() issueDate!: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsArray() lines!: NewQuotationLine[];
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
        title: `Contract from ${q.quoteNumber} — ${q.customerName}`,
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
    const merged = applyFormOverrides(quotationFormSchema, await this.formOverrides.get(this.tenant.get().tenantId, quotationFormSchema.id));
    const raw = (req.body ?? dto) as Record<string, unknown>;
    // The schema's 'lines' field validates via opts.lines rows (evaluateForm
    // contract) — without this every create carrying line items is rejected
    // with "Add at least one line item".
    assertFormValid(merged, raw, {
      lines: { lines: (Array.isArray(raw.lines) ? raw.lines : []) as Array<Record<string, string | number | boolean | null>> },
    });
    if (!dto?.quoteNumber?.trim()) throw new BadRequestException('quoteNumber is required');
    if (!dto?.customerName?.trim()) throw new BadRequestException('customerName is required');
    if (!dto?.issueDate) throw new BadRequestException('issueDate is required');
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) throw new BadRequestException('at least one line item is required');
    const ctx = this.tenant.get();
    const quotation = await this.quotations.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      quoteNumber: dto.quoteNumber,
      customerName: dto.customerName,
      accountId: dto.accountId ?? null,
      contactName: dto.contactName ?? null,
      issueDate: dto.issueDate,
      validUntil: dto.validUntil ?? null,
      lines: dto.lines,
      createdBy: ctx.actorId,
    });
    await this.customValues.save(ctx.tenantId, merged.id, quotation.id, pickCustomFieldValues(merged, req.body));
    return quotation;
  }

  @Get()
  list(@Query('status') status?: Quotation['status'], @Query('accountId') accountId?: string): Promise<Quotation[]> {
    return this.quotations.list({ tenantId: this.tenant.get().tenantId, status, accountId, limit: 100 });
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

  /** Internal cost & margin sheet for this revision. */
  @Get(':id/pricing')
  async getPricing(@Param('id') id: string) {
    try {
      return await this.quotations.getPricing(id);
    } catch {
      throw new NotFoundException(`quotation ${id} not found`);
    }
  }

  /** Save per-line unit costs for this revision; returns the recomputed sheet. */
  @Put(':id/pricing')
  async setPricing(@Param('id') id: string, @Body() dto: { unitCosts?: number[] }) {
    try {
      return await this.quotations.setPricing(id, Array.isArray(dto?.unitCosts) ? dto.unitCosts : []);
    } catch {
      throw new NotFoundException(`quotation ${id} not found`);
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

  @Patch(':id/status')
  async changeStatus(@Param('id') id: string, @Body() dto: { action: QuotationAction }): Promise<Quotation> {
    if (!QUOTATION_ACTIONS.includes(dto?.action)) {
      throw new BadRequestException(`action must be one of ${QUOTATION_ACTIONS.join(', ')}`);
    }
    // Pass the actor so approval records who locked the commercial baseline (R3 governance).
    return await this.quotations.changeStatus(id, dto.action, this.tenant.get().actorId);
  }
}
