import { Injectable, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { type Id, roundDecimal } from '@aura/shared';
import type { ClaimableItem, ContractValuationAnswer, IpcValuationSource } from '@aura/contracts';
import {
  DeliveryItemMapService,
  type FrozenDeliverySourceItem,
  isFrozenDeliverySource,
  ProjectService,
  QuantityLedgerService,
} from '@aura/projects';

/** Quantities, not money: rounded as decimals to the ledger's two places. */
const round2 = (n: number): number => roundDecimal(n, 2);

/**
 * App-layer adapter for Contracts' IPC_VALUATION_SOURCE (ADR-0004, J5-02).
 *
 * A payment certificate on an awarded contract is valued by its measured lines at the frozen
 * awarded rate (the owner's decision of 2026-09-28). The award lives in Projects — the project's
 * signed handover snapshot and its delivery maps — and what has been installed and certified lives
 * in the Quantity Ledger. This is where Contracts may ask.
 *
 * WHAT IS CLAIMABLE, ITEM BY ITEM:
 *   unit, rate, description   the frozen item's, never a caller's
 *   installed                 the ledger's INSTALLED position on this project
 *   certified                 the ledger's CERTIFIED position, plus any older INVOICED quantity that
 *                             carries no classification — it came from a certificate before the
 *                             semantic existed, and counting it as uncertified would let it be
 *                             claimed twice
 *   eligible                  installed − certified, never below zero
 *   blocked                   an item that is not mapped to delivery cannot be certified (the ledger
 *                             refuses to post it), and an item the award did not price or give a
 *                             unit cannot be valued — each says so rather than being hidden
 *
 * A FAILURE IS REPORTED, NEVER FLATTENED TO ZERO — the same rule as `PoPositionAdapter`: an
 * unreadable "certified" read as zero is a double claim. The services are resolved lazily through
 * `ModuleRef` for the reason that adapter records: importing Projects here would close a module
 * loop and Nest would hang in `NestFactory.create` with nothing to read.
 */
@Injectable()
export class IpcValuationAdapter implements IpcValuationSource {
  constructor(private readonly moduleRef: ModuleRef) {}

  private resolve<T>(token: Type<T>): T | null {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return null;
    }
  }

  async basis(tenantId: Id, contractId: Id): Promise<ContractValuationAnswer> {
    const projects = this.resolve(ProjectService);
    const maps = this.resolve(DeliveryItemMapService);
    const ledger = this.resolve(QuantityLedgerService);
    if (!projects || !maps || !ledger) return { known: false, reason: 'the project register or the quantity ledger could not be reached' };
    try {
      const delivering = (await projects.list({ tenantId, contractId }))
        .filter((p) => p.tenantId === tenantId && p.contractId === contractId)
        .filter((p) => isFrozenDeliverySource(p.handoverSnapshot) && Array.isArray(p.handoverSnapshot.sourceItems) && p.handoverSnapshot.sourceItems.length > 0);
      if (delivering.length === 0) return { known: true, basis: null };
      if (delivering.length > 1) {
        return { known: false, reason: `contract ${contractId} is delivered by ${delivering.length} projects with frozen awards, and a certificate cannot tell which one it measures` };
      }
      const project = delivering[0];
      const sourceItems = (project.handoverSnapshot as { sourceItems: FrozenDeliverySourceItem[] }).sourceItems;
      const mappings = await maps.list({ tenantId, projectId: project.id });

      const items: ClaimableItem[] = [];
      for (const item of sourceItems) {
        const mapping = mappings.find((m) => m.frozenItemKey === item.frozenItemKey) ?? null;
        const boqItemId = mapping ? (mapping.sourceItemId ?? mapping.frozenItemKey) : (item.sourceItemId ?? item.frozenItemKey);
        const position = await ledger.positionInProject(tenantId, project.id, boqItemId);
        const installed = round2(position.installed);
        const certified = round2((position.certified ?? 0) + position.legacyInvoiced);
        const blockedReason = item.unavailableReason
          ? `its award evidence is available (${item.unavailableReason})`
          : !mapping
            ? 'it is mapped to a work package on the project'
            : item.customerUnitPrice === null || item.customerUnitPrice === undefined
              ? 'the award has priced it'
              : !item.unit
                ? 'the award names its unit'
                : null;
        items.push({
          frozenItemKey: item.frozenItemKey,
          boqItemId,
          description: item.description,
          unit: item.unit ?? null,
          rate: item.customerUnitPrice ?? null,
          soldQuantity: item.soldQuantity ?? null,
          installed,
          certified,
          eligible: Math.max(0, round2(installed - certified)),
          blockedReason,
        });
      }
      return { known: true, basis: { projectId: project.id, projectName: project.title, items } };
    } catch (error) {
      return { known: false, reason: (error as Error).message };
    }
  }
}
