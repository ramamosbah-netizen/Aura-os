import { describe, it, expect, beforeEach } from 'vitest';
import { makeNegotiationEntry } from '@aura/shared';
import { InMemoryNegotiationStore } from './in-memory-negotiation-store';

const at = (occurredAt: string, over: Record<string, unknown> = {}) =>
  makeNegotiationEntry({
    tenantId: 't1', quotationId: 'q1', type: 'CUSTOMER_COMMENT', note: 'said something',
    occurredAt, ...over,
  } as Parameters<typeof makeNegotiationEntry>[0]);

describe('InMemoryNegotiationStore', () => {
  let store: InMemoryNegotiationStore;
  beforeEach(() => { store = new InMemoryNegotiationStore(); });

  it('returns the log oldest first — a conversation runs forwards', async () => {
    await store.append(at('2026-03-03T00:00:00.000Z', { note: 'third' }));
    await store.append(at('2026-03-01T00:00:00.000Z', { note: 'first' }));
    await store.append(at('2026-03-02T00:00:00.000Z', { note: 'second' }));
    const log = await store.list({ tenantId: 't1' });
    expect(log.map((e) => e.note)).toEqual(['first', 'second', 'third']);
  });

  it('orders by when it HAPPENED, not when it was typed', async () => {
    // Yesterday's call, logged after this morning's email.
    const today = at('2026-03-05T09:00:00.000Z', { note: 'this morning' });
    await store.append(today);
    await store.append(at('2026-03-04T16:00:00.000Z', { note: 'yesterday, logged late' }));
    const log = await store.list({ tenantId: 't1' });
    expect(log.map((e) => e.note)).toEqual(['yesterday, logged late', 'this morning']);
  });

  it('appends rather than replaces — the same ask twice is two facts', async () => {
    await store.append(at('2026-03-01T00:00:00.000Z', { type: 'DISCOUNT_REQUESTED', note: 'wants 10%', percent: 10 }));
    await store.append(at('2026-03-08T00:00:00.000Z', { type: 'DISCOUNT_REQUESTED', note: 'wants 10%', percent: 10 }));
    expect(await store.list({ tenantId: 't1' })).toHaveLength(2);
  });

  it('scopes the log to one quotation', async () => {
    await store.append(at('2026-03-01T00:00:00.000Z'));
    await store.append(at('2026-03-01T00:00:00.000Z', { quotationId: 'q2' }));
    expect(await store.list({ tenantId: 't1', quotationId: 'q1' })).toHaveLength(1);
  });

  it('never leaks another tenant\'s negotiation', async () => {
    await store.append(at('2026-03-01T00:00:00.000Z', { tenantId: 't2' }));
    expect(await store.list({ tenantId: 't1' })).toHaveLength(0);
  });

  it('hands back copies, so a caller cannot edit the log in place', async () => {
    await store.append(at('2026-03-01T00:00:00.000Z', { note: 'original' }));
    const [entry] = await store.list({ tenantId: 't1' });
    entry.note = 'tampered';
    const [again] = await store.list({ tenantId: 't1' });
    expect(again.note).toBe('original');
  });

  it('removes a mis-recorded entry, and reports when there was nothing to remove', async () => {
    const e = at('2026-03-01T00:00:00.000Z');
    await store.append(e);
    expect(await store.remove(e.id)).toBe(true);
    expect(await store.remove(e.id)).toBe(false);
    expect(await store.list({ tenantId: 't1' })).toHaveLength(0);
  });
});
