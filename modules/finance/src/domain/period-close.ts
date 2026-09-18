import { type Id, newId } from '@aura/shared';

// ============================================================
// Finance — Period Close
// ------------------------------------------------------------
// Locking a fiscal period (a calendar month, 'YYYY-MM') so no further journals can be posted into
// it — the control that turns the ledger into a closed set of books.
//
// CLOSING THE BOOKS IS A HISTORY, NOT A FLAG. It used to be a flag: a period was closed iff a row
// existed, and reopening DELETED the row. Close → reopen → close left one row saying "closed once",
// naming only the last person, with no trace that the books had ever been opened again. The events
// were on the spine; every screen, query and control reads the record.
//
// So each close is a GENERATION. Reopening writes who reopened it, when and WHY onto that
// generation, which then stays forever; the next close writes generation n+1. The period's current
// state is the generation with no reopen metadata, and the history is readable behind it.
// ============================================================

export interface PeriodClose {
  id: Id;
  tenantId: Id;
  period: string; // 'YYYY-MM'
  /** Which close of this period this is. 1 is the first; a reopen never consumes a generation. */
  generation: number;
  closedAt: string;
  closedBy: Id | null;
  note: string | null;
  /**
   * Who opened the books again, when, and why — written onto the generation that was reopened, never
   * in place of it. All three or none: a row that says it was reopened and will not say by whom or
   * for what reason is worse than the deletion this replaced, so the database refuses it too.
   */
  reopenedBy: Id | null;
  reopenedAt: string | null;
  reopenReason: string | null;
}

export interface NewPeriodClose {
  tenantId: Id;
  period: string;
  generation?: number;
  closedBy?: Id | null;
  note?: string | null;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The fiscal period ('YYYY-MM') an ISO date/timestamp falls in. */
export function periodOf(isoDate: string): string {
  return (isoDate || '').slice(0, 7);
}

export function isValidPeriod(period: string): boolean {
  return PERIOD_RE.test(period);
}

/** A generation nobody has reopened — i.e. the period is closed right now, by this one. */
export function isCurrentClose(c: PeriodClose): boolean {
  return c.reopenedAt === null;
}

/** The generation that currently holds the period closed, if any. */
export function currentClose(history: readonly PeriodClose[]): PeriodClose | null {
  return history.find(isCurrentClose) ?? null;
}

export function makePeriodClose(input: NewPeriodClose): PeriodClose {
  const period = (input.period || '').trim();
  if (!isValidPeriod(period)) {
    throw new Error(`Invalid period "${input.period}" — expected YYYY-MM`);
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    period,
    generation: input.generation ?? 1,
    closedAt: new Date().toISOString(),
    closedBy: input.closedBy ?? null,
    note: input.note?.trim() || null,
    reopenedBy: null,
    reopenedAt: null,
    reopenReason: null,
  };
}

/**
 * CLOSE the period — as generation n+1 over whatever history already exists.
 *
 * Refuses a period that is already closed rather than returning the existing row. The old behaviour
 * was silently idempotent, which meant a second closer got back somebody else's `closedBy` and a
 * `201`: a success reported for an act that did not happen, by a caller who now believes they closed
 * the books. That is the same lie as reporting a reopen for a period that was never closed.
 */
export function closePeriod(
  history: readonly PeriodClose[],
  input: NewPeriodClose,
): PeriodClose {
  const period = (input.period || '').trim();
  if (!isValidPeriod(period)) throw new Error(`Invalid period "${input.period}" — expected YYYY-MM`);

  const open = currentClose(history);
  if (open) {
    throw new Error(
      `Finance period ${period} is already closed — reopen it before closing it again`,
    );
  }
  const highest = history.reduce((max, c) => Math.max(max, c.generation), 0);
  return makePeriodClose({ ...input, period, generation: highest + 1 });
}

/**
 * REOPEN the period — by writing onto the generation that holds it closed.
 *
 * THE THREE REFUSALS, and none beyond them. AURA holds no authoritative fact today about filed
 * statements, completed tax filings or issued audited financials, so a rule refusing a reopen on any
 * of those grounds would be inventing the fact it claims to check. When such a fact exists, the rule
 * belongs here and not before.
 *
 *   1. the period is not currently closed        — there is nothing to reopen
 *   2. no reason given                           — closing may carry an optional note; reopening may
 *                                                  not be silent, because it is the act that lets the
 *                                                  numbers move again
 *   3. the person who closed it is reopening it  — one signature cannot be both halves of a control
 */
export function reopenPeriod(
  history: readonly PeriodClose[],
  period: string,
  reopenedBy: Id | null,
  reason: string | null | undefined,
): PeriodClose {
  const trimmedPeriod = (period || '').trim();
  if (!isValidPeriod(trimmedPeriod)) throw new Error(`Invalid period "${period}" — expected YYYY-MM`);

  const open = currentClose(history);
  if (!open) {
    // 409, not 404: the endpoint and the period both exist, and the request is well formed. What is
    // wrong is the state — and a second reopen of an already-reopened period lands here too, which
    // is the correct answer to it.
    throw new Error(`Finance period ${trimmedPeriod} is not currently closed`);
  }

  const trimmedReason = (reason ?? '').trim();
  if (!trimmedReason) {
    throw new Error('a reason is required to reopen a closed finance period — reopening the books cannot be silent');
  }

  /**
   * MAKER/CHECKER, and it binds the wildcard holder too. A permission cannot express this: one person
   * legitimately holding the closing authority is the normal arrangement, and the refusal is about
   * WHICH close this actor is undoing, which only the record knows.
   *
   * `unverifiable` is deliberately NOT a concept here. Every row on disk carries `closed_by` or
   * genuinely does not have it; where it is present the check runs, and where it is absent the check
   * cannot run and says so. It is never asserted as having run.
   */
  if (reopenedBy && open.closedBy && reopenedBy === open.closedBy) {
    throw new Error(
      'the person who closed this period may not reopen their own close — a second signature is what makes it a control',
    );
  }

  return {
    ...open,
    reopenedBy: reopenedBy ?? null,
    reopenedAt: new Date().toISOString(),
    reopenReason: trimmedReason,
  };
}

/**
 * Was the author/reopener separation actually CHECKED on this reopen? Derived from the row rather
 * than stored, because both facts it reads are already on the row and a stored duplicate of a derived
 * answer is a second number that can disagree with the first.
 */
export function reopenSeparation(c: PeriodClose): 'enforced' | 'unverifiable' | null {
  if (c.reopenedAt === null) return null;
  return c.closedBy ? 'enforced' : 'unverifiable';
}

export const PERIOD_CLOSE_EVENT = {
  closed: 'finance.period.closed',
  reopened: 'finance.period.reopened',
} as const;
