import { describe, it, expect, beforeEach } from 'vitest';
import { makeDocumentRequirement, addEvidence, waiveRequirement } from '@aura/shared';
import { InMemoryDocumentRequirementStore } from './in-memory-document-requirement-store';

// These pin the semantics the Postgres store must match — above all the natural-key upsert
// (ON CONFLICT (tenant, entity, type) DO UPDATE) that lets a template be re-seeded safely.

const req = (over: Partial<Parameters<typeof makeDocumentRequirement>[0]> = {}) =>
  makeDocumentRequirement({ tenantId: 't1', entityType: 'crm.quotation', entityId: 'q1', type: 'VENDOR_QUOTE', ...over });

describe('DocumentRequirementStore (in-memory)', () => {
  let store: InMemoryDocumentRequirementStore;
  beforeEach(() => { store = new InMemoryDocumentRequirementStore(); });

  it('stores and lists a requirement for its entity', async () => {
    await store.upsert(req());
    const list = await store.list({ tenantId: 't1', entityType: 'crm.quotation', entityId: 'q1' });
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('VENDOR_QUOTE');
    expect(list[0].status).toBe('REQUIRED');
  });

  describe('the natural-key upsert', () => {
    // Seeding a template twice must converge, not multiply. This is the whole reason the
    // contract is upsert() and not create().
    it('converges when the same requirement is seeded again', async () => {
      await store.upsert(req());
      await store.upsert(req());
      expect(await store.list({ tenantId: 't1' })).toHaveLength(1);
    });

    it('keeps the ORIGINAL id so anything already pointing at the row still resolves', async () => {
      const first = req();
      await store.upsert(first);
      await store.upsert(req());
      const [row] = await store.list({ tenantId: 't1' });
      expect(row.id).toBe(first.id);
      expect(await store.get(first.id)).not.toBeNull();
    });

    it('updates status and evidence in place rather than adding a row', async () => {
      const original = req({ requiredCount: 3 });
      await store.upsert(original);
      const withEvidence = addEvidence(original, {
        type: 'DOCUMENT_ID', reference: 'doc-1', checkedBy: 'u-admin',
      });
      await store.upsert(withEvidence);
      const list = await store.list({ tenantId: 't1' });
      expect(list).toHaveLength(1);
      expect(list[0].evidence).toHaveLength(1);
      expect(list[0].status).toBe('REQUIRED'); // 1 of 3 — still a gap
    });

    it('persists a waiver, which is what the template alone could never express', async () => {
      const original = req({ type: 'DATASHEET' });
      await store.upsert(original);
      await store.upsert(waiveRequirement(original, 'u-admin', 'client supplied their own spec'));
      const [row] = await store.list({ tenantId: 't1' });
      expect(row.status).toBe('WAIVED');
      expect(row.note).toBe('client supplied their own spec');
    });

    it('treats a different TYPE on the same entity as a separate requirement', async () => {
      await store.upsert(req({ type: 'VENDOR_QUOTE' }));
      await store.upsert(req({ type: 'DATASHEET' }));
      expect(await store.list({ tenantId: 't1' })).toHaveLength(2);
    });

    it('treats the same type on a different ENTITY as separate', async () => {
      await store.upsert(req({ entityId: 'q1' }));
      await store.upsert(req({ entityId: 'q2' }));
      expect(await store.list({ tenantId: 't1', entityId: 'q1' })).toHaveLength(1);
      expect(await store.list({ tenantId: 't1', entityId: 'q2' })).toHaveLength(1);
    });
  });

  describe('isolation and filtering', () => {
    it('never crosses tenants, even on an identical natural key', async () => {
      await store.upsert(req({ tenantId: 't1' }));
      await store.upsert(req({ tenantId: 't2' }));
      expect(await store.list({ tenantId: 't1' })).toHaveLength(1);
      expect(await store.list({ tenantId: 't2' })).toHaveLength(1);
    });

    it('filters by entityType', async () => {
      await store.upsert(req({ entityType: 'crm.quotation' }));
      await store.upsert(req({ entityType: 'tendering.tender' }));
      expect(await store.list({ tenantId: 't1', entityType: 'crm.quotation' })).toHaveLength(1);
    });

    it('hands back copies — a caller mutating evidence must not corrupt the store', async () => {
      await store.upsert(req());
      const [row] = await store.list({ tenantId: 't1' });
      row.evidence.push({ type: 'MANUAL_CONFIRMATION', reference: 'injected', checkedBy: null, checkedAt: 'now' });
      const [again] = await store.list({ tenantId: 't1' });
      expect(again.evidence).toHaveLength(0);
    });
  });

  it('removes a requirement and reports whether it existed', async () => {
    const r = req();
    await store.upsert(r);
    expect(await store.remove(r.id)).toBe(true);
    expect(await store.remove(r.id)).toBe(false);
    expect(await store.list({ tenantId: 't1' })).toEqual([]);
  });
});
