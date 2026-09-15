import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PLN-10 — from a conflict to the activities on the other side of it.
 *
 * The chain under proof, every link read from a stored row:
 *
 *   Resource  →  Booking  →  Requirement  →  Schedule activity  →  WBS node  →  Project
 *
 * Nothing the browser sends decides who the other party is. The request names the desk being read
 * and nothing else; the competing side is discovered by asking which held commitments cover the
 * same resource over the same days, and every id after that comes off those rows.
 *
 * What this spec is really guarding is the seam between two authorities that look alike and are
 * not: owning a conflict (organization-governed) and reading another project's plan (project
 * -scoped). A holder of the first must learn nothing from the second.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function post<T>(request: APIRequestContext, path: string, data: unknown, headers = apiAuthHeaders()): Promise<T> {
  const response = await request.post(`${API}${path}`, {
    headers: { 'content-type': 'application/json', ...headers },
    data,
  });
  expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

interface Schedule {
  projectId: string;
  tasks: Array<{
    id: string; name: string; wbsNodeId: string | null;
    plannedStart: string; plannedEnd: string; durationWorkingDays: number | null;
    requirements: Array<{ id: string; resource: { resourceType: string; canonicalResourceId: string }; quantity: number; unit: string }>;
  }>;
}

type Commitment =
  | { access: 'visible'; bookingId: string; requirementId: string | null; projectId: string; projectName: string | null;
      activityId: string | null; activityName: string | null; wbsNodeId: string | null; wbsCode: string | null;
      wbsTitle: string | null; quantity: number; unit: string; from: string; to: string; overlapDays: string[] }
  | { access: 'restricted'; quantity: number; unit: string; overlapDays: string[] };

interface BookingView {
  booking: { id: string; status: string; quantity: number; from: string; to: string };
  assessment: { feasibility: string; reason?: string; conflictDays: string[]; becameInfeasible: boolean };
  resourceConflict: {
    projectsInvolved: string[];
    restrictedProjects: number;
    conflictDays: string[];
    days: Array<{ day: string; committed: number; contributors: Array<{ access: string; projectId?: string; bookingId?: string }> }>;
  };
  conflictingCommitments: Commitment[];
  conflictOwner: { id: string; ownerId: string; status: string; decision: string | null } | null;
}

test.describe('A conflict reaches the activities on the other side of it', () => {
  test.setTimeout(240_000);

  test('names every competing party it may name, and nothing about the ones it may not', async ({ page, request, baseURL }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const account = process.env.E2E_USERNAME ?? 'u-admin';
    const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
    expect(password, 'the access proof needs the seeded member password').toBeTruthy();

    // ── Two projects competing for one crane ──────────────────────────────────
    const a = await post<{ id: string }>(request, '/projects/projects', { title: `Conflict A ${run}`, reference: `CFA-${run}` });
    const b = await post<{ id: string }>(request, '/projects/projects', { title: `Conflict B ${run}`, reference: `CFB-${run}` });
    const c = await post<{ id: string }>(request, '/projects/projects', { title: `Conflict C ${run}`, reference: `CFC-${run}` });
    const packageA = await post<{ id: string }>(request, '/projects/wbs', { projectId: a.id, code: '1.1', title: `Mast erection ${run}`, plannedValue: 9_000 });
    const packageB = await post<{ id: string }>(request, '/projects/wbs', { projectId: b.id, code: '2.4', title: `Panel lifting ${run}`, plannedValue: 7_000 });
    const packageC = await post<{ id: string }>(request, '/projects/wbs', { projectId: c.id, code: '3.7', title: `Roof plant ${run}`, plannedValue: 5_000 });

    const crane = await post<{ id: string }>(request, '/assets', {
      name: `Tower crane ${run}`, serialNumber: `TC-${run}`, category: 'Lifting',
      purchaseDate: '2026-01-01', purchaseCost: 500_000,
    });
    // One crane, declared once. Two projects committing against it is the clash.
    await post(request, '/projects/resource-capacity', {
      resourceType: 'asset', canonicalResourceId: crane.id, unit: 'units', quantity: 1,
      from: day(3), to: day(9), note: 'single crane',
    });

    // ADDITIVE. Saving a schedule replaces its activity list, and a requirement that has ever
    // carried a booking cannot be deleted — a released commitment still points at it — so every
    // save re-sends the activities already there alongside the new one.
    const plan = async (projectId: string, wbsNodeId: string, name: string, from: string, to: string) => {
      const before = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
      const existing = ((await before.json()) as Schedule[]).find((schedule) => schedule.projectId === projectId);
      await post<Schedule>(request, '/projects/schedules', {
        projectId,
        tasks: [
          ...(existing?.tasks ?? []).map((task) => ({
            id: task.id, wbsNodeId: task.wbsNodeId, name: task.name,
            plannedStart: task.plannedStart, plannedEnd: task.plannedEnd,
            durationWorkingDays: task.durationWorkingDays,
            requirements: task.requirements.map((requirement) => ({
              id: requirement.id, resource: requirement.resource, quantity: requirement.quantity, unit: requirement.unit,
            })),
          })),
          {
            wbsNodeId, name, plannedStart: from, plannedEnd: to, durationWorkingDays: 3,
            requirements: [{ resource: { resourceType: 'asset', canonicalResourceId: crane.id }, quantity: 1, unit: 'units' }],
          },
        ],
      });
      const schedules = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
      const saved = ((await schedules.json()) as Schedule[]).find((schedule) => schedule.projectId === projectId)!;
      const task = saved.tasks.find((candidate) => candidate.name === name)!;
      return { taskId: task.id, requirementId: task.requirements[0].id };
    };

    const activityA = `Erect the mast ${run}`;
    const activityB = `Lift the panels ${run}`;
    const activityC = `Hoist the roof plant ${run}`;
    const inA = await plan(a.id, packageA.id, activityA, day(4), day(6));
    const inB = await plan(b.id, packageB.id, activityB, day(5), day(7));
    const inC = await plan(c.id, packageC.id, activityC, day(5), day(6));

    const heldA = await post<{ booking: { id: string } }>(request, `/projects/${a.id}/resource-bookings`, { requirementId: inA.requirementId });
    const heldB = await post<{ booking: { id: string } }>(request, `/projects/${b.id}/resource-bookings`, {
      requirementId: inB.requirementId, overCapacityReason: 'second lift approved pending crane hire',
    });

    const deskOf = async (projectId: string, headers = apiAuthHeaders()): Promise<BookingView[]> => {
      const response = await request.get(`${API}/projects/${projectId}/resource-bookings`, { headers });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as BookingView[];
    };
    const mineIn = (views: BookingView[], bookingId: string) => views.find((view) => view.booking.id === bookingId)!;

    // ── A holder of both projects sees both sides and the whole lineage ────────
    const withBoth = mineIn(await deskOf(a.id), heldA.booking.id);
    expect(withBoth.assessment.feasibility).toBe('CONFLICTED');
    expect(withBoth.conflictingCommitments).toHaveLength(1);
    expect(withBoth.conflictingCommitments[0]).toMatchObject({
      access: 'visible',
      bookingId: heldB.booking.id,
      requirementId: inB.requirementId,
      activityId: inB.taskId,
      activityName: activityB,
      wbsNodeId: packageB.id,
      wbsCode: '2.4',
      wbsTitle: `Panel lifting ${run}`,
      projectId: b.id,
      projectName: `Conflict B ${run}`,
      quantity: 1,
      unit: 'units',
    });
    expect((withBoth.conflictingCommitments[0] as { overlapDays: string[] }).overlapDays).toEqual([day(5), day(6)]);

    // …and the same is true read from B's desk, pointing back at A.
    const fromB = mineIn(await deskOf(b.id), heldB.booking.id);
    expect(fromB.conflictingCommitments[0]).toMatchObject({
      access: 'visible', bookingId: heldA.booking.id, activityName: activityA,
      wbsCode: '1.1', projectId: a.id, projectName: `Conflict A ${run}`,
    });

    // It reads the same in the browser, from the persisted rows.
    await page.goto(`${baseURL}/projects/schedule?projectId=${a.id}`, { waitUntil: 'domcontentloaded' });
    const parties = page.getByTestId(`conflict-parties-${heldA.booking.id}`);
    await expect(parties).toBeVisible({ timeout: 30_000 });
    await expect(parties).toContainText(`Conflict B ${run}`);
    await expect(parties).toContainText(activityB);
    await expect(parties).toContainText('2.4');

    // ── More than one overlapping party: every one of them, not the first ─────
    const heldC = await post<{ booking: { id: string } }>(request, `/projects/${c.id}/resource-bookings`, {
      requirementId: inC.requirementId, overCapacityReason: 'third lift approved pending crane hire',
    });
    const withThree = mineIn(await deskOf(a.id), heldA.booking.id);
    expect(withThree.conflictingCommitments).toHaveLength(2);
    expect(withThree.conflictingCommitments.map((party) => (party as { projectId?: string }).projectId).sort())
      .toEqual([b.id, c.id].sort());

    // ── A conflict owner with no access to B learns nothing about B ───────────
    // The two authorities are granted separately, and this is the seam: `resource-conflict` is
    // organization-governed, `schedule.read` is project-scoped, and holding the first must not
    // open the second.
    const conflictOnlyRole = `r-e2e-conflict-${run}`;
    // The conflict authority ALONE, granted tenant-wide because a conflict spans projects. It
    // deliberately carries no `projects.*` read: whatever this identity can see of any plan has to
    // come from a project-scoped grant, which is the seam being proven.
    await post(request, '/admin/access/roles', {
      id: conflictOnlyRole, name: `Conflict owner ${run}`,
      permissions: ['projects.resource-conflict.*'],
    });
    await post(request, '/admin/access/grants', { userId: 'u-e2e-viewer', roleId: conflictOnlyRole });
    // Project A only, through membership. Nothing at all on B or C.
    await post(request, `/projects/${a.id}/members`, { userId: 'u-e2e-viewer', roleId: 'r-planning-engineer' });
    try {
      const login = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-viewer', password } });
      expect(login.ok(), await login.text()).toBe(true);
      const restricted = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` };

      const theirDesk = mineIn(await deskOf(a.id, restricted), heldA.booking.id);
      expect(theirDesk.assessment.feasibility, 'the clash is still visible').toBe('CONFLICTED');
      expect(theirDesk.conflictingCommitments).toHaveLength(2);
      for (const party of theirDesk.conflictingCommitments) {
        expect(party.access).toBe('restricted');
        // Everything that says WHOSE it is, is absent from the payload — not hidden by the client.
        expect(party).toEqual({ access: 'restricted', quantity: 1, unit: 'units', overlapDays: expect.any(Array) });
      }
      // The cross-project report is redacted by the same rule: the arithmetic survives, the
      // identity does not, and the count stays honest without naming anybody.
      expect(theirDesk.resourceConflict.projectsInvolved).toEqual([a.id]);
      expect(theirDesk.resourceConflict.restrictedProjects).toBe(2);
      const shares = theirDesk.resourceConflict.days.flatMap((entry) => entry.contributors);
      expect(shares.filter((share) => share.access === 'restricted').length).toBeGreaterThan(0);
      for (const share of shares) {
        if (share.access === 'visible') expect(share.projectId).toBe(a.id);
        else expect(share).toEqual({ access: 'restricted', quantity: 1, unit: 'units' });
      }

      const leaked = JSON.stringify(theirDesk);
      for (const secret of [b.id, c.id, `Conflict B ${run}`, `Conflict C ${run}`, activityB, activityC, packageB.id, packageC.id, '2.4', '3.7']) {
        expect(leaked, `payload must not carry ${secret}`).not.toContain(secret);
      }
      // And the desk they may not read stays refused outright.
      expect((await request.get(`${API}/projects/${b.id}/resource-bookings`, { headers: restricted })).status()).toBe(403);
    } finally {
      await request.delete(`${API}/admin/access/grants?userId=u-e2e-viewer&roleId=${conflictOnlyRole}`, { headers: apiAuthHeaders() });
    }

    // ── Ownership and its decision are recorded, and outlive the clash ────────
    const owned = await post<{ id: string }>(request, '/projects/resource-conflicts', {
      resourceType: 'asset', canonicalResourceId: crane.id, from: day(3), to: day(9), ownerId: account,
    });
    await post(request, `/projects/resource-conflicts/${owned.id}/decide`, {
      status: 'accepted', decision: `second crane hired for the week ${run}`,
    });

    // ── The other activity moves out of the window: the relationship goes ─────
    // The commitment is re-made for the new dates — a booking holds the days it was committed for,
    // and moving an activity is not a licence to move somebody's commitment underneath them.
    await post(request, `/projects/${b.id}/resource-bookings/${heldB.booking.id}/release`, { reason: `resequenced away from project A ${run}` });
    await post(request, `/projects/${c.id}/resource-bookings/${heldC.booking.id}/release`, { reason: `resequenced away from project A ${run}` });
    await post<Schedule>(request, '/projects/schedules', {
      projectId: b.id,
      tasks: [{
        // Same activity, same requirement — only the dates move.
        id: inB.taskId, wbsNodeId: packageB.id, name: activityB,
        plannedStart: day(20), plannedEnd: day(22), durationWorkingDays: 3,
        requirements: [{ id: inB.requirementId, resource: { resourceType: 'asset', canonicalResourceId: crane.id }, quantity: 1, unit: 'units' }],
      }],
    });
    await post(request, `/projects/${b.id}/resource-bookings`, { requirementId: inB.requirementId });

    const afterMove = mineIn(await deskOf(a.id), heldA.booking.id);
    expect(afterMove.conflictingCommitments, 'the derived relationship is gone').toEqual([]);
    expect(afterMove.assessment.feasibility).toBe('AVAILABLE');
    // …while what was decided about it survives untouched.
    expect(afterMove.conflictOwner).toMatchObject({
      ownerId: account, status: 'accepted', decision: `second crane hired for the week ${run}`,
    });

    // ── A new clash with a DIFFERENT activity reads as the new party ──────────
    const activityD = `Lift the transformer ${run}`;
    const inD = await plan(c.id, packageC.id, activityD, day(4), day(5));
    const heldD = await post<{ booking: { id: string } }>(request, `/projects/${c.id}/resource-bookings`, {
      requirementId: inD.requirementId, overCapacityReason: 'transformer lift approved pending crane hire',
    });

    const afterNew = mineIn(await deskOf(a.id), heldA.booking.id);
    expect(afterNew.assessment.feasibility).toBe('CONFLICTED');
    expect(afterNew.conflictingCommitments).toHaveLength(1);
    expect(afterNew.conflictingCommitments[0]).toMatchObject({
      access: 'visible', bookingId: heldD.booking.id, activityId: inD.taskId, activityName: activityD,
      projectId: c.id, wbsCode: '3.7',
    });
    // The history was not rewritten to match the new party.
    expect(afterNew.conflictOwner).toMatchObject({ status: 'accepted', decision: `second crane hired for the week ${run}` });

    // ── A breakdown is a conflict too, and names itself ──────────────────────
    // The other half of PLN-10's original acceptance: not only two projects competing, but the
    // machine going out of service under a commitment that was already made.
    await post(request, '/assets/maintenance', {
      assetId: crane.id, date: day(5), description: `gearbox overhaul ${run}`, cost: 4_000,
    });
    const afterBreakdown = mineIn(await deskOf(a.id), heldA.booking.id);
    expect(afterBreakdown.assessment.feasibility).toBe('CONFLICTED');
    expect(afterBreakdown.assessment.reason).toContain(`scheduled maintenance: gearbox overhaul ${run}`);
    expect(afterBreakdown.assessment.conflictDays).toContain(day(5));
    // Nobody did anything wrong: it fitted when it was committed.
    expect(afterBreakdown.assessment.becameInfeasible).toBe(true);

    // ── Reading a conflict changes nothing it points at ──────────────────────
    const stillA = mineIn(await deskOf(a.id), heldA.booking.id);
    expect(stillA.booking).toMatchObject({ status: 'held', quantity: 1, from: day(4), to: day(6) });
    const scheduleAfter = await request.get(`${API}/projects/schedules`, { headers: apiAuthHeaders() });
    const planA = ((await scheduleAfter.json()) as Schedule[]).find((schedule) => schedule.projectId === a.id)!;
    expect(planA.tasks.find((task) => task.id === inA.taskId)).toMatchObject({
      name: activityA, wbsNodeId: packageA.id, plannedStart: day(4), plannedEnd: day(6),
    });
  });
});
