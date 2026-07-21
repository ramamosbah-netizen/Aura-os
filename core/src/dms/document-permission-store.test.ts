import { describe, it, expect, beforeEach } from 'vitest';
import { makeDocumentPermission } from '@aura/shared';
import { InMemoryDocumentPermissionStore } from './in-memory-document-permission-store';

// These assert the semantics the Postgres store must match: the partial unique index
// (one LIVE grant per document+subject+permission) and soft revocation.

const perm = (over: Partial<Parameters<typeof makeDocumentPermission>[0]> = {}) =>
  makeDocumentPermission({
    tenantId: 't1', documentId: 'doc-1', subjectType: 'USER', subjectId: 'u-1',
    permission: 'VIEW', grantedBy: 'u-owner', ...over,
  });

describe('DocumentPermissionStore (in-memory)', () => {
  let store: InMemoryDocumentPermissionStore;
  beforeEach(() => { store = new InMemoryDocumentPermissionStore(); });

  it('stores and returns a grant for its document', async () => {
    const p = perm();
    await store.grant(p);
    const list = await store.listForDocument('doc-1');
    expect(list).toHaveLength(1);
    expect(list[0].subjectId).toBe('u-1');
  });

  it('never leaks revocation columns into the shared shape', async () => {
    await store.grant(perm());
    const [p] = await store.listForDocument('doc-1');
    expect(p).not.toHaveProperty('revokedAt');
    expect(p).not.toHaveProperty('revokedBy');
  });

  it('treats re-sharing the same permission as a no-op, not a second row', async () => {
    await store.grant(perm());
    await store.grant(perm());
    expect(await store.listForDocument('doc-1')).toHaveLength(1);
  });

  it('still allows a DIFFERENT permission to the same subject', async () => {
    await store.grant(perm({ permission: 'VIEW' }));
    await store.grant(perm({ permission: 'APPROVE' }));
    const list = await store.listForDocument('doc-1');
    expect(list.map((p) => p.permission).sort()).toEqual(['APPROVE', 'VIEW']);
  });

  it('keeps documents separate', async () => {
    await store.grant(perm({ documentId: 'doc-1' }));
    await store.grant(perm({ documentId: 'doc-2' }));
    expect(await store.listForDocument('doc-1')).toHaveLength(1);
    expect(await store.listForDocument('doc-2')).toHaveLength(1);
  });

  describe('revocation is a soft delete', () => {
    it('removes a revoked grant from every read', async () => {
      const p = perm();
      await store.grant(p);
      expect(await store.revoke(p.id, 'u-owner')).toBe(true);
      expect(await store.listForDocument('doc-1')).toEqual([]);
      expect(await store.get(p.id)).toBeNull();
      expect(await store.listForSubjects('t1', [{ subjectType: 'USER', subjectId: 'u-1' }])).toEqual([]);
    });

    it('refuses to revoke twice', async () => {
      const p = perm();
      await store.grant(p);
      expect(await store.revoke(p.id, 'u-owner')).toBe(true);
      expect(await store.revoke(p.id, 'u-owner')).toBe(false);
    });

    it('returns false for an unknown id rather than throwing', async () => {
      expect(await store.revoke('nope', 'u-owner')).toBe(false);
    });

    // The revoked row must not block a fresh share of the same thing.
    it('lets the same permission be granted again after revocation', async () => {
      const first = perm();
      await store.grant(first);
      await store.revoke(first.id, 'u-owner');
      const second = perm();
      await store.grant(second);
      const live = await store.listForDocument('doc-1');
      expect(live).toHaveLength(1);
      expect(live[0].id).toBe(second.id);
    });
  });

  describe('listForSubjects — "shared with me"', () => {
    it('returns nothing for an empty subject list rather than everything', async () => {
      await store.grant(perm());
      expect(await store.listForSubjects('t1', [])).toEqual([]);
    });

    it('matches subject TYPE and ID as a pair', async () => {
      await store.grant(perm({ subjectType: 'TEAM', subjectId: 'shared-id' }));
      // Same id, wrong type — a team grant must not satisfy a user lookup.
      expect(await store.listForSubjects('t1', [{ subjectType: 'USER', subjectId: 'shared-id' }])).toEqual([]);
      expect(await store.listForSubjects('t1', [{ subjectType: 'TEAM', subjectId: 'shared-id' }])).toHaveLength(1);
    });

    it('unions across the subjects a caller belongs to', async () => {
      await store.grant(perm({ subjectType: 'USER', subjectId: 'u-1' }));
      await store.grant(perm({ documentId: 'doc-2', subjectType: 'TEAM', subjectId: 'team-eng' }));
      const list = await store.listForSubjects('t1', [
        { subjectType: 'USER', subjectId: 'u-1' },
        { subjectType: 'TEAM', subjectId: 'team-eng' },
      ]);
      expect(list.map((p) => p.documentId).sort()).toEqual(['doc-1', 'doc-2']);
    });

    it('never crosses tenants', async () => {
      await store.grant(perm({ tenantId: 't1' }));
      expect(await store.listForSubjects('t2', [{ subjectType: 'USER', subjectId: 'u-1' }])).toEqual([]);
    });
  });
});
