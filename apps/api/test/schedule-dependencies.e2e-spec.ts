// AURA OS — PLN-02: which activity waits for which, over HTTP.
//
// The dependency network, its cycle refusal and the CPM forward pass have existed in the planning
// domain since Step 8. Nothing could reach them: `setScheduleDependencies` had no caller anywhere
// in the product, so every plan carried an empty network and the critical path was computed over a
// graph nobody could author. The engine was right and unreachable, which is its own kind of absent.
//
// What is proven here:
//   · a planner authors the network and it survives the round trip;
//   · the WHOLE network is judged at once — a cycle is a property of the graph, not of an edge —
//     and a refusal names the loop and writes nothing;
//   · an edge naming an activity outside this plan is refused rather than quietly creating one;
//   · the accepted dates FOLLOW the dependency, counted in working days under the project's own
//     calendar, so the two halves of this capability meet;
//   · deleting an activity takes its edges with it rather than leaving the network pointing at a
//     task that no longer exists.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, CalendarService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `dependency-tenant-${Date.now()}`;

interface Plan {
  projectId: string;
  tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; durationWorkingDays: number | null }>;
  dependencies: Array<{ id: string; predecessorTaskId: string; successorTaskId: string }>;
}

describe('the dependency network a plan is built on (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let firstId: string;
  let secondId: string;
  let thirdId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.get(AccessService).grant({ userId: 'planner', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    app.get(UsersService).save({ tenantId: TENANT, userId: 'planner', displayName: 'Planner', active: true });
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: 'planner', correlationId: 'e2e-dependencies' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    // A Gulf week, so the forward pass has weekends to step over and the two halves of this
    // capability — the network and the calendar — are proven together rather than separately.
    const gulf = await app.get(CalendarService).saveCalendar({
      tenantId: TENANT, companyId: null, name: 'Gulf week', weekends: [5, 6], standardHoursPerDay: 8,
    });

    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Dependency project' }).expect(201)).body.id;
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: gulf.id }).expect(201);

    const node = async (code: string, title: string) => (await http.post('/api/v1/projects/wbs').send({
      projectId, code, title, plannedValue: 10_000,
    }).expect(201)).body.id;
    const [a, b, c] = [await node('1.1', 'Containment'), await node('1.2', 'Cabling'), await node('1.3', 'Termination')];

    // All three parked on the same Monday: only a dependency can separate them.
    const plan = (await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [
        { wbsNodeId: a, name: 'Install containment', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 2 },
        { wbsNodeId: b, name: 'Pull cable', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 2 },
        { wbsNodeId: c, name: 'Terminate', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 2 },
      ],
    }).expect(201)).body as Plan;
    const idOf = (name: string) => plan.tasks.find((task) => task.name === name)!.id;
    firstId = idOf('Install containment');
    secondId = idOf('Pull cable');
    thirdId = idOf('Terminate');
  });

  afterAll(async () => { await app?.close(); });

  const planOf = async () => (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as Plan;
  const setEdges = (edges: Array<{ predecessorTaskId: string; successorTaskId: string }>) =>
    http.post(`/api/v1/projects/schedules/${projectId}/dependencies`).send({ edges });

  it('starts with an empty network — authored, never inferred from the dates', async () => {
    // Three activities sitting on the same day is not evidence that any of them waits for another.
    expect((await planOf()).dependencies).toEqual([]);
  });

  it('authors the network and keeps it across the round trip', async () => {
    await setEdges([
      { predecessorTaskId: firstId, successorTaskId: secondId },
      { predecessorTaskId: secondId, successorTaskId: thirdId },
    ]).expect(201);
    const stored = (await planOf()).dependencies;
    expect(stored).toHaveLength(2);
    expect(stored.map((edge) => [edge.predecessorTaskId, edge.successorTaskId]))
      .toEqual([[firstId, secondId], [secondId, thirdId]]);
  });

  it('refuses a cycle, names the loop, and writes nothing', async () => {
    const refused = await setEdges([
      { predecessorTaskId: firstId, successorTaskId: secondId },
      { predecessorTaskId: secondId, successorTaskId: thirdId },
      { predecessorTaskId: thirdId, successorTaskId: firstId },
    ]);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/cycle/i);
    // The network the planner already had is untouched: a refused save is not a partial save, and
    // breaking the loop by dropping an edge nobody chose would be the system deciding which of two
    // activities waits for the other.
    expect((await planOf()).dependencies).toHaveLength(2);
  });

  it('refuses an activity depending on itself, and an edge that leaves this plan', async () => {
    const selfEdge = await setEdges([{ predecessorTaskId: firstId, successorTaskId: firstId }]);
    expect(selfEdge.status).toBe(400);
    expect(selfEdge.body.message).toMatch(/cannot depend on itself/);

    const foreign = await setEdges([{ predecessorTaskId: 'not-in-this-plan', successorTaskId: secondId }]);
    expect(foreign.status).toBe(400);
    expect(foreign.body.message).toMatch(/not a task in this schedule/);

    const duplicate = await setEdges([
      { predecessorTaskId: firstId, successorTaskId: secondId },
      { predecessorTaskId: firstId, successorTaskId: secondId },
    ]);
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.message).toMatch(/duplicate dependency/);
  });

  it('makes the planned dates FOLLOW the dependency, counted in working days', async () => {
    await setEdges([
      { predecessorTaskId: firstId, successorTaskId: secondId },
      { predecessorTaskId: secondId, successorTaskId: thirdId },
    ]).expect(201);

    // The run takes its start from the plan itself — Monday 2026-03-09, the earliest planned date.
    const { run } = (await http.post(`/api/v1/projects/schedules/${projectId}/planning-runs`)
      .send({}).expect(201)).body as {
        run: { id: string; proposal: { placements: Array<{ taskId: string; start: string; end: string }> } };
      };
    const placed = (taskId: string) => run.proposal.placements.find((p) => p.taskId === taskId)!;

    // Two working days from Monday: Mon 09, Tue 10.
    expect(placed(firstId)).toMatchObject({ start: '2026-03-09', end: '2026-03-10' });
    // The successor starts the first working day AFTER its predecessor finishes — never the same
    // day, which is what separates three activities that were all parked on the same Monday.
    expect(placed(secondId)).toMatchObject({ start: '2026-03-11', end: '2026-03-12' });
    // …and the third steps over the weekend rather than through it: Friday the 13th and Saturday
    // the 14th are not working days under this project's calendar, so it starts on Sunday.
    expect(placed(thirdId)).toMatchObject({ start: '2026-03-15', end: '2026-03-16' });

    // And accepting the proposal is what moves the stored dates — the run alone moves nothing.
    const before = await planOf();
    expect(before.tasks.find((task) => task.id === thirdId)!.plannedStart).toBe('2026-03-09');
    await http.post(`/api/v1/projects/planning-runs/${run.id}/accept`).send({}).expect(201);
    const after = await planOf();
    expect(after.tasks.find((task) => task.id === thirdId)!.plannedStart).toBe('2026-03-15');
  });

  it('takes an activity’s edges with it when the activity is removed', async () => {
    const plan = await planOf();
    expect(plan.dependencies).toHaveLength(2);
    // Saving replaces the activity list, so dropping the last activity drops the edge into it —
    // rather than leaving the network pointing at a task that no longer exists.
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.filter((task) => task.id !== thirdId).map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd,
        durationWorkingDays: task.durationWorkingDays,
      })),
    }).expect(201);
    const after = await planOf();
    expect(after.tasks).toHaveLength(2);
    expect(after.dependencies).toEqual([expect.objectContaining({ predecessorTaskId: firstId, successorTaskId: secondId })]);
  });
});
