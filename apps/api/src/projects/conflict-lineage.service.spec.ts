import { describe, expect, it, vi } from 'vitest';
import { ConflictLineageService } from './conflict-lineage.service';

/**
 * The other side of a conflict: resolved from stored rows, redacted before it leaves the server.
 *
 * The properties under test are the ones a screen cannot be trusted to enforce: that the competing
 * party is DISCOVERED rather than supplied, that every party is returned rather than the first,
 * and that a caller without a grant on the other project receives its size and its days and
 * nothing that says whose it is.
 */

const crane = { resourceType: 'asset' as const, canonicalResourceId: 'asset-crane' };

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'mine', tenantId: 't1', projectId: 'project-a', scheduleId: 'sched-a', taskId: 'task-a',
  requirementId: 'req-a', resource: crane, unit: 'units', quantity: 1,
  from: '2026-10-05', to: '2026-10-07', status: 'held',
  capacityAtCommitment: 1, demandAtCommitment: 1, overCapacityReason: null,
  committedAt: '2026-10-01T00:00:00.000Z', committedBy: 'u-planner',
  releasedReason: null, releasedAt: null, releasedBy: null,
  response: 'pending', responseReason: null, responseAt: null, responseBy: null,
  ...over,
});

const view = (over: Record<string, unknown> = {}) => ({
  booking: booking(),
  assessment: { feasibility: 'CONFLICTED', conflictDays: ['2026-10-06'], becameInfeasible: false },
  resourceConflict: { resource: crane, from: '2026-10-05', to: '2026-10-07', days: [], conflictDays: [], projectsInvolved: [], feasibility: 'CONFLICTED' },
  conflictOwner: null,
  ...over,
});

function service(options: { assignments?: unknown[]; allowed?: (projectId: string) => boolean; authEnabled?: boolean } = {}) {
  const bookings = { listAssignments: vi.fn(async () => options.assignments ?? []) };
  const projects = { get: vi.fn(async (id: string) => ({ id, title: `Title of ${id}` })) };
  const wbs = { get: vi.fn(async (id: string) => ({ id, tenantId: 't1', code: '2.1', title: 'Lifting works' })) };
  const access = { can: vi.fn((_actor: string, target: { resource?: { id: string } }) => ({ allowed: options.allowed ? options.allowed(target.resource!.id) : true })) };
  const auth = { enabled: options.authEnabled ?? true };
  return {
    service: new ConflictLineageService(bookings as never, projects as never, wbs as never, access as never, auth as never),
    bookings, projects, wbs, access,
  };
}

const competing = (over: Record<string, unknown> = {}) => ({
  booking: booking({ id: 'theirs', projectId: 'project-b', scheduleId: 'sched-b', taskId: 'task-b', requirementId: 'req-b', from: '2026-10-06', to: '2026-10-09', ...over }),
  activityName: 'Erect the mast',
  wbsNodeId: 'wbs-b',
});

