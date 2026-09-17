import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Permissions, TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { QuotationCaptureService, QuotationLineService } from '@aura/procurement';
import { admitCurrency } from '@aura/shared';
import { IsGovernableCurrency } from '../common/is-governable-currency';

/**
 * QC-01 stage A — a Buyer capturing a supplier quotation.
 *
 * EXPLICIT PERMISSIONS ON EVERY ROUTE, and that is the point rather than a convention. The existing
 * quote-capture route carries none, so the guard derives `procurement.rfq.quotes` from its path —
 * and NO shipped role holds that: a Buyer with `procurement.*.create` does not match a third segment
 * of `quotes`, so only an administrator can record a quotation at all. Declaring
 * `procurement.rfq.create` / `.update` here puts capture back in the hands of the role that does the
 * work, without touching a single role definition.
 *
 * Every write appends. There is no route that rewrites a received revision's commercial facts,
 * because a supplier's change is the next revision and the one before it stays readable.
 */

class OpenQuotationDto {
  @IsString() rfqId!: string;
  @IsString() supplierName!: string;
  @IsOptional() @IsString() supplierId?: string | null;
  /** The SUPPLIER'S own reference for the quotation, as they wrote it. */
  @IsOptional() @IsString() supplierQuotationRef?: string | null;
}

class RevisionDto {
  @IsOptional() @IsString() supplierRevisionRef?: string | null;
  @IsOptional() @IsString() receivedAt?: string | null;
  @IsOptional() @IsString() quotationDate?: string | null;
  @IsOptional() @IsString() validityDate?: string | null;
  /** Refused at the boundary when AURA cannot govern a rate for it (FX-01). */
  @IsOptional() @IsGovernableCurrency() currency?: string | null;
  @IsOptional() @IsIn(['exclusive', 'inclusive', 'exempt']) taxTreatment?: 'exclusive' | 'inclusive' | 'exempt' | null;
  @IsOptional() @IsNumber() @Min(0) taxRatePct?: number | null;
  @IsOptional() @IsNumber() @Min(0) freightAmount?: number | null;
  @IsOptional() @IsString() freightTerms?: string | null;
  @IsOptional() @IsString() paymentTerms?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  /** The DMS document this revision was captured from. Upload itself is a later stage. */
  @IsOptional() @IsString() sourceAttachmentId?: string | null;
  /**
   * DECLARED SO IT CAN BE REFUSED. Lead time is a per-item fact and lives on the quotation LINE
   * (migration 0346). Dropping it from the DTO would let the whitelist pipe strip it silently and
   * the caller would believe it had been recorded.
   */
  @IsOptional() @IsNumber() leadTimeDays?: number | null;
}

class AlternativeDto {
  @IsString() label!: string;
}


class RevisionLineDto {
  @IsString() prLineId!: string;
  @IsOptional() @IsIn(['quoted', 'no_bid']) response?: 'quoted' | 'no_bid';
  /** The supplier's own words for what they are offering. */
  @IsOptional() @IsString() supplierDescription?: string | null;
  @IsOptional() @IsString() offeredManufacturer?: string | null;
  @IsOptional() @IsString() offeredModel?: string | null;
  @IsOptional() @IsString() partNumber?: string | null;
  @IsOptional() @IsNumber() @Min(0) quantity?: number | null;
  @IsOptional() @IsString() uom?: string | null;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number | null;
  @IsOptional() @IsNumber() @Min(0) lineDiscount?: number | null;
  /** The supplier's TECHNICAL departure from the specification — their claim, not a verdict. */
  @IsOptional() @IsString() deviations?: string | null;
  /** A COMMERCIAL condition: part shipment, a price condition, terms. A different kind of claim. */
  @IsOptional() @IsString() commercialDeviation?: string | null;
  @IsOptional() @IsString() exclusions?: string | null;
  /** Lead time lives HERE and not on the header: one figure cannot say when each item arrives. */
  @IsOptional() @IsNumber() @Min(0) leadTimeDays?: number | null;
  @IsOptional() @IsNumber() @Min(0) warrantyMonths?: number | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsIn(['comply', 'comply_with_deviation', 'not_offered']) complianceResponse?: 'comply' | 'comply_with_deviation' | 'not_offered' | null;
}

