import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { BankGuaranteeService } from './bank-guarantee.service';
import { InMemoryBankGuaranteeStore } from './in-memory-bank-guarantee-store';
import type { NewBankGuarantee } from './domain/bank-guarantee';

// Service-level coverage for bank guarantees / bonds: lifecycle transitions (active only), and the
// treasury expiry watch-list — which must surface a still-active guarantee whose expiry has passed
// (the bank keeps charging commission on it).

const events = () => ({ append: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const T = 't-bg';
const daysFromNow = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function harness() {
  const store = new InMemoryBankGuaranteeStore();
  const svc = new BankGuaranteeService(store, events());
  const base: Omit<NewBankGuarantee, 'reference'> = {
    tenantId: T, type: 'performance', beneficiary: 'Main Contractor LLC', bankName: 'ADCB',
    amount: 250_000, issueDate: '2026-01-01', expiryDate: '2026-12-31',
  };
  const create = (over: Partial<NewBankGuarantee> & { reference: string }) => svc.create({ ...base, ...over });
  return { store, svc, create };
}

describe('BankGuaranteeService — lifecycle', () => {
  it('creates a guarantee active, defaulting currency to AED', async () => {
    const { create } = harness();
    const g = await create({ reference: 'BG-1' });
    expect(g.status).toBe('active');
    expect(g.currency).toBe('AED');
  });

  it('releases, claims or expires an active guarantee', async () => {
    const { create, svc } = harness();
    const released = await svc.changeStatus((await create({ reference: 'BG-R' })).id, 'release');
    expect(released.status).toBe('released');
    const claimed = await svc.changeStatus((await create({ reference: 'BG-C' })).id, 'claim');
    expect(claimed.status).toBe('claimed');
    const expired = await svc.changeStatus((await create({ reference: 'BG-E' })).id, 'expire');
    expect(expired.status).toBe('expired');
  });

  it('refuses a transition from a non-active status', async () => {
    const { create, svc } = harness();
    const g = await create({ reference: 'BG-1' });
    await svc.changeStatus(g.id, 'release');
    // The domain phrases the guard from the target status: "cannot released a guarantee in status released".
    await expect(svc.changeStatus(g.id, 'release')).rejects.toThrow(/guarantee in status released/i);
  });
});

describe('BankGuaranteeService — expiry watch-list', () => {
  it('includes a still-active guarantee whose expiry has already passed', async () => {
    const { create, svc } = harness();
    await create({ reference: 'OVERDUE', issueDate: daysFromNow(-400), expiryDate: daysFromNow(-10) });
    await create({ reference: 'SOON', issueDate: daysFromNow(-5), expiryDate: daysFromNow(10) });
    await create({ reference: 'FAR', issueDate: daysFromNow(-5), expiryDate: daysFromNow(200) });
    const refs = (await svc.expiringSoon(T, 30)).map((g) => g.reference);
    expect(refs).toContain('OVERDUE'); // most urgent — was dropped before the fix
    expect(refs).toContain('SOON');
    expect(refs).not.toContain('FAR');
  });

  it('excludes a guarantee that is no longer active', async () => {
    const { create, svc } = harness();
    const g = await create({ reference: 'RELEASED', issueDate: daysFromNow(-5), expiryDate: daysFromNow(10) });
    await svc.changeStatus(g.id, 'release');
    const refs = (await svc.expiringSoon(T, 30)).map((x) => x.reference);
    expect(refs).not.toContain('RELEASED');
  });
});
