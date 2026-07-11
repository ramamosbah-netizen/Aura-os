import { type Id, newId } from '@aura/shared';

// Contracts domain — framework-free. A Bond/Guarantee is a bank instrument
// securing a contract obligation: performance bond, advance-payment guarantee,
// retention bond, warranty bond (very ELV/MEP: every award carries at least a
// performance bond, and an expired-unnoticed bond is a real commercial risk —
// the register tracks expiry).

export type BondKind = 'performance' | 'advance_payment' | 'retention' | 'warranty' | 'tender_bond';
export type BondStatus = 'active' | 'released' | 'called' | 'expired';

export const BOND_KINDS: readonly BondKind[] = ['performance', 'advance_payment', 'retention', 'warranty', 'tender_bond'];

export interface ContractBond {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  contractId: Id;
  kind: BondKind;
  /** Bank reference / guarantee number. */
  reference: string;
  bank: string | null;
  amount: number;
  issueDate: string | null; // YYYY-MM-DD
  expiryDate: string | null; // YYYY-MM-DD — the date to WATCH
  status: BondStatus;
  notes: string | null;
  createdBy: Id | null;
  createdAt: string;
}

export interface NewContractBond {
  tenantId: Id;
  companyId?: Id | null;
  contractId: Id;
  kind: BondKind;
  reference: string;
  bank?: string | null;
  amount: number;
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  createdBy?: Id | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function makeContractBond(input: NewContractBond): ContractBond {
  if (!BOND_KINDS.includes(input.kind)) throw new Error(`invalid bond kind "${input.kind}"`);
  if (!input.reference?.trim()) throw new Error('bond reference is required');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('bond amount must be positive');
  for (const [label, v] of [['issueDate', input.issueDate], ['expiryDate', input.expiryDate]] as const) {
    if (v && !DATE_RE.test(v)) throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    contractId: input.contractId,
    kind: input.kind,
    reference: input.reference.trim(),
    bank: input.bank?.trim() || null,
    amount: Math.round(amount * 100) / 100,
    issueDate: input.issueDate ?? null,
    expiryDate: input.expiryDate ?? null,
    status: 'active',
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export type BondAction = 'release' | 'call' | 'expire';

/** Bank returned/cancelled the instrument (normal completion path). */
export function applyBondAction(b: ContractBond, action: BondAction): ContractBond {
  if (b.status !== 'active') throw new Error(`cannot ${action} a ${b.status} bond`);
  const to: Record<BondAction, BondStatus> = { release: 'released', call: 'called', expire: 'expired' };
  if (!to[action]) throw new Error(`unknown action ${action}`);
  return { ...b, status: to[action] };
}

/** Active bonds whose expiry falls within the window (or already passed). */
export function expiringBonds(bonds: ContractBond[], withinDays: number, today = new Date().toISOString().slice(0, 10)): ContractBond[] {
  const limit = new Date(Date.parse(today) + withinDays * 86400000).toISOString().slice(0, 10);
  return bonds.filter((b) => b.status === 'active' && b.expiryDate !== null && b.expiryDate <= limit);
}

export const BOND_EVENT = {
  added: 'contracts.bond.added',
  released: 'contracts.bond.released',
  called: 'contracts.bond.called',
} as const;
