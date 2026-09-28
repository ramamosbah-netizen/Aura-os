import type { Id } from '@aura/shared';

/**
 * WHAT AN IPC ON AN AWARDED CONTRACT MAY CLAIM, AND AT WHAT RATE (J5-02).
 *
 * Owner's decision (2026-09-28): when a payment certificate has measured lines, the lines set its
 * value — Σ certified quantity × the frozen awarded unit rate. The frozen award lives in Projects
 * (the project's handover snapshot and its delivery maps) and what has been installed and certified
 * lives in the Quantity Ledger; Contracts owns neither, so the composition root answers through
 * this port (ADR-0004).
 *
 * A FAILURE IS REPORTED, NEVER FLATTENED. "Nothing certified yet" and "I could not read what was
 * certified" are the same number and opposite facts, and the second would let a QS claim the same
 * quantity twice. So the answer is discriminated, and the service refuses on `known: false`.
 */
export const IPC_VALUATION_SOURCE = Symbol('IPC_VALUATION_SOURCE');

export interface ClaimableItem {
  /** The frozen award item — what a line names. */
  frozenItemKey: string;
  /** The Quantity Ledger identity certification posts against. */
  boqItemId: string;
  description: string;
  /** The unit the award froze. Null when the award named none — then it cannot be claimed. */
  unit: string | null;
  /** The frozen awarded unit rate. Null when the award priced none — then it cannot be claimed. */
  rate: number | null;
  soldQuantity: number | null;
  /** Installed on the project, from the ledger. */
  installed: number;
  /** Already certified by earlier certificates, from the ledger. */
  certified: number;
  /** installed − certified, never below zero: what a new certificate may claim in total. */
  eligible: number;
  /** Completes "can only be claimed once …", or null when the item can be claimed. */
  blockedReason: string | null;
}

export interface ContractValuationBasis {
  projectId: Id;
  projectName: string;
  items: ClaimableItem[];
}

export type ContractValuationAnswer =
  /** `basis: null` — the contract has no project with frozen award items: it is valued as typed. */
  | { known: true; basis: ContractValuationBasis | null }
  | { known: false; reason: string };

export interface IpcValuationSource {
  basis(tenantId: Id, contractId: Id): Promise<ContractValuationAnswer>;
}

/** A contract is valued by its lines when its award froze at least one priced item. */
export function isMeasured(basis: ContractValuationBasis | null): basis is ContractValuationBasis {
  return basis !== null && basis.items.some((item) => item.rate !== null);
}
