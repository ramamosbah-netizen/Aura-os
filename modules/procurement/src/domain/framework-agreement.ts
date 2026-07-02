import { type Id, newId } from '@aura/shared';

// Procurement domain — framework-free. A FrameworkAgreement (blanket agreement) locks a
// supplier to agreed rates over a validity window with a ceiling value; call-off POs draw
// down against the ceiling. The agreement carries the supplier reference + name snapshot
// (no join) and a jsonb rate card.

export type FrameworkAgreementStatus = 'draft' | 'active' | 'terminated';

export interface FrameworkRateItem {
  description: string;
  unit: string;
  rate: number;
}

export interface FrameworkAgreement {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** Agreement number (FA-…). */
  reference: string | null;
  title: string;
  supplierId: Id;
  supplierName: string | null;
  status: FrameworkAgreementStatus;
  /** Validity window, YYYY-MM-DD inclusive. */
  validFrom: string;
  validTo: string;
  /** Maximum total drawdown. */
  ceilingValue: number;
  /** Running total of call-off PO values. */
  calledOffValue: number;
  /** Agreed rate card. */
  items: FrameworkRateItem[];
  notes: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewFrameworkAgreement {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  supplierId: Id;
  supplierName?: string | null;
  validFrom: string;
  validTo: string;
  ceilingValue: number;
  items?: FrameworkRateItem[];
  notes?: string | null;
  createdBy?: Id | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function makeFrameworkAgreement(input: NewFrameworkAgreement): FrameworkAgreement {
  if (!input.title?.trim()) throw new Error('title is required');
  if (!input.supplierId) throw new Error('supplierId is required');
  if (!DATE_RE.test(input.validFrom ?? '')) throw new Error('validFrom must be YYYY-MM-DD');
  if (!DATE_RE.test(input.validTo ?? '')) throw new Error('validTo must be YYYY-MM-DD');
  if (input.validTo < input.validFrom) throw new Error('validTo cannot be before validFrom');
  const ceilingValue = Number(input.ceilingValue);
  if (!Number.isFinite(ceilingValue) || ceilingValue <= 0) throw new Error('ceilingValue must be positive');

  const items = (input.items ?? []).map((i) => {
    if (!i.description?.trim()) throw new Error('rate item description is required');
    if (!i.unit?.trim()) throw new Error('rate item unit is required');
    const rate = Number(i.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new Error('rate item rate cannot be negative');
    return { description: i.description.trim(), unit: i.unit.trim(), rate: r2(rate) };
  });

  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    supplierId: input.supplierId,
    supplierName: input.supplierName?.trim() || null,
    status: 'draft',
    validFrom: input.validFrom,
    validTo: input.validTo,
    ceilingValue: r2(ceilingValue),
    calledOffValue: 0,
    items,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export function activateAgreement(fa: FrameworkAgreement): FrameworkAgreement {
  if (fa.status !== 'draft') throw new Error(`only a draft agreement can be activated (status ${fa.status})`);
  return { ...fa, status: 'active' };
}

export function terminateAgreement(fa: FrameworkAgreement): FrameworkAgreement {
  if (fa.status === 'terminated') throw new Error('agreement is already terminated');
  return { ...fa, status: 'terminated' };
}

export function remainingValue(fa: FrameworkAgreement): number {
  return r2(fa.ceilingValue - fa.calledOffValue);
}

/** Within the validity window (inclusive)? `today` is YYYY-MM-DD. */
export function isWithinValidity(fa: FrameworkAgreement, today: string = new Date().toISOString().slice(0, 10)): boolean {
  return today >= fa.validFrom && today <= fa.validTo;
}

/**
 * Draw a call-off against the agreement: must be active, within validity, positive, and
 * within the remaining ceiling. Returns the agreement with the drawdown applied.
 */
export function recordCallOff(fa: FrameworkAgreement, value: number, today?: string): FrameworkAgreement {
  if (fa.status !== 'active') throw new Error(`agreement is not active (status ${fa.status})`);
  if (!isWithinValidity(fa, today)) throw new Error(`agreement is outside its validity window (${fa.validFrom}..${fa.validTo})`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('call-off value must be positive');
  if (amount > remainingValue(fa)) {
    throw new Error(`call-off ${amount} exceeds remaining ceiling ${remainingValue(fa)} (ceiling ${fa.ceilingValue}, called off ${fa.calledOffValue})`);
  }
  return { ...fa, calledOffValue: r2(fa.calledOffValue + amount) };
}

export const FRAMEWORK_EVENT = {
  created: 'procurement.framework.created',
  activated: 'procurement.framework.activated',
  terminated: 'procurement.framework.terminated',
  callOff: 'procurement.framework.call_off',
} as const;
