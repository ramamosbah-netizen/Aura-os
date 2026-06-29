import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { TenantContext } from '@aura/core';
import { CrmAccountsController } from './crm/crm-accounts.controller';
import { ContractsController } from './contracts/contracts.controller';
import { TenderingController } from './tendering/tendering.controller';
import { ProjectsController } from './projects/projects.controller';
import { ProcurementController } from './procurement/procurement.controller';
import { InventoryController } from './inventory/inventory.controller';
import { FinanceController } from './finance/finance.controller';

/**
 * §7.1 regression guard — tenant scoping on list endpoints.
 *
 * The cross-tenant read leak (§7.1) was: a spine controller's list handler called the store
 * *without* the request's tenantId, and the store only adds the `tenant_id` WHERE clause when
 * the filter is present — so on the service-role connection (RLS bypassed) it returned every
 * tenant's rows. The fix threads `this.tenant.get().tenantId` into each list call.
 *
 * This test constructs each spine controller directly (no Nest DI — vitest's esbuild transform
 * doesn't emit the decorator metadata Nest's HTTP DI needs) with a **recording fake** for the
 * relevant service and a **tenant stub**, invokes the list handler, and asserts the controller
 * forwarded the caller's tenantId into the store filter. A controller that drops tenantId fails
 * here. Unused constructor deps are passed as `undefined` (the list path never touches them).
 */

const TENANT = 'tenant-under-test';

/** A service double whose `list` records the filter it was handed and returns []. */
function recorder(): { svc: { list: (f: unknown) => Promise<unknown[]> }; last: () => any } {
  let captured: any;
  return {
    svc: { list: async (f: unknown) => { captured = f; return []; } },
    last: () => captured,
  };
}

const tenantStub = { get: () => ({ tenantId: TENANT, companyId: null, actorId: null, correlationId: 't' }) } as unknown as TenantContext;
const u = undefined as any; // unused constructor dependency for the path under test

describe('§7.1 — spine list endpoints scope by tenant', () => {
  it('CRM accounts: list forwards tenantId', async () => {
    const r = recorder();
    const c = new CrmAccountsController(r.svc as any, tenantStub);
    await c.list();
    expect(r.last().tenantId).toBe(TENANT);
  });

  it('Contracts: list forwards tenantId', async () => {
    const r = recorder();
    const c = new ContractsController(r.svc as any, tenantStub);
    await c.list();
    expect(r.last().tenantId).toBe(TENANT);
  });

  it('Tendering: list forwards tenantId', async () => {
    const r = recorder();
    const c = new TenderingController(r.svc as any, tenantStub);
    await c.list();
    expect(r.last().tenantId).toBe(TENANT);
  });

  it('Projects: listProjects forwards tenantId', async () => {
    const r = recorder();
    const c = new ProjectsController(r.svc as any, u, u, u, u, tenantStub);
    await c.listProjects();
    expect(r.last().tenantId).toBe(TENANT);
  });

  it('Procurement: listPurchaseOrders forwards tenantId', async () => {
    const r = recorder();
    const c = new ProcurementController(r.svc as any, u, u, u, tenantStub);
    await c.listPos();
    expect(r.last().tenantId).toBe(TENANT);
  });

  it('Inventory: list (GRNs) forwards tenantId', async () => {
    const r = recorder();
    const c = new InventoryController(r.svc as any, tenantStub);
    await c.list();
    expect(r.last().tenantId).toBe(TENANT);
  });

  it('Finance: listInvoices forwards tenantId', async () => {
    const r = recorder();
    const c = new FinanceController(r.svc as any, u, u, u, u, u, u, u, u, tenantStub);
    await c.listInvoices();
    expect(r.last().tenantId).toBe(TENANT);
  });
});
