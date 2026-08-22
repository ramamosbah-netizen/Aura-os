import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, AccessService, type EventStore, type TenantContext, type UsersService } from '@aura/core';
import { makeLead, AccessDeniedError } from '@aura/shared';
import { InMemoryLeadStore } from './in-memory-lead-store';
import { InMemoryQualificationDecisionStore } from './in-memory-qualification-decision-store';
import { LeadService } from './lead.service';

/**
 * Lead Assignment — the authorization boundary (Phase 1). Uses the REAL AccessService with the REAL
 * standard roles + grants, so the capability split is proven against the ACTUAL catalog: r-sales
 * (crm.lead.*) can self-claim but NOT reassign-others, while r-sales-manager (crm.*) can. The stub
 * supplies only grant/user data; the self-vs-others decision stays inside LeadService.
 */
function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;

  const access = new AccessService(null); // no pool → in-memory grants
  access.seedStandardRoles();
  const onTenant = (tenant: string) => ({ kind: 'org' as const, level: 'tenant' as const, id: tenant });
  access.grant({ userId: 'rep', roleId: 'r-sales', scope: onTenant('t1') });
  access.grant({ userId: 'rep2', roleId: 'r-sales', scope: onTenant('t1') });
  access.grant({ userId: 'mgr', roleId: 'r-sales-manager', scope: onTenant('t1') });
  access.grant({ userId: 'finance', roleId: 'r-finance', scope: onTenant('t1') });
  access.grant({ userId: 't2user', roleId: 'r-sales', scope: onTenant('t2') }); // valid, but in ANOTHER tenant

  const roster = [
    { tenantId: 't1', userId: 'rep', displayName: 'Rep One', email: 'rep@x.co', companyId: null, active: true },
    { tenantId: 't1', userId: 'rep2', displayName: 'Rep Two', email: 'rep2@x.co', companyId: null, active: true },
    { tenantId: 't1', userId: 'mgr', displayName: 'Manager', email: 'mgr@x.co', companyId: null, active: true },
    { tenantId: 't1', userId: 'finance', displayName: 'Finance', email: 'fin@x.co', companyId: null, active: true },
    { tenantId: 't1', userId: 'gone', displayName: 'Gone', email: 'gone@x.co', companyId: null, active: false },
    { tenantId: 't2', userId: 't2user', displayName: 'Other Tenant', email: 't2@x.co', companyId: null, active: true },
  ];
  const users = {
    list: (tenantId: string) => roster.filter((u) => u.tenantId === tenantId),
    get: (tenantId: string, userId: string) => roster.find((u) => u.tenantId === tenantId && u.userId === userId) ?? null,
    isActive: (tenantId: string, userId: string) => roster.find((u) => u.tenantId === tenantId && u.userId === userId)?.active !== false,
  } as unknown as UsersService;

  const tenant = { boundTenantId: () => 't1', boundCompanyId: () => null } as unknown as TenantContext;
  const leadStore = new InMemoryLeadStore();
  const leads = new LeadService(leadStore, new InMemoryQualificationDecisionStore(), events, new NullTxRunner(), access, tenant, users);
  const setActive = (userId: string, active: boolean) => {
    const u = roster.find((r) => r.tenantId === 't1' && r.userId === userId);
    if (u) u.active = active;
  };
  return { leads, leadStore, events, access, setActive };
}

async function seed(leadStore: InMemoryLeadStore, opts: { assignedTo?: string | null } = {}) {
  const lead = makeLead({ tenantId: 't1', name: 'Lead', companyName: 'Co', status: 'new' });
  if (opts.assignedTo) lead.assignedTo = opts.assignedTo;
  await leadStore.create(lead);
  return lead;
}

