import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type EstimationLineInput, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  type NewPricingSheet, type PricingSheet,
  makePricingSheet, withSheetLines, freezeSheet, reviseSheet,
} from './domain/pricing-sheet';
import { CRM_PRICING_SHEET_STORE, type PricingSheetFilter, type PricingSheetStore } from './pricing-sheet-store';
import { QuotationService } from './quotation.service';

export const PRICING_SHEET_EVENT = {
  created: 'crm.pricing_sheet.created',
  frozen: 'crm.pricing_sheet.frozen',
  quotationGenerated: 'crm.pricing_sheet.quotation_generated',
} as const;

/**
 * The PricingSheet service — the workspace's aggregate, and the enforcement of the commercial flow:
 *
 *   draft (edit freely) → FREEZE (build-up becomes immutable) → GENERATE the quotation from it.
 *
 * Generating from an unfrozen sheet is refused on purpose: the quotation is a commercial output of
 * a committed price, not a preview of a moving draft. Re-pricing after freeze means a new VERSION.
 */
@Injectable()
export class PricingSheetService {
  private readonly logger = new Logger(PricingSheetService.name);

  constructor(
    @Inject(CRM_PRICING_SHEET_STORE) private readonly store: PricingSheetStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly quotations: QuotationService,
  ) {}

  async create(input: NewPricingSheet): Promise<PricingSheet> {
    const sheet = makePricingSheet(input);
    await this.store.save(sheet);
    await this.events.append([
      makeEvent({
        type: PRICING_SHEET_EVENT.created,
        tenantId: sheet.tenantId, companyId: sheet.companyId, actorId: sheet.createdBy,
        aggregateType: 'crm.pricing_sheet', aggregateId: sheet.id,
        payload: { name: sheet.name, version: sheet.version, opportunityId: sheet.opportunityId, quotationId: sheet.quotationId },
      }),
    ]);
    return sheet;
  }

  get(id: Id): Promise<PricingSheet | null> {
    return this.store.get(id);
  }

  list(filter: PricingSheetFilter): Promise<PricingSheet[]> {
    return this.store.list(filter);
  }

  /** Save the draft's lines (the workspace's Save). The domain refuses on a frozen sheet. */
  async saveLines(id: Id, lines: EstimationLineInput[]): Promise<PricingSheet> {
    const sheet = await this.store.get(id);
    if (!sheet) throw new Error(`pricing sheet ${id} not found`);
    const updated = withSheetLines(sheet, Array.isArray(lines) ? lines : []);
    await this.store.save(updated);
    return updated;
  }

  /** Freeze — the commercial commitment. From here the build-up is immutable. */
  async freeze(id: Id, actorId: Id | null): Promise<PricingSheet> {
    const sheet = await this.store.get(id);
    if (!sheet) throw new Error(`pricing sheet ${id} not found`);
    const frozen = freezeSheet(sheet, actorId);
    await this.store.save(frozen);
    await this.events.append([
      makeEvent({
        type: PRICING_SHEET_EVENT.frozen,
        tenantId: frozen.tenantId, companyId: frozen.companyId, actorId,
        aggregateType: 'crm.pricing_sheet', aggregateId: id,
        payload: { name: frozen.name, version: frozen.version, totals: frozen.totals },
      }),
    ]);
    this.logger.log(`Pricing sheet frozen: ${frozen.name} v${frozen.version} — cost ${frozen.totals.totalCost}, sell ${frozen.totals.totalSell}`);
    return frozen;
  }

  /** A new draft version from a frozen sheet — re-pricing starts from the last committed truth. */
  async revise(id: Id, actorId: Id | null): Promise<PricingSheet> {
    const sheet = await this.store.get(id);
    if (!sheet) throw new Error(`pricing sheet ${id} not found`);
    const next = reviseSheet(sheet, actorId);
    await this.store.save(next);
    return next;
  }

  /**
   * Opportunity-level context for the Copilot — DESCRIPTIVE FACTS with real counts, never an
   * invented probability. "3 of 5 decided quotes to this account were accepted" is knowledge a
   * commercial manager can check; "win probability 62%" from 29 records would be a costume.
   * Every number here is a count or an average over rows that exist.
   */
  async dealContext(id: Id): Promise<{
    account: { id: Id; name: string } | null;
    quotesToAccount: { total: number; accepted: number; rejected: number; decidedWinRatePercent: number | null };
    frozenSheets: { count: number; avgMarginPercent: number | null };
    thisSheetMarginPercent: number;
  }> {
    const sheet = await this.store.get(id);
    if (!sheet) throw new Error(`pricing sheet ${id} not found`);

    let account: { id: Id; name: string } | null = null;
    let quotesToAccount = { total: 0, accepted: 0, rejected: 0, decidedWinRatePercent: null as number | null };
    if (sheet.quotationId) {
      const quote = await this.quotations.get(sheet.quotationId);
      if (quote?.accountId) {
        account = { id: quote.accountId, name: quote.customerName };
        const history = await this.quotations.list({ tenantId: sheet.tenantId, accountId: quote.accountId, limit: 200 });
        const others = history.filter((q) => q.id !== sheet.quotationId);
        const accepted = others.filter((q) => q.status === 'accepted').length;
        const rejected = others.filter((q) => q.status === 'rejected').length;
        const decided = accepted + rejected;
        quotesToAccount = {
          total: others.length,
          accepted,
          rejected,
          decidedWinRatePercent: decided > 0 ? Math.round((accepted / decided) * 100) : null,
        };
      }
    }

    // How this sheet's margin sits against every baseline the tenant has committed to.
    const all = await this.store.list({ tenantId: sheet.tenantId, limit: 200 });
    const frozen = all.filter((s) => s.status === 'frozen' && s.id !== sheet.id);
    const avgMarginPercent = frozen.length > 0
      ? Math.round((frozen.reduce((sum, s) => sum + s.totals.marginPercent, 0) / frozen.length) * 10) / 10
      : null;

    return {
      account,
      quotesToAccount,
      frozenSheets: { count: frozen.length, avgMarginPercent },
      thisSheetMarginPercent: sheet.totals.marginPercent,
    };
  }

  /**
   * Generate the quotation FROM the sheet — the quotation as an output. Only a frozen sheet can
   * generate: a quote is the face of a committed price, not a preview of a moving draft.
   */
  async generateQuotation(id: Id): Promise<{ sheet: PricingSheet; quotationId: Id }> {
    const sheet = await this.store.get(id);
    if (!sheet) throw new Error(`pricing sheet ${id} not found`);
    if (sheet.status !== 'frozen') {
      throw new Error(`only a frozen pricing sheet can generate a quotation — freeze the baseline first`);
    }
    if (!sheet.quotationId) {
      throw new Error(`pricing sheet ${sheet.name} is not linked to a quotation yet — create the quote shell first`);
    }
    // One engine, one writer: the quotation's lines are regenerated from the sheet's build-ups.
    await this.quotations.saveEstimation(sheet.quotationId, sheet.lines);
    await this.events.append([
      makeEvent({
        type: PRICING_SHEET_EVENT.quotationGenerated,
        tenantId: sheet.tenantId, companyId: sheet.companyId, actorId: sheet.frozenBy,
        aggregateType: 'crm.pricing_sheet', aggregateId: id,
        payload: { quotationId: sheet.quotationId, totals: sheet.totals },
      }),
    ]);
    this.logger.log(`Quotation ${sheet.quotationId} generated from sheet ${sheet.name} v${sheet.version}`);
    return { sheet, quotationId: sheet.quotationId };
  }
}
