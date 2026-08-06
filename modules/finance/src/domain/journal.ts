import { type Id, newId } from '@aura/shared';

export interface JournalLine {
  id: Id;
  accountId: Id;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  /** Optional cost-centre tag for management (cost-centre) reporting. */
  costCenterId: Id | null;
  /** Optional profit-centre tag for contribution reporting. */
  profitCenterId: Id | null;
}

export interface Journal {
  id: Id;
  tenantId: Id;
  /** Owning company within the tenant — the dimension that enables group consolidation. */
  companyId: Id | null;
  reference: string | null;
  description: string;
  postedAt: string;
  createdBy: Id | null;
  /** Set when this entry is an intra-group (intercompany) transaction with another group
   * company — consolidation reverses such entries so intra-group amounts net to zero. */
  counterpartyCompanyId: Id | null;
  lines: JournalLine[];
}

export interface NewJournalLine {
  accountId: Id;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId?: Id | null;
  profitCenterId?: Id | null;
}

export interface NewJournal {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  description: string;
  createdBy?: Id | null;
  /** ISO date/timestamp the entry is posted on (defaults to now). Enables backdated
   * entries — and lets period-close reject posting into a closed prior month. */
  postedAt?: string | null;
  /** Counterparty group company for an intercompany entry (eliminated on consolidation). */
  counterpartyCompanyId?: Id | null;
  lines: NewJournalLine[];
}

/**
 * Journal integrity. Balance alone is not enough — three shapes balance perfectly and are still
 * not valid double entry, and all three used to be accepted here:
 *
 *  1. NO LINES. `0 === 0`, so an empty journal passed. The DB trigger cannot catch this either:
 *     it fires on `aura_finance_journal_lines`, so a header with zero lines never triggers it.
 *     The result is a meaningless entry in the ledger that every report has to skip.
 *
 *  2. NEGATIVE AMOUNTS. `debit: -500` balances against `debit: 0, credit: -500`, and because
 *     statements derive a balance as `debits − credits`, a negative debit is arithmetically
 *     identical to a positive credit — so the account balance comes out RIGHT while the entry is
 *     recorded on the WRONG SIDE. The trial balance's debit and credit columns are then both
 *     wrong, and nothing anywhere detects it, because the thing everyone checks (balance) nets.
 *     This is the dangerous one: silently wrong books that pass every existing check.
 *
 *  3. A LINE CARRYING BOTH A DEBIT AND A CREDIT. Nets to zero within the line. Not an entry —
 *     it is two entries, or a mistake, and it makes per-side turnover meaningless.
 *
 * Enforced here rather than only in the DB because the in-memory runtime has no trigger, and a
 * rule that only holds in one of two runtimes is not a rule.
 */
export function makeJournal(input: NewJournal): Journal {
  if (!input.lines || input.lines.length === 0) {
    throw new Error('Double-entry validation failed: a journal must have at least one line');
  }

  for (const [i, l] of input.lines.entries()) {
    if (!Number.isFinite(l.debit) || !Number.isFinite(l.credit)) {
      throw new Error(`Double-entry validation failed: line ${i + 1} (${l.accountCode}) has a non-numeric amount`);
    }
    if (l.debit < 0 || l.credit < 0) {
      throw new Error(
        `Double-entry validation failed: line ${i + 1} (${l.accountCode}) has a negative amount ` +
          `(debit ${l.debit}, credit ${l.credit}). Post the opposite side instead of a negative.`,
      );
    }
    if (l.debit > 0 && l.credit > 0) {
      throw new Error(
        `Double-entry validation failed: line ${i + 1} (${l.accountCode}) carries both a debit ` +
          `(${l.debit}) and a credit (${l.credit}) — split it into two lines.`,
      );
    }
    if (l.debit === 0 && l.credit === 0) {
      throw new Error(`Double-entry validation failed: line ${i + 1} (${l.accountCode}) has no amount`);
    }
  }

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
    costCenterId: l.costCenterId ?? null,
    profitCenterId: l.profitCenterId ?? null,
  }));

  return {
    id: newId(),
    tenantId: eClean(input.tenantId),
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    description: input.description.trim(),
    postedAt: input.postedAt || new Date().toISOString(),
    createdBy: input.createdBy ?? null,
    counterpartyCompanyId: input.counterpartyCompanyId ?? null,
    lines,
  };
}

/**
 * Consolidation eliminations — for every intercompany-tagged journal (has counterpartyCompanyId),
 * build a reversing journal (debit↔credit swapped) so that, when added to the group journal set,
 * intra-group revenue/expense and receivables/payables net to zero in the consolidated column.
 */
export function buildEliminations(journals: Journal[]): Journal[] {
  return journals
    .filter((j) => !!j.counterpartyCompanyId)
    .map((j) => ({
      ...j,
      id: `elim:${j.id}`,
      companyId: null,
      counterpartyCompanyId: null,
      reference: `ELIM-${j.reference ?? j.id}`,
      description: `Intercompany elimination: ${j.description}`,
      lines: j.lines.map((l) => ({ ...l, id: `elim:${l.id}`, debit: l.credit, credit: l.debit })),
    }));
}

/** Net intra-group totals removed by elimination (debits === credits by construction). */
export function eliminationTotal(journals: Journal[]): number {
  return journals
    .filter((j) => !!j.counterpartyCompanyId)
    .reduce((sum, j) => sum + j.lines.reduce((s, l) => s + l.debit, 0), 0);
}

function eClean(str: string): string {
  return str.trim();
}
