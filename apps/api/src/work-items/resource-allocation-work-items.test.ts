import { describe, expect, it, vi } from 'vitest';
import { WorkItemsService } from './work-items.service';

/**
 * §22 allocations arriving as the named person's own work (PLN-07).
 *
 * The property under test is attribution: a booking committed against an employee id reaches the
 * account that employment record is linked to, and reaches NOBODY otherwise. The link is the
 * hinge, so every case here is about what happens on each side of it.
 */

const empty = () => Promise.resolve([]);
const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b1', tenantId: 'tenant-a', projectId: 'p1', scheduleId: 's1', taskId: 't1', requirementId: 'r1',
  resource: { resourceType: 'employee', canonicalResourceId: 'emp-1' },
  unit: 'persons', quantity: 3, from: day(2), to: day(4), status: 'held',
  capacityAtCommitment: 4, demandAtCommitment: 3, overCapacityReason: null,
  committedAt: '2026-09-01T00:00:00.000Z', committedBy: 'u-planner',
  releasedReason: null, releasedAt: null, releasedBy: null,
  response: 'pending', responseReason: null, responseAt: null, responseBy: null,
  ...over,
});

function harness(options: { employee?: unknown; assignments?: unknown[]; allowed?: boolean } = {}) {
  const activities = { list: vi.fn(empty), get: vi.fn(), create: vi.fn(), updateDetails: vi.fn(), archive: vi.fn() };
  const engineering = { listDrawings: empty, listRfis: empty, listTechnicalQueries: empty };
  const quality = { listNcrs: empty, listSnags: empty };
  const hse = { listCapas: empty };
  const prs = { list: empty }, rfqs = { list: empty }, pos = { list: empty };
  const projectRisks = { list: empty }, projectIssues = { list: empty };
  const projectResponsibilities = { list: empty };
  const projects = { get: vi.fn(async (id: string) => ({ id, title: `Project ${id}` })) };
  const stored = new Map<string, Record<string, unknown>>(
    (options.assignments ?? []).map((view) => [(view as { booking: { id: string } }).booking.id, (view as { booking: Record<string, unknown> }).booking]),
  );
  const resourceBookings = {
    listAssignments: vi.fn(async () => options.assignments ?? []),
    get: vi.fn(async (_tenantId: string, id: string) => stored.get(id) ?? null),
    respond: vi.fn(async (input: { bookingId: string; response: string; reason?: string | null; actorId?: string }) => {
      const booking = { ...stored.get(input.bookingId), response: input.response, responseReason: input.reason ?? null, responseBy: input.actorId };
      stored.set(input.bookingId, booking);
      return { booking, activityName: 'Install CCTV devices' };
    }),
  };
  const hr = {
    findEmployeeByAccount: vi.fn(async () => options.employee ?? null),
  };
  const access = { can: vi.fn(() => ({ allowed: options.allowed ?? true })) };
  const auth = { enabled: options.allowed !== undefined };
  const notifications = { record: vi.fn(async () => ({})) };
  const service = new WorkItemsService(
    activities as never, engineering as never, quality as never, hse as never,
    prs as never, rfqs as never, pos as never,
    projectRisks as never, projectIssues as never, projectResponsibilities as never,
    resourceBookings as never, hr as never,
    projects as never, access as never, auth as never, notifications as never,
  );
  return { service, resourceBookings, hr };
}

const employee = { id: 'emp-1', tenantId: 'tenant-a', firstName: 'Maya', lastName: 'Haddad', userId: 'u-maya' };

describe('answering an allocation', () => {
  it('records an acceptance against the booking the person is named on', async () => {
    const { service, resourceBookings } = harness({
      employee,
      assignments: [{ booking: booking(), activityName: 'Install CCTV devices' }],
    });
    const item = await service.act('tenant-a', 'u-maya', 'resource-allocation', 'b1', 'accept', null);
    expect(resourceBookings.respond).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', bookingId: 'b1', response: 'accepted', actorId: 'u-maya' }),
    );
    expect(item).toMatchObject({ sourceStatus: 'held/accepted', actions: ['decline'] });
    expect(item.detail).toContain('You accepted this allocation.');
  });

  it('carries the reason into a decline and shows it back', async () => {
    const { service, resourceBookings } = harness({
      employee,
      assignments: [{ booking: booking(), activityName: 'Install CCTV devices' }],
    });
    const item = await service.act('tenant-a', 'u-maya', 'resource-allocation', 'b1', 'decline', null, 'on annual leave that week');
    expect(resourceBookings.respond).toHaveBeenCalledWith(
      expect.objectContaining({ response: 'declined', reason: 'on annual leave that week' }),
    );
    expect(item).toMatchObject({ sourceStatus: 'held/declined', actions: ['accept'] });
    expect(item.detail).toContain('You declined this: on annual leave that week');
  });

  it('refuses an account that is not linked to any employment record', async () => {
    const { service, resourceBookings } = harness({
      employee: null,
      assignments: [{ booking: booking(), activityName: 'Install CCTV devices' }],
    });
    await expect(service.act('tenant-a', 'u-admin', 'resource-allocation', 'b1', 'accept', null))
      .rejects.toThrow(/not linked to an employee record/);
    expect(resourceBookings.respond).not.toHaveBeenCalled();
  });

  it('refuses a linked person answering for somebody else', async () => {
    // The booking names emp-1; this account is emp-99. A work-item permission is not consent.
    const { service, resourceBookings } = harness({
      employee: { ...employee, id: 'emp-99' },
      assignments: [{ booking: booking(), activityName: 'Install CCTV devices' }],
    });
    await expect(service.act('tenant-a', 'u-other', 'resource-allocation', 'b1', 'accept', null))
      .rejects.toThrow(/Only the person an allocation names/);
    expect(resourceBookings.respond).not.toHaveBeenCalled();
  });

  it('refuses start, complete and reopen on an allocation', async () => {
    const { service } = harness({
      employee,
      assignments: [{ booking: booking(), activityName: 'Install CCTV devices' }],
    });
    await expect(service.act('tenant-a', 'u-maya', 'resource-allocation', 'b1', 'complete', null))
      .rejects.toThrow(/accepted or declined/);
  });

  it('refuses accept and decline on every other source', async () => {
    const { service } = harness({ employee });
    await expect(service.act('tenant-a', 'u-maya', 'crm-activity', 'a1', 'decline', null, 'no'))
      .rejects.toThrow(/Only a resource allocation/);
  });

  it('refuses an unknown booking rather than inventing one', async () => {
    const { service } = harness({ employee, assignments: [] });
    await expect(service.act('tenant-a', 'u-maya', 'resource-allocation', 'ghost', 'accept', null))
      .rejects.toThrow(/not found/);
  });
});