@Controller('procurement/quotations')
export class QuotationCaptureController {
  constructor(
    private readonly capture: QuotationCaptureService,
    private readonly lines: QuotationLineService,
    private readonly tenant: TenantContext,
  ) {}

  private refuseHeaderLeadTime(dto: RevisionDto): void {
    if (dto.leadTimeDays !== undefined && dto.leadTimeDays !== null) {
      throw new BadRequestException(
        'lead time must be recorded on the quotation line it applies to, not on the quotation — ' +
        'an overall figure cannot say when each item arrives',
      );
    }
  }

  private revisionFacts(dto: RevisionDto) {
    if (dto.currency !== undefined && dto.currency !== null) {
      const verdict = admitCurrency(dto.currency);
      if (!verdict.admissible) throw new BadRequestException(verdict.detail);
    }
    return {
      supplierRevisionRef: dto.supplierRevisionRef ?? null,
      receivedAt: dto.receivedAt ?? null,
      quotationDate: dto.quotationDate ?? null,
      validityDate: dto.validityDate ?? null,
      currency: dto.currency ?? null,
      taxTreatment: dto.taxTreatment ?? null,
      taxRatePct: dto.taxRatePct ?? null,
      freightAmount: dto.freightAmount ?? null,
      freightTerms: dto.freightTerms ?? null,
      paymentTerms: dto.paymentTerms ?? null,
      notes: dto.notes ?? null,
      sourceAttachmentId: dto.sourceAttachmentId ?? null,
    };
  }

  /** Open a supplier's quotation against an RFQ, or return the one they already have. */
  @Permissions('procurement.rfq.create')
  @Post('families')
  open(@Body() dto: OpenQuotationDto) {
    if (!dto?.supplierName?.trim()) throw new BadRequestException('supplierName is required');
    if (!dto?.rfqId?.trim()) throw new BadRequestException('rfqId is required — a quotation answers an RFQ');
    const ctx = this.tenant.get();
    return this.capture.openFamily({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      rfqId: dto.rfqId,
      supplierId: dto.supplierId ?? null,
      supplierName: dto.supplierName,
      supplierQuotationRef: dto.supplierQuotationRef ?? null,
      createdBy: ctx.actorId,
    });
  }

  /** A technical ALTERNATIVE, which is a separate offer and never a revision of the base one. */
  @Permissions('procurement.rfq.create')
  @Post('families/:familyId/offers')
  addAlternative(@Param('familyId', ParseUuidOr404Pipe) familyId: string, @Body() dto: AlternativeDto) {
    if (!dto?.label?.trim()) {
      throw new BadRequestException('an alternative offer must say what is being offered instead');
    }
    const ctx = this.tenant.get();
    return this.capture.addAlternativeOffer(ctx.tenantId, familyId, dto.label, ctx.actorId);
  }

  /** Start the next revision of an offer, as a draft the buyer can still correct. */
  @Permissions('procurement.rfq.create')
  @Post('offers/:offerId/revisions')
  startRevision(@Param('offerId', ParseUuidOr404Pipe) offerId: string, @Body() dto: RevisionDto) {
    this.refuseHeaderLeadTime(dto);
    const ctx = this.tenant.get();
    return this.capture.startRevision({ tenantId: ctx.tenantId, offerId, createdBy: ctx.actorId, ...this.revisionFacts(dto) });
  }

  /** Correct a DRAFT. A received revision is refused, with the alternative named in the message. */
  @Permissions('procurement.rfq.update')
  @Patch('revisions/:revisionId')
  editDraft(@Param('revisionId', ParseUuidOr404Pipe) revisionId: string, @Body() dto: RevisionDto) {
    this.refuseHeaderLeadTime(dto);
    return this.capture.editDraft(this.tenant.get().tenantId, revisionId, this.revisionFacts(dto));
  }

