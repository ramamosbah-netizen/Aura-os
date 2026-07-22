import { describe, it, expect } from 'vitest';
import {
  DocumentAccessResolver,
  InMemoryDocumentStore,
  InMemoryDocumentPermissionStore,
} from '@aura/core';
import type { Document, DocumentActor } from '@aura/shared';
import type { Account, Quotation, AccountService, QuotationService } from '@aura/crm';
import { AccountDocumentAccessProvider } from './account-document-access.provider';

// The provider only ever calls .get on these two services; stub exactly that, keyed by id so the
// test proves the account is looked up through the QUOTE's accountId, not a fixed value.
function services(quotes: Record<string, Partial<Quotation>>, accounts: Record<string, Partial<Account>>) {
  const quotations = { get: async (id: string) => quotes[id] ?? null } as unknown as QuotationService;
  const accts = { get: async (id: string) => accounts[id] ?? null } as unknown as AccountService;
  return { quotations, accts };
}

function resolver() {
  return new DocumentAccessResolver(new InMemoryDocumentStore(), new InMemoryDocumentPermissionStore());
}

const doc = (over: Partial<Document> = {}): Document => ({
  id: 'doc-1', tenantId: 't1', companyId: null, kind: 'vendor_quote', title: 'Supplier A',
  aggregateType: 'crm.quotation', aggregateId: 'q1', status: 'active', currentVersion: 1,
  createdAt: '2026-07-22T00:00:00.000Z', createdBy: 'someone-else', ...over,
});

const actor = (userId: string): DocumentActor => ({ userId, tenantId: 't1', companyId: null, teamIds: [], roleIds: [] });

describe('AccountDocumentAccessProvider — account owner inherits read on quotation documents', () => {
  it('grants VIEW+DOWNLOAD to the owner of the account behind the quotation', async () => {
    const { quotations, accts } = services(
      { q1: { id: 'q1', tenantId: 't1', accountId: 'a1' } },
      { a1: { id: 'a1', tenantId: 't1', ownerId: 'u-owner' } },
    );
    const p = new AccountDocumentAccessProvider(resolver(), quotations, accts);
    expect(await p.grantsFor(doc(), actor('u-owner'))).toEqual(['VIEW', 'DOWNLOAD']);
  });

  it('grants nothing to someone who is not the account owner', async () => {
    const { quotations, accts } = services(
      { q1: { id: 'q1', tenantId: 't1', accountId: 'a1' } },
      { a1: { id: 'a1', tenantId: 't1', ownerId: 'u-owner' } },
    );
    const p = new AccountDocumentAccessProvider(resolver(), quotations, accts);
    expect(await p.grantsFor(doc(), actor('u-stranger'))).toEqual([]);
  });

  it('is silent on documents that are not on a quotation', async () => {
    const { quotations, accts } = services({}, {});
    const p = new AccountDocumentAccessProvider(resolver(), quotations, accts);
    expect(await p.grantsFor(doc({ aggregateType: 'crm.contract', aggregateId: 'c9' }), actor('u-owner'))).toEqual([]);
  });

  it('grants nothing when the quotation has no account, or the account has no owner', async () => {
    const noAccount = services({ q1: { id: 'q1', tenantId: 't1', accountId: null } }, {});
    const p1 = new AccountDocumentAccessProvider(resolver(), noAccount.quotations, noAccount.accts);
    expect(await p1.grantsFor(doc(), actor('u-owner'))).toEqual([]);

    const noOwner = services(
      { q1: { id: 'q1', tenantId: 't1', accountId: 'a1' } },
      { a1: { id: 'a1', tenantId: 't1', ownerId: null } },
    );
    const p2 = new AccountDocumentAccessProvider(resolver(), noOwner.quotations, noOwner.accts);
    expect(await p2.grantsFor(doc(), actor('u-owner'))).toEqual([]);
  });

  it('never grants across tenants, even if a store failed to filter', async () => {
    const { quotations, accts } = services(
      { q1: { id: 'q1', tenantId: 'OTHER', accountId: 'a1' } },
      { a1: { id: 'a1', tenantId: 'OTHER', ownerId: 'u-owner' } },
    );
    const p = new AccountDocumentAccessProvider(resolver(), quotations, accts);
    expect(await p.grantsFor(doc(), actor('u-owner'))).toEqual([]);
  });

  // The point of the whole slice: registered on the resolver, the inheritance shows up in the
  // real authorize() decision, with a `context` source naming the account it came from — which is
  // what the Documents surface renders as "inherited".
  it('surfaces through the resolver as a context source, for an actor with no share and no ownership', async () => {
    const { quotations, accts } = services(
      { q1: { id: 'q1', tenantId: 't1', accountId: 'a1' } },
      { a1: { id: 'a1', tenantId: 't1', ownerId: 'u-owner' } },
    );
    const r = resolver();
    const p = new AccountDocumentAccessProvider(r, quotations, accts);
    p.onModuleInit(); // registers with the resolver

    // createdBy is someone else and there are no shares — the ONLY way u-owner gets in is inheritance.
    const decision = await r.authorize(doc(), actor('u-owner'), []);
    expect(decision.allowed).toBe(true);
    expect(decision.permissions).toEqual(['VIEW', 'DOWNLOAD']);

    const view = decision.effective.find((e) => e.permission === 'VIEW');
    expect(view?.sources).toEqual([{ type: 'context', entity: 'crm.account' }]);
    // And it must NOT invent SHARE or APPROVE from a read inheritance.
    expect(decision.permissions).not.toContain('SHARE');
    expect(decision.permissions).not.toContain('APPROVE');
  });

  it('does not let inheritance leak to a stranger through the resolver', async () => {
    const { quotations, accts } = services(
      { q1: { id: 'q1', tenantId: 't1', accountId: 'a1' } },
      { a1: { id: 'a1', tenantId: 't1', ownerId: 'u-owner' } },
    );
    const r = resolver();
    new AccountDocumentAccessProvider(r, quotations, accts).onModuleInit();
    const decision = await r.authorize(doc(), actor('u-stranger'), []);
    expect(decision.allowed).toBe(false);
  });
});