describe('resource allocations in My Work', () => {
  it('asks only for the employee this account is, and names the activity and dates', async () => {
    const { service, resourceBookings } = harness({
      employee,
      assignments: [{ booking: booking(), activityName: 'Install CCTV devices' }],
    });

    const { items, coverage } = await service.list('tenant-a', 'u-maya');
    expect(resourceBookings.listAssignments).toHaveBeenCalledWith(
      'tenant-a',
      { resourceType: 'employee', canonicalResourceId: 'emp-1' },
      expect.objectContaining({ from: day(0) }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'resource-allocation:b1',
      source: 'resource-allocation',
      module: 'Planning',
      title: 'Allocated to Install CCTV devices',
      detail: `3 persons held · ${day(2)} → ${day(4)}`,
      href: '/projects/schedule?projectId=p1',
      projectId: 'p1',
      projectName: 'Project p1',
      status: 'todo',
      sourceStatus: 'held/pending',
      dueAt: day(2),
      scopes: ['assigned'],
      origin: 'other',
    });
    // Not a task this person closes — but a commitment they may answer.
    expect(items[0].actions).toEqual(['accept', 'decline']);
    expect(items[0].editable).toBe(false);
    expect(coverage.connected).toContain('Planning');
  });

  it('says so when the account holds no employment record, rather than showing an empty list', async () => {
    const { service, resourceBookings } = harness({ employee: null });
    const { items, coverage } = await service.list('tenant-a', 'u-admin');
    expect(items).toHaveLength(0);
    expect(resourceBookings.listAssignments).not.toHaveBeenCalled();
    expect(coverage.connected).not.toContain('Planning');
    expect(coverage.notConnected).toContainEqual(
      expect.objectContaining({ module: 'Planning', reason: expect.stringContaining('not linked to an employee record') }),
    );
  });

  it('marks an allocation that is running today as in progress', async () => {
    const { service } = harness({
      employee,
      assignments: [{ booking: booking({ from: day(-1), to: day(1) }), activityName: 'Pull containment' }],
    });
    const { items } = await service.list('tenant-a', 'u-maya');
    expect(items[0]).toMatchObject({ status: 'in_progress', priority: 'high' });
  });

  it('reports an allocation whose activity has gone rather than showing a remembered name', async () => {
    const { service } = harness({
      employee,
      assignments: [{ booking: booking({ taskId: null }), activityName: null }],
    });
    const { items } = await service.list('tenant-a', 'u-maya');
    expect(items[0].title).toBe('Allocated to project work');
  });

  it('defers allocations past the look-ahead horizon and counts them in coverage', async () => {
    const { service } = harness({
      employee,
      assignments: [
        { booking: booking({ id: 'near' }), activityName: 'This month' },
        { booking: booking({ id: 'far', from: day(120), to: day(124) }), activityName: 'Next year' },
      ],
    });
    const { items, coverage } = await service.list('tenant-a', 'u-maya');
    expect(items.map((item) => item.sourceId)).toEqual(['near']);
    expect(coverage.notConnected).toContainEqual(
      expect.objectContaining({ module: 'Planning', reason: expect.stringContaining('1 resource allocation(s) start more than 42 days out') }),
    );
  });

  it('withholds an allocation on a project the account cannot open, and says how many', async () => {
    const { service } = harness({
      employee,
      assignments: [{ booking: booking(), activityName: 'Install CCTV devices' }],
      allowed: false,
    });
    const { items, coverage } = await service.list('tenant-a', 'u-maya', null);
    expect(items).toHaveLength(0);
    expect(coverage.notConnected).toContainEqual(
      expect.objectContaining({ module: 'Planning', reason: expect.stringContaining('1 resource allocation(s) are held against projects your account cannot open') }),
    );
  });
});
