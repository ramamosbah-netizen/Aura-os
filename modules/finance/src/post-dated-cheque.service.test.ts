import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { PostDatedChequeService } from './post-dated-cheque.service';
import { InMemoryPostDatedChequeStore } from './in-memory-post-dated-cheque-store';
import type { NewPostDatedCheque } from './domain/post-dated-cheque';

// Service-level coverage for post-dated cheques: lifecycle transitions, the bounce counter (a UAE
// credit matter), the treasury watch-list, and single-currency summary totals.

const events = () => ({ append: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const T = 't-pdc';
const daysFromNow = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function harness() {
  const store = new InMemoryPostDatedChequeStore();
  const svc = new PostDatedChequeService(store, events());
  const base: Omit<NewPostDatedCheque, 'chequeNumber'> = {
    tenantId: T, direction: 'received', partyName: 'Debtor Co', bankName: 'ENBD',
    amount: 50_000, issueDate: '2026-01-01', maturityDate: '2026-03-01',
  };
  const create = (over: Partial<NewPostDatedCheque> & { chequeNumber: string }) => svc.create({ ...base, ...over });
  return { store, svc, create };
}

describe('PostDatedChequeService — lifecycle', () => {
  it('creates a cheque pending with a zero bounce count', async () => {
    const { create } = harness();
    const c = await create({ chequeNumber: 'CHQ-1' });
    expect(c.status).toBe('pending');
    expect(c.bounceCount).toBe(0);
  });

  it('runs the happy path pending → deposited → cleared', async () => {
    const { svc, create } = harness();
    const c = await create({ chequeNumber: 'CHQ-1' });
    await svc.changeStatus(c.id, 'deposit');
    const cleared = await svc.changeStatus(c.id, 'clear');
    expect(cleared.status).toBe('cleared');
  });

  it('counts a bounce on the bounce, not on re-presentation, and counts a second bounce', async () => {
    const { svc, create } = harness();
    const c = await create({ chequeNumber: 'CHQ-1' });
    await svc.changeStatus(c.id, 'deposit');
    const bounced = await svc.changeStatus(c.id, 'bounce');
    expect(bounced.status).toBe('bounced');
    expect(bounced.bounceCount).toBe(1);
    await svc.changeStatus(c.id, 'represent'); // back to deposited — NOT a new bounce
    const reBounced = await svc.changeStatus(c.id, 'bounce');
    expect(reBounced.bounceCount).toBe(2);
  });

  it('rejects an invalid transition (clearing a pending cheque)', async () => {
    const { svc, create } = harness();
    const c = await create({ chequeNumber: 'CHQ-1' });
    await expect(svc.changeStatus(c.id, 'clear')).rejects.toThrow(/only a deposited cheque can clear/i);
  });
});

describe('PostDatedChequeService — watch-list & summary', () => {
  it('surfaces a pending cheque already overdue, not just future ones', async () => {
    const { create, svc } = harness();
    await create({ chequeNumber: 'OVERDUE', maturityDate: daysFromNow(-5), issueDate: daysFromNow(-40) });
    await create({ chequeNumber: 'FUTURE', maturityDate: daysFromNow(100), issueDate: daysFromNow(-1) });
    const soon = await svc.maturingSoon(T, 7);
    const numbers = soon.map((c) => c.chequeNumber);
    expect(numbers).toContain('OVERDUE'); // overdue is the most urgent, must appear
    expect(numbers).not.toContain('FUTURE');
  });

  it('does not add different currencies into one headline total', async () => {
    const { create, svc } = harness();
    await create({ chequeNumber: 'AED-1', amount: 100_000, currency: 'AED' });
    await create({ chequeNumber: 'USD-1', amount: 10_000, currency: 'USD' });
    const s = await svc.summary(T);
    expect(s.receivablePending).toBe(100_000); // base (AED) only — never 110,000
    expect(s.byCurrency.USD.receivablePending).toBe(10_000);
  });
});
