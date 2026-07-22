import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  NEGOTIATION_ENTRY_TYPES,
  makeNegotiationEntry,
  summariseNegotiation,
  type NegotiationEntry,
  type NegotiationEntryType,
  type NegotiationParty,
  type NegotiationSummary,
  type PriceMove,
} from '@aura/shared';
import { NEGOTIATION_STORE, ParseUuidOr404Pipe, TenantContext, type NegotiationStore } from '@aura/core';
import { QuotationService } from '@aura/crm';

const PARTIES = ['CUSTOMER', 'US', 'COMPETITOR'];

class CreateEntryDto {
  @IsString() quotationId!: string;
  @IsIn(NEGOTIATION_ENTRY_TYPES as readonly string[]) type!: NegotiationEntryType;
  @IsOptional() @IsIn(PARTIES) party?: NegotiationParty;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percent?: number;
  @IsString() note!: string;
  /** When it happened, if that is not now — people log yesterday's call today. */
  @IsOptional() @IsISO8601() occurredAt?: string;
}

/**
 * The negotiation log — what was asked, what was answered, what the competition was doing.
 *
 * THE RULE THIS CONTROLLER ENFORCES: price movement in the summary is computed from the
 * REVISION CHAIN, never from the log. A note reading "gave them 5%" and a revision chain
 * showing 2% disagree, and the chain is the one that bills. The log explains WHY a price
 * moved; the revisions are WHAT it moved to. Letting a free-text note feed a number an
 * approver reads would make the log a way to misstate a discount.
 */
@Controller('crm/negotiation')
export class NegotiationController {
  constructor(
    @Inject(NEGOTIATION_STORE) private readonly store: NegotiationStore,
    private readonly quotations: QuotationService,
    private readonly tenant: TenantContext,
  ) {}

  /** The log for one quotation, with the summary the Negotiation tab renders. */
  @Get()
  async list(
    @Query('quotationId') quotationId?: string,
  ): Promise<{ entries: NegotiationEntry[]; moves: PriceMove[]; summary: NegotiationSummary }> {
    const tenantId = this.tenant.get().tenantId;
    const entries = await this.store.list({ tenantId, quotationId });
    // Without a quotation there is no single revision chain to price against, so the summary
    // reports the log only. Better than silently summarising across unrelated deals.
    const moves = quotationId ? await this.priceMoves(tenantId, quotationId) : [];
    return { entries, moves, summary: summariseNegotiation(entries, moves) };
  }

  @Post()
  async create(@Body() dto: CreateEntryDto): Promise<NegotiationEntry> {
    const tenantId = this.tenant.get().tenantId;
    const quote = await this.quotations.get(dto.quotationId);
    // A log entry against a quotation that does not exist is an orphan nobody will ever read.
    if (!quote || quote.tenantId !== tenantId) throw new NotFoundException('quotation not found');

    const entry = makeNegotiationEntry({
      tenantId,
      quotationId: dto.quotationId,
      type: dto.type,
      party: dto.party,
      amount: dto.amount ?? null,
      percent: dto.percent ?? null,
      note: dto.note,
      recordedBy: this.tenant.get().actorId,
      occurredAt: dto.occurredAt,
    });
    await this.store.append(entry);
    return entry;
  }

  /** Remove a mis-recorded entry. Deletion, never mutation — an edited entry stops being evidence. */
  @Delete(':id')
  async remove(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ removed: boolean }> {
    const removed = await this.store.remove(id);
    if (!removed) throw new NotFoundException('negotiation entry not found');
    return { removed };
  }

  /** The revision chain, reduced to what a negotiation cares about: what the price did. */
  private async priceMoves(tenantId: string, quotationId: string): Promise<PriceMove[]> {
    const revisions = await this.quotations.listRevisions(tenantId, quotationId);
    let previous: number | null = null;
    return revisions.map((q) => {
      const total = q.total ?? 0;
      const move: PriceMove = {
        revision: q.revision,
        total,
        delta: previous === null ? 0 : total - previous,
        // createdAt, and it is the right field: each revision is its own row, raised at the
        // moment the price moved. A later edit to the revision is not a new price move.
        at: q.createdAt,
      };
      previous = total;
      return move;
    });
  }
}