describe('the other side of a conflict', () => {
  it('discovers the competing party from the resource and the dates, never from a caller', async () => {
    const { service: subject, bookings } = service({ assignments: [competing(), { booking: booking(), activityName: 'Mine', wbsNodeId: 'wbs-a' }] });
    const [attached] = await subject.attach('t1', 'u-tm', null, [view()]);

    // The only thing it was told is which resource and which days; the party came from the store.
    expect(bookings.listAssignments).toHaveBeenCalledWith('t1', crane, { from: '2026-10-05', to: '2026-10-07' });
    expect(attached.conflictingCommitments).toHaveLength(1);
    expect(attached.conflictingCommitments[0]).toMatchObject({ access: 'visible', bookingId: 'theirs' });
  });

  it('resolves the whole canonical chain from the stored rows', async () => {
    const { service: subject } = service({ assignments: [competing()] });
    const [attached] = await subject.attach('t1', 'u-tm', null, [view()]);

    expect(attached.conflictingCommitments[0]).toMatchObject({
      access: 'visible',
      bookingId: 'theirs',          // booking
      requirementId: 'req-b',       // requirement
      activityId: 'task-b',         // schedule activity
      activityName: 'Erect the mast',
      wbsNodeId: 'wbs-b',           // WBS
      wbsCode: '2.1',
      wbsTitle: 'Lifting works',
      projectId: 'project-b',       // project
      projectName: 'Title of project-b',
      quantity: 1,
      unit: 'units',
      from: '2026-10-06',
      to: '2026-10-09',
    });
    // Only the days both commitments cover — where the competition actually is.
    expect(attached.conflictingCommitments[0].overlapDays).toEqual(['2026-10-06', '2026-10-07']);
  });

  it('returns every overlapping party, not the first one it found', async () => {
    const { service: subject } = service({
      assignments: [
        competing({ id: 'b1', projectId: 'project-b' }),
        competing({ id: 'c1', projectId: 'project-c' }),
        competing({ id: 'd1', projectId: 'project-d' }),
      ],
    });
    const [attached] = await subject.attach('t1', 'u-tm', null, [view()]);
    expect(attached.conflictingCommitments.map((c) => (c.access === 'visible' ? c.projectId : 'restricted')))
      .toEqual(['project-b', 'project-c', 'project-d']);
  });

  it('leaks nothing about a project the caller may not read', async () => {
    const { service: subject, projects, wbs } = service({
      assignments: [competing()],
      allowed: (projectId) => projectId !== 'project-b',
    });
    const [attached] = await subject.attach('t1', 'u-tm', null, [view()]);

    const [only] = attached.conflictingCommitments;
    expect(only).toEqual({
      access: 'restricted', quantity: 1, unit: 'units', overlapDays: ['2026-10-06', '2026-10-07'],
    });
    // Nothing identifying is even LOOKED UP, let alone returned.
    expect(projects.get).not.toHaveBeenCalled();
    expect(wbs.get).not.toHaveBeenCalled();
    expect(JSON.stringify(only)).not.toContain('project-b');
    expect(JSON.stringify(only)).not.toContain('Erect the mast');
    expect(JSON.stringify(only)).not.toContain('Lifting works');
  });

  it('checks the OTHER project, with the permission that reads a plan', async () => {
    const { service: subject, access } = service({ assignments: [competing()] });
    await subject.attach('t1', 'u-tm', 'company-1', [view()]);

    expect(access.can).toHaveBeenCalledWith('u-tm', expect.objectContaining({
      // Not `projects.resource-conflict.*`: owning conflicts must never open somebody else's plan.
      permission: 'projects.schedule.read',
      resource: { type: 'project', id: 'project-b' },
      orgPath: [{ level: 'tenant', id: 't1' }, { level: 'company', id: 'company-1' }],
    }));
  });

  it('mixes visible and restricted parties in one answer', async () => {
    const { service: subject } = service({
      assignments: [competing({ id: 'b1', projectId: 'project-b' }), competing({ id: 'c1', projectId: 'project-secret' })],
      allowed: (projectId) => projectId === 'project-b',
    });
    const [attached] = await subject.attach('t1', 'u-tm', null, [view()]);
    expect(attached.conflictingCommitments.map((c) => c.access)).toEqual(['visible', 'restricted']);
    expect(JSON.stringify(attached.conflictingCommitments)).not.toContain('project-secret');
  });

  it('refuses everything when a verifier is on and there is no actor', async () => {
    const { service: subject } = service({ assignments: [competing()] });
    const [attached] = await subject.attach('t1', null, null, [view()]);
    expect(attached.conflictingCommitments[0].access).toBe('restricted');
  });

  it('says nothing about a released commitment, which competes for nothing', async () => {
    const { service: subject, bookings } = service({ assignments: [competing()] });
    const [attached] = await subject.attach('t1', 'u-tm', null, [view({ booking: booking({ status: 'released' }) })]);
    expect(attached.conflictingCommitments).toEqual([]);
    expect(bookings.listAssignments).not.toHaveBeenCalled();
  });

  it('is empty rather than wrong when the competing activity has no work package', async () => {
    const { service: subject } = service({ assignments: [{ ...competing(), activityName: null, wbsNodeId: null }] });
    const [attached] = await subject.attach('t1', 'u-tm', null, [view()]);
    expect(attached.conflictingCommitments[0]).toMatchObject({
      access: 'visible', activityName: null, wbsNodeId: null, wbsCode: null, wbsTitle: null,
    });
  });

  it('will not hand back a work package from another tenant', async () => {
    const bookings = { listAssignments: vi.fn(async () => [competing()]) };
    const projects = { get: vi.fn(async (id: string) => ({ id, title: 'Theirs' })) };
    const wbs = { get: vi.fn(async (id: string) => ({ id, tenantId: 'another-tenant', code: '9.9', title: 'Not ours' })) };
    const access = { can: vi.fn(() => ({ allowed: true })) };
    const subject = new ConflictLineageService(bookings as never, projects as never, wbs as never, access as never, { enabled: true } as never);

    const [attached] = await subject.attach('t1', 'u-tm', null, [view()]);
    expect(attached.conflictingCommitments[0]).toMatchObject({ wbsCode: null, wbsTitle: null });
  });

  it('writes nothing — the relationship is derived on every read', async () => {
    const { service: subject, bookings, projects, wbs } = service({ assignments: [competing()] });
    await subject.attach('t1', 'u-tm', null, [view()]);
    for (const collaborator of [bookings, projects, wbs]) {
      for (const [name, fn] of Object.entries(collaborator)) {
        // Every collaborator method reached from here is a read. There is no write to make.
        expect(name, `${name} is not a read`).toMatch(/^(listAssignments|get)$/);
        expect(typeof fn).toBe('function');
      }
    }
  });
});
