import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { TENDER_ESTIMATE_EVENT, type NewRateBuildUp, type RateBuildUp, type TenderEstimate, compileResourceBreakdown, makeRateBuildUp, summariseEstimate } from './domain/estimate';
import { ESTIMATE_STORE, type EstimateStore } from './estimate-store';
import { ESTIMATE_SOURCE_STORE, type EstimateSourceStore } from './estimate-source-store';
import { BOQ_STORE, type BOQStore } from './boq-store';

/**
 * Estimate service — the cost engine behind tender pricing. Owns
 * `aura_tendering_rate_buildups` and emits `tendering.estimate.*`. A build-up prices
 * ONE BOQ item (re-estimating replaces the previous build-up); the tender estimate
 * folds all build-ups over the BOQ quantities.
 */
@Injectable()
export class EstimateService {
  private readonly logger = new Logger('Tendering');

  constructor(
    @Inject(ESTIMATE_STORE) private readonly store: EstimateStore,
    @Inject(BOQ_STORE) private readonly boqStore: BOQStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // Optional so unit tests that construct EstimateService directly need not supply it.
    @Optional() @Inject(ESTIMATE_SOURCE_STORE) private readonly sourceStore: EstimateSourceStore | null = null,
  ) {}

  /**
   * Build (or rebuild) the rate for a BOQ item. `applyToBoq` writes the selling rate
   * back onto the BOQ item (rate + extended amount).
   */
  async buildRate(
    input: Omit<NewRateBuildUp, 'tenderId' | 'components'> & { components?: NewRateBuildUp['components'] },
    options: { applyToBoq?: boolean } = {},
  ): Promise<RateBuildUp> {
    const item = await this.boqStore.getBOQItem(input.tenantId, input.boqItemId);
    if (!item) throw new Error(`BOQ item ${input.boqItemId} not found`);
    const boq = await this.boqStore.findBOQ(input.tenantId, item.boqId);
    if (!boq) throw new Error(`BOQ ${item.boqId} not found`);

    // The internal pricing sheet path: a structured resource breakdown compiles
    // into per-unit components against the item's BOQ quantity.
    let resolved = { ...input, components: input.components ?? [] };
    if (input.resources && resolved.components.length === 0) {
      const compiled = compileResourceBreakdown(input.resources, item.quantity);
      resolved = { ...resolved, resources: compiled.resources, components: compiled.components };
    }

    const buildUp = makeRateBuildUp({ ...resolved, tenderId: boq.tenderId });

    const existing = await this.store.getByBoqItem(input.tenantId, input.boqItemId);
    if (existing) {
      await this.store.delete(existing.id);
      // Rebuilding replaces the build-up (new id + fresh component ids), so any bid-time
      // sources on the old one are orphaned — drop them rather than leave dangling links.
      await this.sourceStore?.removeByBuildUp(input.tenantId, existing.id);
    }
    await this.store.save(buildUp);

    if (options.applyToBoq) {
      const rate = buildUp.sellingRate;
      await this.boqStore.saveBOQItem({
        ...item,
        rate,
        totalAmount: Math.round(item.quantity * rate * 100) / 100,
        updatedAt: new Date().toISOString(),
      });
    }

    await this.events.append([
      makeEvent({
        type: TENDER_ESTIMATE_EVENT.rateBuilt,
        tenantId: buildUp.tenantId,
        companyId: buildUp.companyId,
        actorId: buildUp.createdBy,
        aggregateType: 'tendering.estimate',
        aggregateId: buildUp.id,
        payload: {
          tenderId: buildUp.tenderId,
          boqItemId: buildUp.boqItemId,
          sellingRate: buildUp.sellingRate,
          appliedToBoq: Boolean(options.applyToBoq),
        },
      }),
    ]);
    this.logger.log(
      `Rate built for BOQ item ${item.itemCode}: direct ${buildUp.directCost} → selling ${buildUp.sellingRate}` +
        (options.applyToBoq ? ' (applied to BOQ)' : ''),
    );
    return buildUp;
  }

  getForBoqItem(tenantId: Id, boqItemId: Id): Promise<RateBuildUp | null> {
    return this.store.getByBoqItem(tenantId, boqItemId);
  }

  listByTender(tenantId: Id, tenderId: Id): Promise<RateBuildUp[]> {
    return this.store.listByTender(tenantId, tenderId);
  }

  /** Tender ids that have at least one build-up, newest activity first (the sheets hub). */
  async tendersWithSheets(tenantId: Id): Promise<Id[]> {
    const all = await this.store.listByTenant(tenantId);
    const seen = new Set<Id>();
    const out: Id[] = [];
    for (const b of all) {
      if (!seen.has(b.tenderId)) {
        seen.add(b.tenderId);
        out.push(b.tenderId);
      }
    }
    return out;
  }

  /**
   * Record that a client quotation was generated from this tender's pricing
   * (the API layer composes the CRM create; the tendering event lands here so
   * the estimate aggregate owns its own trail).
   */
  async recordQuotationGenerated(args: {
    tenantId: Id;
    companyId?: Id | null;
    actorId?: Id | null;
    tenderId: Id;
    quotationId: Id;
    quoteNumber: string;
    total: number;
    pricedLines: number;
    unpricedLines: number;
  }): Promise<void> {
    await this.events.append([
      makeEvent({
        type: TENDER_ESTIMATE_EVENT.quotationGenerated,
        tenantId: args.tenantId,
        companyId: args.companyId ?? null,
        actorId: args.actorId ?? null,
        aggregateType: 'tendering.tender',
        aggregateId: args.tenderId,
        payload: {
          quotationId: args.quotationId,
          quoteNumber: args.quoteNumber,
          total: args.total,
          pricedLines: args.pricedLines,
          unpricedLines: args.unpricedLines,
        },
      }),
    ]);
    this.logger.log(`Quotation ${args.quoteNumber} generated from tender ${args.tenderId} (total ${args.total})`);
  }

  /** Tender-level estimate: build-ups folded over the BOQ. Null when the tender has no BOQ. */
  async tenderEstimate(tenantId: Id, tenderId: Id): Promise<TenderEstimate | null> {
    const boq = await this.boqStore.getBOQByTender(tenantId, tenderId);
    if (!boq) return null;
    const [items, buildUps] = await Promise.all([
      this.boqStore.getBOQItems(tenantId, boq.id),
      this.store.listByTender(tenantId, tenderId),
    ]);
    return summariseEstimate(boq.id, tenderId, items, buildUps);
  }
}
