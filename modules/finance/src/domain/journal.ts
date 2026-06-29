import { type Id, newId } from '@aura/shared';

export interface JournalLine {
  id: Id;
  accountId: Id;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface Journal {
  id: Id;
  tenantId: Id;
  reference: string | null;
  description: string;
  postedAt: string;
  createdBy: Id | null;
  lines: JournalLine[];
}

export interface NewJournalLine {
  accountId: Id;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface NewJournal {
  tenantId: Id;
  reference?: string | null;
  description: string;
  createdBy?: Id | null;
  lines: NewJournalLine[];
}

export function makeJournal(input: NewJournal): Journal {
  const sumDebits = input.lines.reduce((sum, l) => sum + l.debit, 0);
  const sumCredits = input.lines.reduce((sum, l) => sum + l.credit, 0);

  // Use a small epsilon for floating point comparison if necessary, but here we assume rounded cents/values
  if (Math.abs(sumDebits - sumCredits) > 0.001) {
    throw new Error(`Double-entry validation failed: Sum of Debits (${sumDebits}) must equal Sum of Credits (${sumCredits})`);
  }

  const lines: JournalLine[] = input.lines.map((l) => ({
    id: newId(),
    accountId: l.accountId,
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: l.debit,
    credit: l.credit,
  }));

  return {
    id: newId(),
    tenantId: eClean(input.tenantId),
    reference: input.reference?.trim() || null,
    description: input.description.trim(),
    postedAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
    lines,
  };
}

function eClean(str: string): string {
  return str.trim();
}
