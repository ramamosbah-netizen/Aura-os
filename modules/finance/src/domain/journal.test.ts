import { describe, it, expect } from 'vitest';
import { makeJournal, buildEliminations, eliminationTotal } from './journal';

const line = (code: string, debit: number, credit: number) => ({
  accountId: `acc-${code}`,
  accountCode: code,
  accountName: `Account ${code}`,
  debit,
  credit,
});

const journal = (lines: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) =>
  makeJournal({ tenantId: 't1', description: 'Test entry', lines, ...extra });

// journal.ts had no test of its own before this file, despite being the integrity core of the
// whole ledger — every statement, every balance and every consolidated figure folds from it.
describe('makeJournal — a valid entry', () => {
  it('accepts a balanced two-line entry and assigns ids', () => {
    const j = journal([line('1000', 500, 0), line('4000', 0, 500)]);
    expect(j.lines).toHaveLength(2);
    expect(j.lines[0].id).toBeTruthy();
    expect(j.lines[0].id).not.toBe(j.lines[1].id);
  });

  it('accepts a many-line entry that balances in aggregate', () => {
    const j = journal([line('1000', 1000, 0), line('4000', 0, 750), line('2100', 0, 250)]);
    expect(j.lines).toHaveLength(3);
  });

  it('defaults the optional dimensions to null rather than undefined', () => {
    const j = journal([line('1000', 100, 0), line('4000', 0, 100)]);
    expect(j.lines[0].costCenterId).toBeNull();
    expect(j.lines[0].profitCenterId).toBeNull();
    expect(j.companyId).toBeNull();
    expect(j.counterpartyCompanyId).toBeNull();
  });

  it('tolerates sub-fils rounding drift between the two sides', () => {
    expect(() => journal([line('1000', 100.0004, 0), line('4000', 0, 100)])).not.toThrow();
  });
});

describe('makeJournal — refuses entries that balance but are not double entry', () => {
  // Each of these three used to be ACCEPTED. All balance; none is a valid entry.

  it('refuses a journal with no lines', () => {
    // 0 === 0, so this passed the balance check — and the DB trigger fires on journal_lines,
    // so an empty header never reached it either. Meaningless entry, invisible to both guards.
    expect(() => journal([])).toThrow(/at least one line/);
  });

  it('refuses negative amounts — the silent-corruption case', () => {
    // `debit: -500` balances against `credit: -500`, and since a balance is derived as
    // (debits − credits), a negative debit is arithmetically a positive credit. The ACCOUNT
    // BALANCE therefore comes out correct while the entry sits on the wrong side, leaving the
    // trial balance's debit and credit columns both wrong with nothing to detect it.
    expect(() => journal([line('1000', -500, 0), line('4000', 0, -500)])).toThrow(/negative amount/);
    expect(() => journal([line('1000', 0, -500), line('4000', -500, 0)])).toThrow(/negative amount/);
  });

  it('refuses a single line carrying both a debit and a credit', () => {
    expect(() => journal([line('1000', 100, 100)])).toThrow(/both a debit/);
  });

  it('refuses a line with no amount at all', () => {
    expect(() => journal([line('1000', 500, 0), line('4000', 0, 500), line('9999', 0, 0)])).toThrow(/no amount/);
  });

  it('refuses non-numeric amounts', () => {
    expect(() => journal([line('1000', Number.NaN, 0), line('4000', 0, 0)])).toThrow(/non-numeric/);
    expect(() => journal([line('1000', Number.POSITIVE_INFINITY, 0), line('4000', 0, 1)])).toThrow(/non-numeric/);
  });

  it('still refuses a genuinely unbalanced entry', () => {
    expect(() => journal([line('1000', 500, 0), line('4000', 0, 400)])).toThrow(/Sum of Debits/);
  });

  it('names the offending line so the error is actionable', () => {
    expect(() => journal([line('1000', 500, 0), line('2100', -500, 0)])).toThrow(/line 2 \(2100\)/);
  });
});

describe('buildEliminations — intercompany consolidation', () => {
  const intercompany = journal([line('1200', 10_000, 0), line('4000', 0, 10_000)], {
    companyId: 'co-a',
    counterpartyCompanyId: 'co-b',
    reference: 'IC-001',
  });
  const ordinary = journal([line('1000', 500, 0), line('4000', 0, 500)], { companyId: 'co-a' });

  it('reverses only the intercompany-tagged journals', () => {
    const elims = buildEliminations([intercompany, ordinary]);
    expect(elims).toHaveLength(1);
    expect(elims[0].reference).toBe('ELIM-IC-001');
  });

  it('swaps debit and credit so the pair nets to zero', () => {
    const [elim] = buildEliminations([intercompany]);
    expect(elim.lines[0]).toMatchObject({ debit: 0, credit: 10_000 });
    expect(elim.lines[1]).toMatchObject({ debit: 10_000, credit: 0 });
  });

  it('clears the company tags so the reversal lands in the group column', () => {
    const [elim] = buildEliminations([intercompany]);
    expect(elim.companyId).toBeNull();
    expect(elim.counterpartyCompanyId).toBeNull();
  });

  it('leaves the elimination itself balanced', () => {
    const [elim] = buildEliminations([intercompany]);
    const d = elim.lines.reduce((s, l) => s + l.debit, 0);
    const c = elim.lines.reduce((s, l) => s + l.credit, 0);
    expect(d).toBe(c);
  });

  it('totals only the intra-group amount removed', () => {
    expect(eliminationTotal([intercompany, ordinary])).toBe(10_000);
    expect(eliminationTotal([ordinary])).toBe(0);
  });
});
