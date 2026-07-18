import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type AccessService, type EventStore } from '@aura/core';
import { SignalService } from './signal.service';
import { InMemorySignalStore } from './in-memory-signal-store';
import { InMemoryLeadStore } from './in-memory-lead-store';
import { InMemoryAccountStore } from './in-memory-account-store';
import { makeAccount } from './domain/account';

/**
 * S3 Signal + Opportunity Radar E2E — proves promotion preserves source attribution (invariant #10),
 * promotion is idempotent (a promoted signal creates no second lead), and dedupeKey stops a reactor
 * from stacking duplicate signals (invariant #11 foundation).
 */
function harness() {
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const signals = new InMemorySignalStore();
  const leads = new InMemoryLeadStore();
  const accounts = new InMemoryAccountStore();
  const svc = new SignalService(signals, leads, events, new NullTxRunner(), access, accounts);
  return { svc, signals, leads, accounts };
}

describe('SignalService', () => {
  it('detects a signal on the radar (open)', async () => {
    const { svc, signals } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'RFQ from Globex', source: 'INBOUND', type: 'RFQ_RECEIVED', accountName: 'Globex' });
    expect(s.status).toBe('NEW');
    expect((await signals.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('is idempotent on dedupeKey — a reactor re-firing does not stack duplicates', async () => {
    const { svc, signals } = harness();
    const a = await svc.create({ tenantId: 't1', title: 'Contract C-1 expiring', source: 'CONTRACT_LIFECYCLE', type: 'RENEWAL_DUE', dedupeKey: 'renewal:C-1' });
    const b = await svc.create({ tenantId: 't1', title: 'Contract C-1 expiring', source: 'CONTRACT_LIFECYCLE', type: 'RENEWAL_DUE', dedupeKey: 'renewal:C-1' });
    expect(b.id).toBe(a.id);
    expect((await signals.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('promotes to a lead preserving source attribution (signalId + mapped source)', async () => {
    const { svc, leads } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'Referral: Initech expansion', source: 'REFERRAL', type: 'EXPANSION', accountName: 'Initech', ownerId: 'u7' });

    const res = await svc.promote(s.id, 'u1');

    expect(res.idempotentReplay).toBe(false);
    expect(res.signal.status).toBe('PROMOTED');
    expect(res.signal.promotedLeadId).toBe(res.lead.id);
    // lineage + attribution on the created lead
    expect(res.lead.signalId).toBe(s.id);
    expect(res.lead.source).toBe('referral');
    expect(res.lead.companyName).toBe('Initech');
    expect(res.lead.assignedTo).toBe('u7');
    expect((await leads.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('promote carries evidence to the lead and resolves the account by name (zero re-entry)', async () => {
    const { svc, accounts } = harness();
    const acct = makeAccount({ tenantId: 't1', name: 'Sustainable City', status: 'active_customer' });
    await accounts.create(acct);
    const s = await svc.create({
      tenantId: 't1', title: 'Sustainable City CCTV expansion', source: 'RELATIONSHIP', type: 'EXPANSION',
      accountName: 'Sustainable City', evidence: 'Client asked to expand CCTV to phase 2.',
    });

    const res = await svc.promote(s.id, 'u1');

    expect(res.lead.requirement).toBe('Client asked to expand CCTV to phase 2.'); // evidence → requirement
    expect(res.lead.accountId).toBe(acct.id); // name-only signal resolved + linked to the existing account
    expect(res.lead.source).toBe('referral'); // RELATIONSHIP no longer degrades to 'other'
  });

  it('cannot promote twice — replays idempotently and creates no second lead', async () => {
    const { svc, leads } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'New tender detected', source: 'TENDER_DISCOVERY', type: 'TENDER_DETECTED' });

    const first = await svc.promote(s.id, 'u1');
    const second = await svc.promote(s.id, 'u1');

    expect(second.idempotentReplay).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);
    expect((await leads.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('dismiss records the reason and freezes the signal', async () => {
    const { svc } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'Market rumor', source: 'MARKET', type: 'MARKET_EVENT' });
    const d = await svc.dismiss(s.id, 'no budget', false, 'u1');
    expect(d.status).toBe('DISMISSED');
    expect(d.dismissalReason).toBe('no budget');
    await expect(svc.promote(s.id, 'u1')).rejects.toThrow();
  });
});
