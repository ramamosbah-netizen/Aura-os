import { type Id, newId } from '@aura/shared';

export type BankTransactionStatus = 'unreconciled' | 'matched' | 'manual';

export interface BankTransaction {
  id: Id;
  tenantId: Id;
  bankAccountId: Id;
  transactionDate: string;
  amount: number;
  description: string;
  reference: string | null;
  reconciledPaymentId: Id | null;
  status: BankTransactionStatus;
  createdAt: string;
}

export interface NewBankTransaction {
  tenantId: Id;
  bankAccountId: Id;
  transactionDate: string;
  amount: number;
  description: string;
  reference?: string | null;
}

export function makeBankTransaction(input: NewBankTransaction): BankTransaction {
  return {
    id: newId(),
    tenantId: input.tenantId,
    bankAccountId: input.bankAccountId,
    transactionDate: input.transactionDate,
    amount: Number(input.amount),
    description: input.description.trim(),
    reference: input.reference?.trim() || null,
    reconciledPaymentId: null,
    status: 'unreconciled',
    createdAt: new Date().toISOString(),
  };
}
