import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, TenantContext, type AccessService, type EventStore } from '@aura/core';
import { SignalService } from './signal.service';
import { InMemorySignalStore } from './in-memory-signal-store';
import { InMemoryLeadStore } from './in-memory-lead-store';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryContactStore } from './in-memory-contact-store';
import { makeAccount } from './domain/account';
import { makeContact } from './domain/contact';
import { makeLead } from '@aura/shared';

const makeLeadForTest = (tenantId: string, companyName: string) => makeLead({
  tenantId, name: companyName, companyName, source: 'other', signalId: null,
});

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
  return { svc, signals, leads, accounts, access, events };
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

  it('serializes concurrent promotions through the transaction boundary', async () => {
    const { signals, leads, accounts, access, events } = harness();
    let tail = Promise.resolve();
    const serialTx = {
      run<T>(fn: (handle: null) => Promise<T>): Promise<T> {
        const turn = tail.then(() => fn(null));
        tail = turn.then(() => undefined, () => undefined);
        return turn;
      },
    };
    const svc = new SignalService(signals, leads, events, serialTx, access, accounts);
    const signal = await svc.create({ tenantId: 't1', title: 'Concurrent signal', source: 'MANUAL', type: 'OTHER' });
    const [a, b] = await Promise.all([svc.promote(signal.id, 'u1'), svc.promote(signal.id, 'u1')]);
    expect([a.idempotentReplay, b.idempotentReplay].sort()).toEqual([false, true]);
    expect((await leads.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('uses signal permissions and lead-create authority instead of crm.account.create', async () => {
    const { svc, access } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'Permissioned signal', source: 'MANUAL', type: 'OTHER', actorId: 'u1' });
    await svc.promote(s.id, 'u1');
    const permissions = (access.assert as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1].permission);
    expect(permissions).toEqual(['crm.signal.create', 'crm.signal.update', 'crm.lead.create']);
    expect(permissions).not.toContain('crm.account.create');
  });

  it('cannot promote when the actor lacks Lead-create authority', async () => {
    const { svc, access } = harness();
    (access.assert as ReturnType<typeof vi.fn>).mockImplementation((_actor: string, target: { permission: string }) => {
      if (target.permission === 'crm.lead.create') throw new Error('lead create denied');
    });
    const s = await svc.create({ tenantId: 't1', title: 'Blocked conversion', source: 'MANUAL', type: 'OTHER' });
    await expect(svc.promote(s.id, 'u1')).rejects.toThrow('lead create denied');
  });

  it('does not promote to a Lead owned by a user without Lead-create authority', async () => {
    const signals = new InMemorySignalStore();
    const leads = new InMemoryLeadStore();
    const accounts = new InMemoryAccountStore();
    const access = {
      assert: vi.fn(),
      can: vi.fn().mockReturnValue({ allowed: false }),
    } as unknown as AccessService;
    const users = {
      ensureTenant: vi.fn().mockResolvedValue(undefined),
      list: vi.fn(() => [{ tenantId: 't1', userId: 'rep', displayName: 'Rep', email: '', companyId: null, active: true }]),
      get: vi.fn(() => ({ tenantId: 't1', userId: 'rep', displayName: 'Rep', email: '', companyId: null, active: true })),
    };
    const svc = new SignalService(
      signals, leads, { append: vi.fn(), appendWithClient: vi.fn() } as unknown as EventStore,
      new NullTxRunner(), access, accounts, null, null, users as never,
    );
    const signal = await svc.create({ tenantId: 't1', title: 'Lead-gated signal', source: 'MANUAL', type: 'OTHER', ownerId: 'rep' });
    await expect(svc.promote(signal.id, 'manager')).rejects.toThrow(/owner cannot be assigned leads/);
  });

  it('enforces the strict NEW → REVIEWING → RESEARCHING transition matrix', async () => {
    const { svc } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'Triage signal', source: 'MANUAL', type: 'OTHER' });
    await expect(svc.advance(s.id, 'RESEARCHING')).rejects.toThrow(/invalid signal transition/);
    const reviewing = await svc.advance(s.id, 'REVIEWING');
    await expect(svc.advance(reviewing.id, 'REVIEWING')).rejects.toThrow(/invalid signal transition/);
    const researching = await svc.advance(reviewing.id, 'RESEARCHING');
    await expect(svc.advance(researching.id, 'REVIEWING')).rejects.toThrow(/invalid signal transition/);
  });

  it('records review evidence and emits an audit event for triage decisions', async () => {
    const { svc, events } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'Review evidence', source: 'MANUAL', type: 'OTHER' });
    const reviewed = await svc.advance(s.id, 'REVIEWING', 'u1');
    expect(reviewed.reviewedBy).toBe('u1');
    expect(reviewed.reviewedAt).toBeTruthy();
    expect((events.appendWithClient as ReturnType<typeof vi.fn>).mock.calls.some((call) => call[1]?.[0]?.type === 'crm.signal.reviewed')).toBe(true);
  });

  it('stores controlled dismissal and duplicate evidence with distinct events', async () => {
    const { svc, events } = harness();
    const first = await svc.create({ tenantId: 't1', title: 'Dismissable', source: 'MANUAL', type: 'OTHER' });
    const dismissed = await svc.dismiss(first.id, 'LOW_POTENTIAL', false, 'u1', 'Below target threshold');
    expect(dismissed.dismissalReasonCode).toBe('LOW_POTENTIAL');
    const second = await svc.create({ tenantId: 't1', title: 'Duplicate', source: 'MANUAL', type: 'OTHER' });
    const duplicate = await svc.dismiss(second.id, 'DUPLICATE', true, 'u1', 'Existing lead');
    expect(duplicate.status).toBe('DUPLICATE');
    const types = (events.appendWithClient as ReturnType<typeof vi.fn>).mock.calls.flatMap((call) => call[1] ?? []).map((event: { type: string }) => event.type);
    expect(types).toContain('crm.signal.dismissed');
    expect(types).toContain('crm.signal.duplicated');
  });

  it('does not leave a Lead or signal mutation when transactional promotion fails', async () => {
    const { signals, leads, accounts, access, events } = harness();
    const tx = { run: vi.fn(async (fn: (handle: null) => Promise<unknown>) => fn(null)) };
    const svc = new SignalService(signals, leads, events, tx as never, access, accounts);
    const s = await svc.create({ tenantId: 't1', title: 'Atomic promotion', source: 'MANUAL', type: 'OTHER' });
    const originalCreate = leads.createWithClient.bind(leads);
    leads.createWithClient = vi.fn(async () => { throw new Error('lead insert failed'); });
    await expect(svc.promote(s.id, 'u1')).rejects.toThrow('lead insert failed');
    expect((await signals.get(s.id))?.status).toBe('NEW');
    expect((await leads.list({ tenantId: 't1' })).length).toBe(0);
    leads.createWithClient = originalCreate;
  });

  it('finds exact lineage before a new promotion and exposes possible duplicates for review', async () => {
    const { svc, leads } = harness();
    const s = await svc.create({ tenantId: 't1', title: 'Existing account expansion', source: 'MANUAL', type: 'EXPANSION', accountName: 'Acme' });
    await leads.create({ ...makeLeadForTest('t1', 'Acme') });
    const preview = await svc.promotionPreview(s.id, 'u1');
    expect(preview.matches.some((match) => match.kind === 'lead' && !match.exact)).toBe(true);
  });

  it('does not load or mutate a signal through a foreign tenant id', async () => {
    const { signals, leads, events, accounts, access } = harness();
    const tenant = new TenantContext();
    const svc = new SignalService(signals, leads, events, new NullTxRunner(), access, accounts, tenant);
    const signal = await svc.create({ tenantId: 'tenant-a', title: 'Tenant A signal', source: 'MANUAL', type: 'OTHER' });
    await tenant.run({ tenantId: 'tenant-b', companyId: null, actorId: null, correlationId: null }, async () => {
      await expect(svc.get(signal.id)).resolves.toBeNull();
      await expect(svc.list({ tenantId: 'tenant-a' })).resolves.toEqual([]);
      await expect(svc.create({ tenantId: 'tenant-a', title: 'Forged tenant signal', source: 'MANUAL', type: 'OTHER' })).rejects.toThrow(/tenant mismatch/);
      await expect(svc.advance(signal.id, 'REVIEWING')).rejects.toThrow(/not found/);
      await expect(svc.promote(signal.id)).rejects.toThrow(/not found/);
      await expect(svc.dismiss(signal.id, 'wrong tenant')).rejects.toThrow(/not found/);
    });
  });

  it('rejects account references that are missing or owned by another tenant', async () => {
    const { svc, accounts } = harness();
    const account = makeAccount({ tenantId: 'tenant-b', name: 'Foreign account', status: 'active_customer' });
    await accounts.create(account);
    await expect(svc.create({ tenantId: 'tenant-a', title: 'Foreign ref', source: 'MANUAL', type: 'OTHER', accountId: account.id })).rejects.toThrow(/account must belong/);
    await expect(svc.create({ tenantId: 'tenant-a', title: 'Missing ref', source: 'MANUAL', type: 'OTHER', accountId: 'missing-account' })).rejects.toThrow(/account must belong/);
  });

  it('enforces context references and account relationships at the service boundary', async () => {
    const { svc, accounts } = harness();
    const accountA = makeAccount({ tenantId: 'tenant-a', name: 'Account A', status: 'active_customer' });
    const accountB = makeAccount({ tenantId: 'tenant-a', name: 'Account B', status: 'active_customer' });
    await accounts.create(accountA);
    await accounts.create(accountB);
    await expect(svc.create({
      tenantId: 'tenant-a', title: 'Mismatched context', source: 'MANUAL', type: 'OTHER',
      accountId: accountA.id, contextType: 'account', contextId: accountB.id,
    })).rejects.toThrow(/context account must match/);
    await expect(svc.create({
      tenantId: 'tenant-a', title: 'Unknown context', source: 'MANUAL', type: 'OTHER',
      contextType: 'unsupported', contextId: 'context-1',
    })).rejects.toThrow(/unsupported signal context/);
  });

  it('rejects a contact from another account/tenant and inactive owners', async () => {
    const { signals, leads, events, accounts, access } = harness();
    const contacts = new InMemoryContactStore();
    const users = {
      ensureTenant: vi.fn().mockResolvedValue(undefined),
      list: vi.fn((tenantId: string) => tenantId === 'tenant-a' ? [{ tenantId, userId: 'inactive', displayName: 'Inactive', email: '', companyId: null, active: false }] : []),
      get: vi.fn((tenantId: string, userId: string) => tenantId === 'tenant-a' && userId === 'inactive' ? { tenantId, userId, displayName: 'Inactive', email: '', companyId: null, active: false } : null),
    };
    const accountA = makeAccount({ tenantId: 'tenant-a', name: 'Account A', status: 'active_customer' });
    const accountB = makeAccount({ tenantId: 'tenant-a', name: 'Account B', status: 'active_customer' });
    await accounts.create(accountA);
    await accounts.create(accountB);
    const contact = makeContact({ tenantId: 'tenant-a', accountId: accountB.id, accountName: accountB.name, name: 'Contact B' });
    await contacts.save(contact);
    const svc = new SignalService(signals, leads, events, new NullTxRunner(), access, accounts, new TenantContext(), contacts, users as never);

    await expect(svc.create({ tenantId: 'tenant-a', title: 'Wrong account contact', source: 'MANUAL', type: 'OTHER', accountId: accountA.id, contactId: contact.id })).rejects.toThrow(/contact must belong/);
    await expect(svc.create({ tenantId: 'tenant-a', title: 'Inactive owner', source: 'MANUAL', type: 'OTHER', ownerId: 'inactive' })).rejects.toThrow(/owner must be an active user/);
  });
});