describe('Lead assignment — capability split (real AccessService + real roles)', () => {
  it('Rep → self-assign an UNASSIGNED lead ✅', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    expect((await leads.assign(lead.id, 'rep', 'rep')).assignedTo).toBe('rep');
  });

  it('Rep → another user ❌ 403 (crm.lead.* does NOT grant crm.lead-assignment.others)', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    await expect(leads.assign(lead.id, 'rep2', 'rep')).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('Rep → take over an already-owned lead ❌ 403 (reassignment, not a claim)', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore, { assignedTo: 'rep2' });
    await expect(leads.assign(lead.id, 'rep', 'rep', 'grabbing it')).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('Manager (crm.lead-assignment.others) → valid Rep ✅', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    expect((await leads.assign(lead.id, 'rep', 'mgr')).assignedTo).toBe('rep');
  });

  it('missing actor on the public command ❌ 403 (no null-actor bypass)', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    await expect(leads.assign(lead.id, 'rep', null)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(leads.assign(lead.id, 'rep', undefined)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe('Lead assignment — assignee validation & reason', () => {
  it('Manager reassign WITHOUT reason ❌ 400', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore, { assignedTo: 'rep' });
    await expect(leads.assign(lead.id, 'rep2', 'mgr')).rejects.toThrow(/reason is required/i);
  });

  it('Manager reassign WITH reason ✅ + audit event carries the handover fact', async () => {
    const { leads, leadStore, events } = harness();
    const lead = await seed(leadStore, { assignedTo: 'rep' });
    expect((await leads.assign(lead.id, 'rep2', 'mgr', 'rep is on leave')).assignedTo).toBe('rep2');
    const calls = (events.appendWithClient as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const ev = (calls[calls.length - 1][1] as Array<{ payload: Record<string, unknown> }>)[0];
    expect(ev.payload).toMatchObject({ fromAssignedTo: 'rep', toAssignedTo: 'rep2', assignedBy: 'mgr', reason: 'rep is on leave' });
  });

  it('inactive assignee ❌', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    await expect(leads.assign(lead.id, 'gone', 'mgr')).rejects.toThrow(/active user/i);
  });

  it('cross-tenant assignee ❌ (valid, active, capable — but in another tenant)', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore); // tenant t1
    await expect(leads.assign(lead.id, 't2user', 'mgr')).rejects.toThrow(/user in this workspace/i);
  });

  it('assignee without lead capability ❌', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    await expect(leads.assign(lead.id, 'finance', 'mgr')).rejects.toThrow(/cannot be assigned leads/i);
  });

  it('same assignee again ✅ no-op, no new event', async () => {
    const { leads, leadStore, events } = harness();
    const lead = await seed(leadStore, { assignedTo: 'rep' });
    const before = (events.appendWithClient as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect((await leads.assign(lead.id, 'rep', 'mgr')).assignedTo).toBe('rep');
    expect((events.appendWithClient as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before);
  });
});

describe('the generic update() can NEVER change ownership (no bypass of the assign boundary)', () => {
  it('ignores assignedTo passed to update() — owner is unchanged', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore, { assignedTo: 'rep' });
    // Cast past the type: prove the RUNTIME strip, not just the compile-time Pick.
    const out = await leads.update(lead.id, { name: 'Renamed', assignedTo: 'rep2' } as never, 'mgr');
    expect(out.name).toBe('Renamed');   // ordinary field DID change
    expect(out.assignedTo).toBe('rep'); // ownership did NOT
  });
});

describe('the assign WRITE re-validates — a stale assignable-users list is never trusted (TOCTOU)', () => {
  it('assignee went inactive between GET assignable-users and PATCH assign ❌', async () => {
    const { leads, leadStore, setActive } = harness();
    const lead = await seed(leadStore);
    // GET-time: rep2 is eligible and appears in the list the UI would render.
    expect((await leads.assignableUsers(lead.id, 'mgr')).some((u) => u.id === 'rep2')).toBe(true);
    // …then the world changes before the write.
    setActive('rep2', false);
    await expect(leads.assign(lead.id, 'rep2', 'mgr')).rejects.toThrow(/active user/i);
  });

  it('assignee lost lead capability between GET and PATCH ❌', async () => {
    const { leads, leadStore, access } = harness();
    const lead = await seed(leadStore);
    expect((await leads.assignableUsers(lead.id, 'mgr')).some((u) => u.id === 'rep2')).toBe(true);
    access.revoke('rep2', 'r-sales', { kind: 'org', level: 'tenant', id: 't1' });
    await expect(leads.assign(lead.id, 'rep2', 'mgr')).rejects.toThrow(/cannot be assigned leads/i);
  });
});

describe('assignable-users is backend-scoped', () => {
  it('assignableUsers(manager) → eligible tenant users only (not finance, not inactive, not cross-tenant)', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    const ids = (await leads.assignableUsers(lead.id, 'mgr')).map((u) => u.id).sort();
    expect(ids).toEqual(['mgr', 'rep', 'rep2']);
  });

  it('assignableUsers(rep) → themselves only (self-claim)', async () => {
    const { leads, leadStore } = harness();
    const lead = await seed(leadStore);
    const list = await leads.assignableUsers(lead.id, 'rep');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'rep', self: true });
  });
});
