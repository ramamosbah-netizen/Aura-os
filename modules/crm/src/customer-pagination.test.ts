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
});
