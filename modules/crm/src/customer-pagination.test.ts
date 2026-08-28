import { describe, expect, it } from 'vitest';
import { makeAccount } from './domain/account';
import { makeContact } from './domain/contact';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryContactStore } from './in-memory-contact-store';

describe('CRM customer search and pagination contract', () => {
  it('filters accounts case-insensitively and returns a stable page envelope', async () => {
    const store = new InMemoryAccountStore();
    await store.create(makeAccount({ tenantId: 't1', name: 'Falcon Facilities', industry: 'Facilities' }));
    await store.create(makeAccount({ tenantId: 't1', name: 'Other Supplier', industry: 'Trading' }));

    const page = await store.listPaged({ tenantId: 't1', search: 'FACILITIES' }, { limit: 10, offset: 0 });
    expect(page).toMatchObject({ total: 1, limit: 10, offset: 0, hasMore: false });
    expect(page.items[0]?.name).toBe('Falcon Facilities');
  });

  it('filters contacts across person and account fields and reports hasMore', async () => {
    const store = new InMemoryContactStore();
    await store.save(makeContact({ tenantId: 't1', accountId: 'a1', accountName: 'Falcon Facilities', name: 'Layla' }));
    await store.save(makeContact({ tenantId: 't1', accountId: 'a1', accountName: 'Falcon Facilities', name: 'Ahmed' }));

    const page = await store.listPaged({ tenantId: 't1', search: 'falcon' }, { limit: 1, offset: 0 });
    expect(page).toMatchObject({ total: 2, limit: 1, offset: 0, hasMore: true });
    expect(page.items).toHaveLength(1);

    await store.save(makeContact({ tenantId: 't1', accountId: 'a1', accountName: 'Falcon Facilities', name: 'Decision maker', stakeholderRole: 'decision_maker', relationshipStrength: 'champion', isPrimary: true }));
    const summary = await store.summary({ tenantId: 't1', search: 'falcon' });
    expect(summary).toMatchObject({ total: 3, active: 3, linked: 3, primaries: 1, decisionMakers: 1, champions: 1, unmapped: 2 });
  });

  it('keeps contact pagination and summaries correct beyond the legacy 100-row ceiling', async () => {
    const store = new InMemoryContactStore();
    for (let i = 0; i < 10_000; i += 1) {
      await store.save(makeContact({
        tenantId: 'large-tenant', accountId: `account-${i % 250}`, accountName: `Account ${i % 250}`,
        name: `Contact ${i}`, stakeholderRole: i % 10 === 0 ? 'decision_maker' : null,
      }));
    }

    const lastPage = await store.listPaged({ tenantId: 'large-tenant', search: 'Contact 9999' }, { limit: 50, offset: 0 });
    expect(lastPage.total).toBe(1);
    expect(lastPage.items[0]?.name).toBe('Contact 9999');

    const page = await store.listPaged({ tenantId: 'large-tenant' }, { limit: 50, offset: 9_950 });
    expect(page.items).toHaveLength(50);
    expect(page.items.every((contact) => contact.name.startsWith('Contact '))).toBe(true);
    expect(page.hasMore).toBe(false);

    const summary = await store.summary({ tenantId: 'large-tenant' });
    expect(summary).toMatchObject({ total: 10_000, active: 10_000, linked: 10_000, decisionMakers: 1_000, unmapped: 9_000 });
  });
});
