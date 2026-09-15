import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Id } from '@aura/shared';
import { DELIVERY_ITEM_MAP_STORE, type DeliveryItemMapStore } from './delivery-item-map-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';
import { QuantityLedgerService } from './quantity-ledger.service';
import { LABOUR_SPENT_PROVIDER, type LabourSpentProvider, type ProjectLabourSpent } from './domain/labour-productivity';
import type { FrozenDeliverySourceItem } from './domain/handover';

/**
 * What was SOLD and PRICED for each of a project's work packages, and what has been INSTALLED
 * against it (PLN-11).
 *
 * One place that answers it, for the same reason PLN-12 put "which packages are measured" in one
 * place: the moment two callers assemble this chain themselves they will disagree about which
 * quantity is the planned one, and a planner will be shown two different answers to the same
 * question on two screens.
 *
 * The chain, every link read from a stored row:
 *
 *   WBS node → delivery item map → frozen award line (sold quantity, unit, priced rate)
 *                                → Quantity Ledger position (installed)
 *
 * BATCHED per project, deliberately. A plan of forty activities is one map read, one project read
 * and one ledger read per distinct award line — not per activity. The planning desk has already
 * been repaired once for exactly this (the availability fold asked HR, Fleet and Assets once per
 * booking), and the same defect reintroduced here would be slower still, because a ledger position
 * is a sum over every movement the item has ever had.
 */

/** What a work package was sold and priced for, beside what is measured against it. */
export interface PackageOutputFacts {
  wbsNodeId: Id;
  /** The frozen award line behind the package, or null where the ledger knows of none. */
  frozen: { soldQuantity: number | null; unit: string | null; productivityBasis?: FrozenDeliverySourceItem['productivityBasis'] } | null;
  /** Installed quantity from the ledger. `null` = it cannot answer for this line. */
  installedQuantity: number | null;
}

@Injectable()
export class ActivityOutputService {
  constructor(
    @Inject(DELIVERY_ITEM_MAP_STORE) private readonly maps: DeliveryItemMapStore,
    @Inject(PROJECT_STORE) private readonly projects: ProjectStore,
    // Optional for the same reason every seam in §22 is: a composition without the ledger reports
    // every package as unmeasured, which is exactly what it then knows.
    @Optional() @Inject(QuantityLedgerService) private readonly quantityLedger: QuantityLedgerService | null = null,
    // Where the project's recorded hours went (ADR-0004: bound at the composition root). Unbound,
    // every package's labour productivity reads UNKNOWN and the pace half is unaffected.
    @Optional() @Inject(LABOUR_SPENT_PROVIDER) private readonly labour: LabourSpentProvider | null = null,
  ) {}

  /**
   * What the project's day sheets say, ONCE for the whole plan.
   *
   * Returns null when no labour source is bound at all, which the rule must report as "we do not
   * know" — distinct from a project where every hour is recorded and none names a work package.
   */
  async labourSpent(tenantId: Id, projectId: Id): Promise<ProjectLabourSpent | null> {
    if (!this.labour) return null;
    try {
      return await this.labour.spentOn(tenantId, projectId);
    } catch {
      return null;
    }
  }

  /**
   * The sold/priced/installed facts for every mapped work package in one project.
   *
   * A package with no mapping is simply absent from the result — it has no award line behind it,
   * which the caller must report as UNKNOWN rather than as a package with nothing sold.
   */
  async packageOutputs(tenantId: Id, projectId: Id): Promise<Map<Id, PackageOutputFacts>> {
    const results = new Map<Id, PackageOutputFacts>();
    const mappings = (await this.maps.list({ tenantId, projectId })).filter((map) => map.wbsNodeId);
    if (mappings.length === 0) return results;

    const project = await this.projects.get(projectId);
    // Another tenant's project is not this plan's evidence, and a missing one is not an empty award.
    const frozenItems = project && project.tenantId === tenantId && Array.isArray(project.handoverSnapshot?.sourceItems)
      ? (project.handoverSnapshot.sourceItems as FrozenDeliverySourceItem[])
      : [];
    const byKey = new Map(frozenItems.map((item) => [item.frozenItemKey, item]));

    // One position per distinct award line, however many packages point at it.
    const installedByItem = new Map<string, number | null>();
    const sourceItemIds = [...new Set(mappings.map((map) => map.sourceItemId).filter((id): id is string => !!id))];
    await Promise.all(sourceItemIds.map(async (sourceItemId) => {
      if (!this.quantityLedger) return installedByItem.set(sourceItemId, null);
      try {
        installedByItem.set(sourceItemId, (await this.quantityLedger.position(tenantId, sourceItemId)).installed);
      } catch {
        // A ledger that cannot answer is silence, never a measurement of zero.
        installedByItem.set(sourceItemId, null);
      }
    }));

    for (const map of mappings) {
      const item = byKey.get(map.frozenItemKey) ?? null;
      results.set(map.wbsNodeId as Id, {
        wbsNodeId: map.wbsNodeId as Id,
        frozen: item
          ? { soldQuantity: item.soldQuantity, unit: item.unit, productivityBasis: item.productivityBasis ?? null }
          : null,
        installedQuantity: map.sourceItemId ? installedByItem.get(map.sourceItemId) ?? null : null,
      });
    }
    return results;
  }
}
