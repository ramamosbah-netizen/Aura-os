import { type Id, newId } from '@aura/shared';

export interface Payment {
  id: Id;
  tenantId: Id;
  invoiceId: Id;
  bankAccountId: Id;
  amount: number;
  reference: string | null;
  paidAt: string;
  createdBy: Id | null;
}

export interface NewPayment {
  tenantId: Id;
  invoiceId: Id;
  bankAccountId: Id;
  amount: number;
  reference?: string | null;
  createdBy?: Id | null;
}

export function makePayment(input: NewPayment): Payment {
  return {
    id: newId(),
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    bankAccountId: input.bankAccountId,
    amount: Number.isFinite(input.amount) ? Number(input.amount) : 0,
    reference: input.reference?.trim() || null,
    paidAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}
