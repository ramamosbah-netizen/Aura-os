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
  /** Awarded contract value. */
  value: number;
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
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Contracts events on the spine. */
export const CONTRACT_EVENT = {
  created: 'contracts.contract.created',
  updated: 'contracts.contract.updated',
  signed: 'contracts.contract.signed',
  completed: 'contracts.contract.completed',
} as const;