  /**
   * Move a revision through the lifecycle.
   *
   * `received` closes it to edits; `confirmed` makes it the commercially effective one and supersedes
   * whatever held that position; `withdrawn` and `rejected` retire it and leave the offer with NO
   * effective revision, which SUP-06 must show rather than hide.
   */
  @Permissions('procurement.rfq.update')
  @Patch('revisions/:revisionId/status')
  async setStatus(
    @Param('revisionId', ParseUuidOr404Pipe) revisionId: string,
    @Body() body: { status?: 'received' | 'confirmed' | 'withdrawn' | 'rejected' },
  ) {
    const ctx = this.tenant.get();
    switch (body?.status) {
      case 'received': return this.capture.markReceived(ctx.tenantId, revisionId, ctx.actorId);
      case 'confirmed': return this.capture.confirm(ctx.tenantId, revisionId, ctx.actorId);
      case 'withdrawn': return this.capture.retire(ctx.tenantId, revisionId, 'withdrawn', ctx.actorId);
      case 'rejected': return this.capture.retire(ctx.tenantId, revisionId, 'rejected', ctx.actorId);
      default:
        throw new BadRequestException('status must be one of received, confirmed, withdrawn or rejected');
    }
  }

  /** One supplier's quotation in full: every offer, its effective revision, and its history. */
  @Permissions('procurement.rfq.read')
  @Get('families/:familyId')
  read(@Param('familyId', ParseUuidOr404Pipe) familyId: string) {
    return this.capture.readFamily(this.tenant.get().tenantId, familyId);
  }

  /** Every supplier's quotation against one RFQ. */
  @Permissions('procurement.rfq.read')
  @Get('families')
  listByRfq(@Query('rfqId') rfqId?: string) {
    if (!rfqId?.trim()) throw new BadRequestException('rfqId is required');
    return this.capture.readByRfq(this.tenant.get().tenantId, rfqId);
  }

  /**
   * What the supplier offered for ONE requirement, inside this revision.
   *
   * Bound to the revision rather than to the quotation, so the prices in Rev 1 stay exactly as
   * quoted when Rev 2 arrives. Refused once the revision is confirmed or retired: a commercial
   * snapshot that can still take new prices is not a snapshot.
   */
  @Permissions('procurement.rfq.create')
  @Post('revisions/:revisionId/lines')
  addLine(@Param('revisionId', ParseUuidOr404Pipe) revisionId: string, @Body() dto: RevisionLineDto) {
    if (!dto?.prLineId?.trim()) {
      throw new BadRequestException('prLineId is required — a quotation line must answer a requisition line');
    }
    const ctx = this.tenant.get();
    return this.lines.add(ctx.tenantId, {
      revisionId,
      prLineId: dto.prLineId,
      response: dto.response,
      supplierDescription: dto.supplierDescription ?? null,
      offeredManufacturer: dto.offeredManufacturer ?? null,
      offeredModel: dto.offeredModel ?? null,
      partNumber: dto.partNumber ?? null,
      quantity: dto.quantity ?? null,
      uom: dto.uom ?? null,
      unitPrice: dto.unitPrice ?? null,
      lineDiscount: dto.lineDiscount ?? null,
      deviations: dto.deviations ?? null,
      commercialDeviation: dto.commercialDeviation ?? null,
      exclusions: dto.exclusions ?? null,
      leadTimeDays: dto.leadTimeDays ?? null,
      warrantyMonths: dto.warrantyMonths ?? null,
      notes: dto.notes ?? null,
      complianceResponse: dto.complianceResponse ?? null,
      createdBy: ctx.actorId ?? null,
    });
  }

  /** The lines of one revision, at the prices that revision actually quoted. */
  @Permissions('procurement.rfq.read')
  @Get('revisions/:revisionId/lines')
  listLines(@Param('revisionId', ParseUuidOr404Pipe) revisionId: string) {
    return this.lines.listByRevision(this.tenant.get().tenantId, revisionId);
  }
}
