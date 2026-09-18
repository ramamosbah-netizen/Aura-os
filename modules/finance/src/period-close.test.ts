import { describe, it, expect, beforeEach } from 'vitest';
import { AccessService, type EventStore } from '@aura/core';
import { JournalService } from './journal.service';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { InMemoryPeriodCloseStore } from './in-memory-period-close-store';
import { PeriodCloseService } from './period-close.service';
import { reopenSeparation } from './domain/period-close';

// A no-op event store — these tests exercise the period-close guard, not the spine.
const fakeEvents = { append: async () => {} } as unknown as EventStore;

const tenantId = 't-pc';
const balancedLines = [
  { accountId: 'a-cash', accountCode: '1000', accountName: 'Cash', debit: 100, credit: 0 },
  { accountId: 'a-rev', accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 100 },
];
const journalOn = (postedAt: string) => ({ tenantId, description: `entry ${postedAt}`, postedAt, lines: balancedLines });

describe('Period close — journal posting guard', () => {
  let journals: JournalService;
  let periods: PeriodCloseService;
  let periodStore: InMemoryPeriodCloseStore;

  beforeEach(() => {
    periodStore = new InMemoryPeriodCloseStore();
    journals = new JournalService(new InMemoryJournalStore(), fakeEvents, periodStore, new AccessService());
    periods = new PeriodCloseService(periodStore, fakeEvents);
  });

  it('allows posting into an open period', async () => {
    const j = await journals.post(journalOn('2026-01-15T00:00:00.000Z'));
    expect(j.id).toBeTruthy();
  });

  it('blocks posting into a closed period', async () => {
    await periods.close(tenantId, '2026-01');
    expect(await periods.isClosed(tenantId, '2026-01')).toBe(true);
    await expect(journals.post(journalOn('2026-01-20T00:00:00.000Z'))).rejects.toThrow(/Period 2026-01 is closed/);
  });

  it('still allows posting into other (open) periods after a close', async () => {
    await periods.close(tenantId, '2026-01');
    const feb = await journals.post(journalOn('2026-02-10T00:00:00.000Z'));
    expect(feb.id).toBeTruthy();
  });

  it('re-opening a period restores posting', async () => {
    await periods.close(tenantId, '2026-01', 'u-controller-a');
    await expect(journals.post(journalOn('2026-01-05T00:00:00.000Z'))).rejects.toThrow();
    // A reason and a second actor are now required — the lock behaviour this test is about is
    // unchanged, and reopening is no longer something that can happen silently or by the closer.
    await periods.reopen(tenantId, '2026-01', 'u-controller-b', 'late supplier invoice for January');
    expect(await periods.isClosed(tenantId, '2026-01')).toBe(false);
    const j = await journals.post(journalOn('2026-01-05T00:00:00.000Z'));
    expect(j.id).toBeTruthy();
  });

  it('refuses a SECOND close rather than quietly returning the first', async () => {
    // This test used to assert the opposite: `close` was silently idempotent and handed the second
    // caller back the first row. That is a success reported for an act that did not happen — the
    // caller reads `closedBy` and finds somebody else's name against their own 201. Same lie as the
    // reopen of a period that was never closed.
    const first = await periods.close(tenantId, '2026-03', 'u-controller-a');
    await expect(periods.close(tenantId, '2026-03', 'u-controller-b')).rejects.toThrow(/already closed/);
    expect((await periods.list(tenantId)).length).toBe(1);
    expect((await periods.list(tenantId))[0].id).toBe(first.id);
    await expect(periods.close(tenantId, '2026-13')).rejects.toThrow(/Invalid period/);
  });

  it('keeps every close of a period, with who reopened each one and why', async () => {
    // THE FINDING. Reopening used to DELETE the row, so close → reopen → close left one row reading
    // "closed once" and naming only the last closer. The books were opened again and the register
    // could not say so.
    await periods.close(tenantId, '2026-04', 'u-controller-a', 'April month-end');
    await periods.reopen(tenantId, '2026-04', 'u-controller-b', 'late supplier invoice');
    await periods.close(tenantId, '2026-04', 'u-controller-a', 'April re-close');

    const history = await periods.history(tenantId, '2026-04');
    expect(history).toHaveLength(2);

    const [current, first] = history; // newest generation first
    expect(current.generation).toBe(2);
    expect(current.closedBy).toBe('u-controller-a');
    expect(current.reopenedAt).toBeNull(); // the generation that holds it closed now

    expect(first.generation).toBe(1);
    expect(first.closedBy).toBe('u-controller-a');
    expect(first.reopenedBy).toBe('u-controller-b');
    expect(first.reopenReason).toBe('late supplier invoice');

    // The register still answers the simple question with one row per period.
    const register = await periods.list(tenantId);
    expect(register.filter((p) => p.period === '2026-04')).toHaveLength(1);
  });

  it('refuses the three things a reopen can get wrong, and nothing beyond them', async () => {
    // NOTHING TO REOPEN. Not 404 — the period and the endpoint both exist; the state does not.
    await expect(periods.reopen(tenantId, '2026-05', 'u-controller-b', 'why'))
      .rejects.toThrow(/2026-05 is not currently closed/);

    await periods.close(tenantId, '2026-05', 'u-controller-a', 'May month-end');

    // NO REASON. Closing may carry an optional note; reopening may not be silent.
    await expect(periods.reopen(tenantId, '2026-05', 'u-controller-b', '   '))
      .rejects.toThrow(/a reason is required/);

    // THE CLOSER. One signature cannot be both halves of a control, whatever permission it carries.
    await expect(periods.reopen(tenantId, '2026-05', 'u-controller-a', 'changed my mind'))
      .rejects.toThrow(/may not reopen their own close/);

    const reopened = await periods.reopen(tenantId, '2026-05', 'u-controller-b', 'late accrual');
    expect(reopened.reopenReason).toBe('late accrual');

    // A SECOND reopen lands on the first refusal, because there is no longer a close to undo.
    await expect(periods.reopen(tenantId, '2026-05', 'u-controller-c', 'again'))
      .rejects.toThrow(/2026-05 is not currently closed/);
  });

  it('says the separation was UNVERIFIABLE when the close never recorded who made it', async () => {
    // A row closed before the closer was recorded cannot be compared against anybody, so the reopen
    // proceeds and the answer says the check could not run. It is never asserted as enforced.
    await periods.close(tenantId, '2026-06', null, 'closed by an unrecorded actor');
    const reopened = await periods.reopen(tenantId, '2026-06', 'u-controller-b', 'correction');
    expect(reopenSeparation(reopened)).toBe('unverifiable');

    await periods.close(tenantId, '2026-07', 'u-controller-a');
    expect(reopenSeparation(await periods.reopen(tenantId, '2026-07', 'u-controller-b', 'correction')))
      .toBe('enforced');
  });
});
