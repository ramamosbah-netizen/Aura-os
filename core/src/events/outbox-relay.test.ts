import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { OutboxRelay } from './outbox-relay';
import { EventBus } from './event-bus';
import { TenantContext } from '../tenancy/tenant-context';

/** Build one raw `aura_events` row for tenant `t`. */
function eventRow(id: string, t: string, companyId: string | null) {
  return {
    id,
    type: 'crm.opportunity.stage_changed',
    tenant_id: t,
    company_id: companyId,
    aggregate_type: 'opportunity',
    aggregate_id: `agg-${id}`,
    actor_id: 'u-1',
    occurred_at: new Date().toISOString(),
    version: 1,
    payload: { stage: 'won' },
    correlation_id: `corr-${id}`,
    attempts: 0,
  };
}

/**
 * Fake pool whose single connection returns two pending events (tenants A and B) for the drain
 * SELECT and swallows BEGIN/UPDATE/COMMIT. Records every UPDATE so we can assert both were
 * stamped processed.
 */
function fakePoolWith(rows: unknown[]) {
  const updates: unknown[][] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM public.aura_events')) return { rows };
      if (sql.startsWith('UPDATE public.aura_events')) {
        updates.push(params ?? []);
        return { rows: [] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, updates };
}

describe('OutboxRelay tenant restoration', () => {
  it('publishes each event with the event tenant bound (multi-tenant, no leak)', async () => {
    const tenant = new TenantContext();
    const bus = new EventBus();
    // Every subscriber sees the tenant that the relay restored for THIS event.
    const observed: Array<{ id: string; boundTenant: string | null; boundCompany: string | null }> = [];
    bus.subscribe('*', (e) => {
      observed.push({ id: e.id, boundTenant: tenant.boundTenantId(), boundCompany: tenant.boundCompanyId() });
    });

    const { pool, updates } = fakePoolWith([
      eventRow('e-A', 't-A', 'c-A'),
      eventRow('e-B', 't-B', null),
    ]);
    const relay = new OutboxRelay(pool, bus, tenant);

    await relay.drain();

    // Each event was handled under its OWN tenant — never leaked across the two.
    expect(observed).toEqual([
      { id: 'e-A', boundTenant: 't-A', boundCompany: 'c-A' },
      { id: 'e-B', boundTenant: 't-B', boundCompany: null },
    ]);
    // Both events were stamped processed.
    expect(updates).toHaveLength(2);
    // The relay itself runs outside any tenant scope once draining finishes (no ambient leak).
    expect(tenant.boundTenantId()).toBeNull();
  });

  it('a failing handler for one tenant does not change the tenant restored for the next', async () => {
    const tenant = new TenantContext();
    const bus = new EventBus();
    const seen: Array<string | null> = [];
    bus.subscribe('*', (e) => {
      seen.push(tenant.boundTenantId());
      if (e.tenantId === 't-A') throw new Error('handler boom for A');
    });

    const { pool, updates } = fakePoolWith([
      eventRow('e-A', 't-A', null),
      eventRow('e-B', 't-B', null),
    ]);
    const relay = new OutboxRelay(pool, bus, tenant);

    await relay.drain();

    // B still saw its own tenant even though A threw; A's row got an attempts/error update, B a processed update.
    expect(seen).toEqual(['t-A', 't-B']);
    expect(updates).toHaveLength(2);
    expect(tenant.boundTenantId()).toBeNull();
  });
});
