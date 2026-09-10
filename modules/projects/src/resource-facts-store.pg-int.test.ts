import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { TenantContext, TenantScopedPool } from '@aura/core';
import type { ResourceRef } from './domain/resource-ref';
import { assessResourceAcrossProjects } from './domain/resource-facts';
import { PostgresResourceFactsStore } from './postgres-resource-facts-store';

/**
 * §22 Step 7 (part 2) — the cross-project capacity engine against real PostgreSQL.
 *
 * The failure §22 was opened for, proven end to end: two projects, one crane, the same Tuesday, the
 * conflict visible on both — read across projects through the Postgres store under the ENFORCED
 * aura_app role, then judged by the pure engine. Plus the two facts a cross-project reader must never
 * get wrong: a THIRD project in ANOTHER TENANT booking the same crane id is not returned (RLS keeps
 * "across every project" inside the tenant), and a released booking holds nothing.
 *
 * Gated on AURA_PG_APP_URL (the enforced aura_app role) and AURA_PG_OWNER_URL (the owner, which seeds
 * the fixture projects the bookings' RLS policy requires).
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const APP_URL = process.env.AURA_PG_APP_URL;
const OWNER_URL = process.env.AURA_PG_OWNER_URL;
const run = APP_URL && OWNER_URL ? describe : describe.skip;

run('PostgresResourceFactsStore — cross-project, within one tenant (§22 Step 7)', () => {
  let appPool: Pool;
  let ownerPool: Pool;
  let store: PostgresResourceFactsStore;
  const tenant = new TenantContext();
  const tenantId = `s22s7-${Date.now()}`;
  const otherTenantId = `s22s7-other-${Date.now()}`;
  const CRANE: ResourceRef = { resourceType: 'asset', canonicalResourceId: '00000000-0000-4000-8000-0000000c7a5e' };
  const projectA = '11111111-0000-4000-8000-00000000000a';
  const projectB = '22222222-0000-4000-8000-00000000000b';
  const projectOther = '33333333-0000-4000-8000-00000000000c';
  const TUE = '2026-03-10';
  const interval = { from: TUE, to: TUE };

  const seedProject = (id: string, tid: string): Promise<unknown> =>
    ownerPool.query(
      `INSERT INTO public.aura_projects_projects (id, tenant_id, title) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, tid, `S7 ${id}`],
    );

  const seedCapacity = (qty: number): Promise<unknown> =>
    ownerPool.query(
      `INSERT INTO public.aura_projects_resource_capacity
         (id, tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'units', $4, '2026-03-01', '2026-03-31', now())`,
      [tenantId, CRANE.resourceType, CRANE.canonicalResourceId, qty],
    );

  const seedBooking = (id: string, tid: string, projectId: string, status = 'held', released = false): Promise<unknown> =>
    ownerPool.query(
      `INSERT INTO public.aura_projects_resource_bookings
         (id, tenant_id, project_id, resource_type, canonical_resource_id, unit, quantity,
          valid_from, valid_to, status, demand_at_commitment, committed_at,
          released_reason, released_at)
       VALUES ($1, $2, $3, $4, $5, 'units', 1, $6, $6, $7, 1, now(), $8, $9)`,
      [id, tid, projectId, CRANE.resourceType, CRANE.canonicalResourceId, TUE, status,
       released ? 'de-scoped' : null, released ? new Date().toISOString() : null],
    );

  beforeAll(async () => {
    appPool = new Pool({ connectionString: APP_URL });
    ownerPool = new Pool({ connectionString: OWNER_URL });

    // Enforced role — a cross-project read must be trustworthy precisely because it cannot bypass RLS.
    const role = await appPool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(role.rows[0].rolsuper, 'app role must not be superuser').toBe(false);
    expect(role.rows[0].rolbypassrls, 'app role must not bypass RLS').toBe(false);

    await seedProject(projectA, tenantId);
    await seedProject(projectB, tenantId);
    await seedProject(projectOther, otherTenantId);
    await seedCapacity(1);
    await seedBooking('a0000000-0000-4000-8000-00000000000a', tenantId, projectA);
    await seedBooking('b0000000-0000-4000-8000-00000000000b', tenantId, projectB);
    // Another tenant books the SAME crane id, the same day — must never leak into this tenant's read.
    await seedBooking('c0000000-0000-4000-8000-00000000000c', otherTenantId, projectOther);

    store = new PostgresResourceFactsStore(new TenantScopedPool(appPool, tenant) as unknown as Pool);
  });

  afterAll(async () => {
    if (ownerPool) {
      await ownerPool.query('DELETE FROM public.aura_projects_resource_bookings WHERE tenant_id = ANY($1)', [[tenantId, otherTenantId]]).catch(() => undefined);
      await ownerPool.query('DELETE FROM public.aura_projects_resource_capacity WHERE tenant_id = $1', [tenantId]).catch(() => undefined);
      await ownerPool.query('DELETE FROM public.aura_projects_projects WHERE id = ANY($1)', [[projectA, projectB, projectOther]]).catch(() => undefined);
      await ownerPool.end();
    }
    if (appPool) await appPool.end();
  });

  it('reads both projects’ held bookings and reports the crane CONFLICTED — visible on both', async () => {
    await tenant.run({ tenantId, companyId: null, actorId: null, correlationId: null }, async () => {
      const [windows, bookings] = await Promise.all([
        store.capacityWindowsFor(tenantId, [CRANE], interval),
        store.heldBookingsFor(tenantId, [CRANE], interval),
      ]);

      expect(windows).toHaveLength(1);
      expect(bookings.map((b) => b.projectId).sort()).toEqual([projectA, projectB].sort());

      const report = assessResourceAcrossProjects(CRANE, windows, bookings, interval);
      expect(report.feasibility).toBe('CONFLICTED');
      expect(report.projectsInvolved).toEqual([projectA, projectB].sort());
      expect(report.days[0].committed).toBe(2);
      expect(report.days[0].capacity).toBe(1);
      expect(report.days[0].overBy).toBe(1);
    });
  });

  it('never returns another tenant’s booking on the same crane id — RLS holds', async () => {
    await tenant.run({ tenantId, companyId: null, actorId: null, correlationId: null }, async () => {
      const bookings = await store.heldBookingsFor(tenantId, [CRANE], interval);
      expect(bookings.every((b) => b.tenantId === tenantId)).toBe(true);
      expect(bookings.some((b) => b.projectId === projectOther)).toBe(false);
    });
  });

  it('excludes released bookings — a released crane holds nothing', async () => {
    // Release project B's booking, then read again.
    await ownerPool.query(
      `UPDATE public.aura_projects_resource_bookings
          SET status='released', released_reason='returned', released_at=now()
        WHERE id = $1`,
      ['b0000000-0000-4000-8000-00000000000b'],
    );
    await tenant.run({ tenantId, companyId: null, actorId: null, correlationId: null }, async () => {
      const bookings = await store.heldBookingsFor(tenantId, [CRANE], interval);
      expect(bookings.map((b) => b.projectId)).toEqual([projectA]);
      const report = assessResourceAcrossProjects(CRANE, await store.capacityWindowsFor(tenantId, [CRANE], interval), bookings, interval);
      expect(report.feasibility).toBe('AVAILABLE'); // back within capacity
    });
  });
});
