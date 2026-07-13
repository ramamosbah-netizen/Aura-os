import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type AccessService, type EventStore } from '@aura/core';
import { makeLead } from '@aura/shared';
import { makeAccount } from './domain/account';
import { InMemoryLeadStore } from './in-memory-lead-store';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryContactStore } from './in-memory-contact-store';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';
import { LeadConversionService } from './lead-conversion.service';

/**
 * S2 Qualify & Convert E2E — proves the three invariants over in-memory stores:
 *   lineage preserved · cannot convert twice (idempotent) · duplicate protection (EXACT auto-link).
 */
function harness() {
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const leads = new InMemoryLeadStore();
  const accounts = new InMemoryAccountStore();
  const contacts = new InMemoryContactStore();
  const opps = new InMemoryOpportunityStore();
  const svc = new LeadConversionService(leads, accounts, contacts, opps, events, new NullTxRunner(), access);
  return { svc, leads, accounts, contacts, opps, access };
}

describe('LeadConversionService', () => {
  it('converts a fresh lead: creates account + contact + opportunity with intact lineage', async () => {
    const { svc, leads, accounts, contacts, opps } = harness();
    const lead = makeLead({ tenantId: 't1', name: 'Jane Doe', companyName: 'Globex Corp', email: 'jane@globex.com', source: 'referral' });
    await leads.create(lead);

    const res = await svc.convert(lead.id, { actorId: 'u1' });

    expect(res.idempotentReplay).toBe(false);
    expect(res.account.action).toBe('created');
    expect(res.contact?.action).toBe('created');
    // lineage: opportunity carries the lead + its originating source
    expect(res.opportunity.leadId).toBe(lead.id);
    expect(res.opportunity.source).toBe('referral');
    expect(res.opportunity.accountId).toBe(res.account.id);
    // lead is now terminal + points back at the opportunity
    const stored = await leads.get(lead.id);
    expect(stored?.status).toBe('converted');
    expect(stored?.convertedOpportunityId).toBe(res.opportunity.id);
    // exactly one of each was written
    expect((await accounts.list({ tenantId: 't1' })).length).toBe(1);
    expect((await contacts.list({ tenantId: 't1' })).length).toBe(1);
    expect((await opps.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('cannot convert twice — replays idempotently and creates nothing new', async () => {
    const { svc, leads, opps } = harness();
    const lead = makeLead({ tenantId: 't1', name: 'Acme Buyer', companyName: 'Acme', email: 'buyer@acme.com' });
    await leads.create(lead);

    const first = await svc.convert(lead.id, { actorId: 'u1' });
    const second = await svc.convert(lead.id, { actorId: 'u1' });

    expect(second.idempotentReplay).toBe(true);
    expect(second.opportunity.id).toBe(first.opportunity.id);
    expect((await opps.list({ tenantId: 't1' })).length).toBe(1); // no duplicate opportunity
  });

  it('duplicate protection — auto-links to an EXACT account match instead of creating one', async () => {
    const { svc, leads, accounts } = harness();
    const existing = makeAccount({ tenantId: 't1', name: 'Globex Corporation', email: 'info@globex.com' });
    await accounts.create(existing);

    const lead = makeLead({ tenantId: 't1', name: 'New Person', companyName: 'Globex', email: 'info@globex.com' });
    await leads.create(lead);

    const res = await svc.convert(lead.id, { actorId: 'u1' });

    expect(res.account.action).toBe('linked');
    expect(res.account.confidence).toBe('EXACT');
    expect(res.account.id).toBe(existing.id);
    expect(res.opportunity.accountId).toBe(existing.id);
    expect((await accounts.list({ tenantId: 't1' })).length).toBe(1); // no duplicate account
  });

  it('honours createNewAccount to override a match (user said "not a duplicate")', async () => {
    const { svc, leads, accounts } = harness();
    await accounts.create(makeAccount({ tenantId: 't1', name: 'Globex Corporation', email: 'info@globex.com' }));
    const lead = makeLead({ tenantId: 't1', name: 'X', companyName: 'Globex', email: 'info@globex.com' });
    await leads.create(lead);

    const res = await svc.convert(lead.id, { actorId: 'u1', createNewAccount: true });

    expect(res.account.action).toBe('created');
    expect((await accounts.list({ tenantId: 't1' })).length).toBe(2);
  });

  it('preview reports matches without mutating anything', async () => {
    const { svc, leads, accounts, opps } = harness();
    await accounts.create(makeAccount({ tenantId: 't1', name: 'Globex Corporation', email: 'info@globex.com' }));
    const lead = makeLead({ tenantId: 't1', name: 'Y', companyName: 'Globex', email: 'info@globex.com' });
    await leads.create(lead);

    const preview = await svc.preview(lead.id);
    expect(preview.alreadyConverted).toBe(false);
    expect(preview.account.best).toBe('EXACT');
    expect((await opps.list({ tenantId: 't1' })).length).toBe(0); // untouched
  });
});
