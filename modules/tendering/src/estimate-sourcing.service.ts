import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { TENDER_ESTIMATE_EVENT, withComponentUnitCost } from './domain/estimate';
import { type EstimateSource, makeEstimateSource } from './domain/estimate-source';
import { ESTIMATE_STORE, type EstimateStore } from './estimate-store';
import { ESTIMATE_SOURCE_STORE, type EstimateSourceStore } from './estimate-source-store';

export interface SourceComponentInput {
  tenantId: Id;
  companyId?: Id | null;
  buildUpId: Id;
  componentId: Id;
  rfqId: Id;
  quoteId: Id;
  supplierName: string;
  /** The supplier quote's unit cost — becomes the component's cost. */
  quoteAmount: number;
  actorId?: Id | null;
}

/**
 * Bid-time sourcing (R5 / G-P1-4): ground a rate-build-up component's cost in a real supplier
 * quote. Sourcing sets the component's unit cost from the quote, re-derives the build-up's
 * selling rate, and records the link (so an RFQ award can restamp it and the sheet can flag a
 * stale estimate). The QUOTE itself is resolved by the API/reactor (procurement owns it) and
 * passed in as `quoteAmount` — tendering stays decoupled from procurement (ADR-0011).
 */
@Injectable()
export class EstimateSourcingService {
  private readonly logger = new Logger('Tendering');

  constructor(
    @Inject(ESTIMATE_STORE) private readonly estimates: EstimateStore,
    @Inject(ESTIMATE_SOURCE_STORE) private readonly sources: EstimateSourceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  /** Source ONE component from a supplier quote: set its cost, recompute the rate, record the link. */
  async source(input: SourceComponentInput): Promise<{ buildUp: import('./domain/estimate').RateBuildUp; source: EstimateSource }> {
    const buildUp = await this.estimates.get(input.buildUpId);
    if (!buildUp || buildUp.tenantId !== input.tenantId) throw new Error(`build-up ${input.buildUpId} not found`);
    const component = buildUp.components.find((c) => c.id === input.componentId);
    if (!component) throw new Error(`component ${input.componentId} not found in build-up ${input.buildUpId}`);
    const previousUnitCost = component.unitCost;

    const updated = withComponentUnitCost(buildUp, input.componentId, input.quoteAmount);
    await this.estimates.save(updated);

    const source = makeEstimateSource({
      tenantId: input.tenantId,
      companyId: input.companyId ?? buildUp.companyId,
      tenderId: buildUp.tenderId,
      buildUpId: buildUp.id,
      boqItemId: buildUp.boqItemId,
      componentId: input.componentId,
      rfqId: input.rfqId,
      quoteId: input.quoteId,
      supplierName: input.supplierName,
      sourcedUnitCost: input.quoteAmount,
      previousUnitCost,
      createdBy: input.actorId ?? null,
    });
    await this.sources.upsert(source);

    await this.emit(TENDER_ESTIMATE_EVENT.componentSourced, updated.tenantId, updated.companyId, input.actorId ?? null, buildUp.id, {
      tenderId: buildUp.tenderId,
      boqItemId: buildUp.boqItemId,
      componentId: input.componentId,
      rfqId: input.rfqId,
      quoteId: input.quoteId,
      unitCost: input.quoteAmount,
      sellingRate: updated.sellingRate,
    });
    this.logger.log(`Sourced component ${input.componentId} from quote ${input.quoteId} @ ${input.quoteAmount} → selling ${updated.sellingRate}`);
    return { buildUp: updated, source };
  }

  /** Revert a sourced component to its pre-source rate and drop the link. */
  async unsource(tenantId: Id, buildUpId: Id, componentId: Id, actorId?: Id | null): Promise<void> {
    const source = await this.sources.getByComponent(tenantId, buildUpId, componentId);
    if (!source) return;
    const buildUp = await this.estimates.get(buildUpId);
    if (buildUp && buildUp.tenantId === tenantId && buildUp.components.some((c) => c.id === componentId)) {
      const reverted = withComponentUnitCost(buildUp, componentId, source.previousUnitCost);
      await this.estimates.save(reverted);
    }
    await this.sources.remove(tenantId, buildUpId, componentId);
    await this.emit(TENDER_ESTIMATE_EVENT.sourceCleared, tenantId, source.companyId, actorId ?? null, buildUpId, {
      tenderId: source.tenderId,
      componentId,
      revertedTo: source.previousUnitCost,
    });
    this.logger.log(`Un-sourced component ${componentId} (reverted to ${source.previousUnitCost})`);
  }

  /**
   * Award reactor: an RFQ was awarded, so every component sourced from that RFQ is restamped to
   * the awarded price and the linked build-up re-priced. A component whose build-up has since been
   * rebuilt (id gone) has its now-orphan link dropped. Returns how many components were restamped.
   */
  async restampFromAward(args: {
    tenantId: Id;
    rfqId: Id;
    quoteId: Id;
    supplierName: string;
    amount: number;
    actorId?: Id | null;
  }): Promise<number> {
    const links = await this.sources.listByRfq(args.tenantId, args.rfqId);
    let restamped = 0;
    for (const link of links) {
      const buildUp = await this.estimates.get(link.buildUpId);
      const component = buildUp?.components.find((c) => c.id === link.componentId);
      if (!buildUp || !component) {
        // The build-up was rebuilt since sourcing — the link is orphaned; drop it.
        await this.sources.remove(args.tenantId, link.buildUpId, link.componentId);
        continue;
      }
      if (Math.abs(component.unitCost - args.amount) > 1e-9 || link.quoteId !== args.quoteId) {
        const updated = withComponentUnitCost(buildUp, link.componentId, args.amount);
        await this.estimates.save(updated);
        await this.sources.upsert({
          ...link,
          quoteId: args.quoteId,
          supplierName: args.supplierName.trim() || link.supplierName,
          sourcedUnitCost: args.amount,
          sourcedAt: new Date().toISOString(),
        });
        await this.emit(TENDER_ESTIMATE_EVENT.sourceRestamped, args.tenantId, buildUp.companyId, args.actorId ?? null, buildUp.id, {
          tenderId: buildUp.tenderId,
          componentId: link.componentId,
          rfqId: args.rfqId,
          quoteId: args.quoteId,
          unitCost: args.amount,
          sellingRate: updated.sellingRate,
        });
        restamped += 1;
      }
    }
    if (restamped > 0) this.logger.log(`RFQ ${args.rfqId} awarded → restamped ${restamped} sourced component(s) to ${args.amount}`);
    return restamped;
  }

  listByTender(tenantId: Id, tenderId: Id): Promise<EstimateSource[]> {
    return this.sources.listByTender(tenantId, tenderId);
  }

  /** Cleanup hook for a rebuilt/deleted build-up (called by the estimate service). */
  removeForBuildUp(tenantId: Id, buildUpId: Id): Promise<void> {
    return this.sources.removeByBuildUp(tenantId, buildUpId);
  }

  private async emit(type: string, tenantId: Id, companyId: Id | null, actorId: Id | null, aggregateId: Id, payload: Record<string, unknown>): Promise<void> {
    await this.events.append([
      makeEvent({ type, tenantId, companyId, actorId, aggregateType: 'tendering.estimate', aggregateId, payload }),
    ]);
  }
}
