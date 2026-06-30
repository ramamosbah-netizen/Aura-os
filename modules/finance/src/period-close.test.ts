import { describe, it, expect, beforeEach } from 'vitest';
import { AccessService, type EventStore } from '@aura/core';
import { JournalService } from './journal.service';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { InMemoryPeriodCloseStore } from './in-memory-period-close-store';
import { PeriodCloseService } from './period-close.service';

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
    await periods.close(tenantId, '2026-01');
    await expect(journals.post(journalOn('2026-01-05T00:00:00.000Z'))).rejects.toThrow();
    await periods.reopen(tenantId, '2026-01');
    expect(await periods.isClosed(tenantId, '2026-01')).toBe(false);
    const j = await journals.post(journalOn('2026-01-05T00:00:00.000Z'));
    expect(j.id).toBeTruthy();
  });

  it('close is idempotent and rejects malformed periods', async () => {
    const a = await periods.close(tenantId, '2026-03');
    const b = await periods.close(tenantId, '2026-03');
    expect(b.id).toBe(a.id); // same row, not a duplicate
    expect((await periods.list(tenantId)).length).toBe(1);
    await expect(periods.close(tenantId, '2026-13')).rejects.toThrow(/Invalid period/);
  });
});
