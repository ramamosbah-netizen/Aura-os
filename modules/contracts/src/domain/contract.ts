import { type Id, newId } from '@aura/shared';

// Contracts domain — framework-free. A Contract is the awarded engagement that follows
// a WON tender: the third link in the deal chain (CRM → Tender → Contract → Project).
// It REFERENCES the source tender AND the CRM account by id + name snapshots — carrying
// the chain down by value, never a DB join.

export type ContractStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface Contract {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  title: string;
  reference: string | null;
  /** The won tender this contract was awarded from — reference + snapshot. */
  tenderId: Id | null;
  tenderTitle: string | null;
  /** The CRM account (client), carried down the chain — reference + snapshot. */
  accountId: Id | null;
  accountName: string | null;
  status: ContractStatus;
  /** The live contract value: `originalValue` plus every approved variation. */
  value: number;
  /**
   * The value at award, before variations. Kept separate so the variation roll-up is a recompute
   * (original + Σ approved) rather than an increment — a replayed event cannot inflate the contract.
   */
  originalValue: number;
  /** The locked Commercial Baseline (approved-price snapshot) this contract was created from —
   * reference, not join. Present when the contract came from an approved quotation (R3). */
  commercialBaselineId: Id | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewContract {
  tenantId: Id;
  companyId?: Id | null;
  title: string;
  reference?: string | null;
  tenderId?: Id | null;
  tenderTitle?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  status?: ContractStatus;
  value?: number;
  commercialBaselineId?: Id | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeContract(input: NewContract): Contract {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    title: input.title.trim(),
    reference: input.reference?.trim() || null,
    tenderId: input.tenderId ?? null,
    tenderTitle: input.tenderTitle ?? null,
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    originalValue: Number.isFinite(input.value) ? Number(input.value) : 0,
    commercialBaselineId: input.commercialBaselineId ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/**
 * Valid contract lifecycle transitions. `signed` (status→active) auto-creates the delivery Project
 * and `completed` drives the completion reactors, so status must not move freely: re-activating an
 * already-active contract would auto-create a SECOND project, and re-completing would re-fire the
 * downstream reactors. A same-status "transition" is treated by the service as an idempotent no-op
 * (no event) — safe for a retry or a duplicate reactor delivery; only a genuinely invalid move
 * (e.g. completed → active, active → draft) is refused here.
 */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Throw unless `from → to` is a permitted contract transition (same-state is the caller's no-op). */
export function assertContractTransition(from: ContractStatus, to: ContractStatus, ref: string): void {
  if (from === to) return; // handled as an idempotent no-op by the service
  if (!CONTRACT_TRANSITIONS[from].includes(to)) {
    const allowed = CONTRACT_TRANSITIONS[from].join(', ') || 'nothing (terminal)';
    throw new Error(`contract ${ref} is ${from}; it can only move to ${allowed}`);
  }
}

/** Contracts events on the spine. */
export const CONTRACT_EVENT = {
  created: 'contracts.contract.created',
  updated: 'contracts.contract.updated',
  signed: 'contracts.contract.signed',
  completed: 'contracts.contract.completed',
} as const;
