import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext } from '@aura/core';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { newId } from '@aura/shared';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const RUN = Date.now();
const TENANT = `c6-${RUN}`;
const COMPANY = `c6-company-${RUN}`;
/**
 * TWO PEOPLE, BECAUSE SEC-01 D-06 REQUIRES THEM (owner, 2026-09-28): the PM raises and submits a
 * variation, somebody else decides it, nobody decides their own, and a draft is never decided. This
 * proof used to create and approve from draft as one actor — refused on both counts (403 / 409) — so
 * the RAISER now creates and submits, and the DECIDER approves or rejects. The rule itself is asserted.
 */
const ACTOR = `c6-actor-${RUN}`;
const DECIDER = `c6-decider-${RUN}`;
const ROLE = `c6-role-${RUN}`;

async function ownerQuery<T extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('C6 PostgreSQL proof requires MIGRATION_DATABASE_URL or DATABASE_URL');
  const client = new pg.Client({ connectionString: url, ssl: false });
  await client.connect();
  try { return (await client.query<T>(sql, values)).rows; } finally { await client.end(); }
}

async function until<T>(read: () => Promise<T | null>, tries = 60): Promise<T | null> {
  for (let i = 0; i < tries; i += 1) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

/** The trail D-06 leaves: raised, submitted by the raiser, decided by somebody else. */
const AUDIT_TRAIL = ['created', 'submitted', 'approved'];

describe('PD-5C C6 change control — governed PostgreSQL proof', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: TenantContext;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for C6 PostgreSQL proof');
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const access = app.get(AccessService);
    access.registerRole({ id: ROLE, name: 'C6 proof', permissions: ['*'] });
    for (const userId of [ACTOR, DECIDER]) access.grant({ userId, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: TENANT } });
    tenant = app.get(TenantContext);
    app.use((req: { headers?: Record<string, string> }, _res: unknown, next: () => void) => tenant.run({
      tenantId: TENANT, companyId: COMPANY, actorId: req.headers?.['x-e2e-actor'] ?? ACTOR, correlationId: `c6-${RUN}`,
    }, () => next()));
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  it('persists governed create → approve, emits audit/event once, and rejects conflicting replay', async () => {
    const project = (await http.post('/api/v1/projects/projects').send({ title: `C6 Project ${RUN}`, value: 100_000 }).expect(201)).body as { id: string };
    const cbs = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: `C6-${RUN}`, title: 'C6 baseline', budgetAmount: 10_000 }).expect(201)).body as { id: string };
    const variation = (await http.post('/api/v1/projects/variations').send({ projectId: project.id, cbsNodeId: cbs.id, title: `C6 addition ${RUN}`, type: 'addition', amount: 2_500 }).expect(201)).body as { id: string; status: string };
    expect(variation.status).toBe('draft');

    const decide = (id: string, status: string) => http.patch(`/api/v1/projects/variations/${id}/status`).set('x-e2e-actor', DECIDER).send({ status });
    // A draft is never decided — it is submitted first.
    const fromDraft = await decide(variation.id, 'approved');
    expect(fromDraft.status, 'a draft variation is not decided').toBe(400);
    expect(String(fromDraft.body?.message)).toContain('cannot move variation from draft to approved');
    await http.patch(`/api/v1/projects/variations/${variation.id}/status`).send({ status: 'submitted' }).expect(200);
    // …and the person who raised it does not decide it.
    const own = await http.patch(`/api/v1/projects/variations/${variation.id}/status`).send({ status: 'approved' });
    expect(own.status, 'the raiser may not decide their own variation').toBe(403);
    expect(String(own.body?.message)).toContain('may not decide their own');

    await decide(variation.id, 'approved').expect(200);
    await decide(variation.id, 'approved').expect(200);
    await decide(variation.id, 'draft').expect(400);

    const persisted = await until(async () => (await ownerQuery<{ status: string; tenant_id: string; project_id: string; cbs_node_id: string }>(
      'select status, tenant_id, project_id, cbs_node_id from public.aura_projects_variations where id=$1', [variation.id]))[0] ?? null);
    expect(persisted).toMatchObject({ status: 'approved', tenant_id: TENANT, project_id: project.id, cbs_node_id: cbs.id });

    const budget = await until(async () => (await ownerQuery<{ type: string; source: string; amount: string; dedupe_key: string; variation_id: string }>(
      `select type, source, amount::text, dedupe_key, dimensions->>'variationId' as variation_id
         from public.aura_projects_cost_ledger where tenant_id=$1 and dedupe_key=$2`, [TENANT, `variation-budget:${variation.id}`]))[0] ?? null);
    expect(budget).toMatchObject({ type: 'budget', source: 'variation', dedupe_key: `variation-budget:${variation.id}`, variation_id: variation.id });
    expect(Number(budget?.amount)).toBe(2_500);
    expect((await ownerQuery<{ count: string }>(
      `select count(*)::text as count from public.aura_projects_cost_ledger where tenant_id=$1 and dedupe_key=$2`, [TENANT, `variation-budget:${variation.id}`]))[0].count).toBe('1');

    const audit = await ownerQuery<{ action: string; actor_id: string; entity_id: string; metadata: Record<string, unknown> }>(
      `select action, actor_id, entity_id, metadata from public.aura_audit_log where tenant_id=$1 and entity_type='variation' and entity_id=$2 order by created_at`, [TENANT, variation.id]);
    expect(audit.map((row) => row.action)).toEqual(AUDIT_TRAIL);
    expect(audit.find((row) => row.action === 'submitted')?.actor_id, 'the raiser submits').toBe(ACTOR);
    expect(audit.find((row) => row.action === 'approved')?.actor_id, 'the approval is the decider\'s').toBe(DECIDER);

    const events = await ownerQuery<{ type: string; actor_id: string }>(
      `select type, actor_id from public.aura_events where tenant_id=$1 and aggregate_id=$2 and type='projects.variation.approved'`, [TENANT, variation.id]);
    expect(events).toHaveLength(1);
    expect(events[0].actor_id).toBe(DECIDER);
  });

  it('keeps tenant/project boundaries fail-closed for governed variation creation', async () => {
    const project = (await http.post('/api/v1/projects/projects').send({ title: `C6 Isolation ${RUN}`, value: 1_000 }).expect(201)).body as { id: string };
    const wrongProject = await http.post('/api/v1/projects/variations').send({ projectId: newId(), title: 'invalid', type: 'addition', amount: 1 });
    expect([400, 404, 409]).toContain(wrongProject.status);
    const missing = await http.post('/api/v1/projects/variations').send({ projectId: project.id, cbsNodeId: newId(), title: 'invalid', type: 'addition', amount: 1 });
    expect([400, 404, 409]).toContain(missing.status);
  });

  it('serializes concurrent approval decisions while preserving independent changes', async () => {
    const project = (await http.post('/api/v1/projects/projects').send({ title: `C6 Concurrency ${RUN}`, value: 10_000 }).expect(201)).body as { id: string };
    const cbs = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: `C6-RACE-${RUN}`, title: 'C6 race line', budgetAmount: 1_000 }).expect(201)).body as { id: string };
    const create = (title: string, amount: number) => http.post('/api/v1/projects/variations').send({ projectId: project.id, cbsNodeId: cbs.id, title, type: 'addition', amount });
    const v1 = (await create(`C6 V1 ${RUN}`, 100).expect(201)).body as { id: string };
    const v2 = (await create(`C6 V2 ${RUN}`, 200).expect(201)).body as { id: string };
    const v3 = (await create(`C6 V3 ${RUN}`, 300).expect(201)).body as { id: string };
    for (const v of [v1, v2, v3]) await http.patch(`/api/v1/projects/variations/${v.id}/status`).send({ status: 'submitted' }).expect(200);
    const decide = (id: string, status: string) => http.patch(`/api/v1/projects/variations/${id}/status`).set('x-e2e-actor', DECIDER).send({ status });

    const duplicate = await Promise.all([decide(v1.id, 'approved'), decide(v1.id, 'approved')]);
    expect(duplicate.map((r) => r.status)).toEqual([200, 200]);

    const parallel = await Promise.all([decide(v2.id, 'approved'), decide(v2.id, 'approved')]);
    expect(parallel.map((r) => r.status)).toEqual([200, 200]);

    const conflicting = await Promise.all([decide(v3.id, 'approved'), decide(v3.id, 'rejected')]);
    expect(conflicting.filter((r) => r.status === 200)).toHaveLength(1);
    expect(conflicting.filter((r) => r.status === 400 || r.status === 409)).toHaveLength(1);

    const v3State = (await ownerQuery<{ status: string }>('select status from public.aura_projects_variations where id=$1', [v3.id]))[0];
    const expectedBudgetRows = 2 + (v3State.status === 'approved' ? 1 : 0);
    const budgetRows = async () => Number((await ownerQuery<{ count: string }>(
      `select count(*)::text as count from public.aura_projects_cost_ledger where tenant_id=$1 and project_id=$2 and source='variation'`, [TENANT, project.id]))[0]?.count);
    const rows = await until(async () => ((await budgetRows()) === expectedBudgetRows ? { count: String(expectedBudgetRows) } : null));
    // Say what the ledger actually held when the wait gave up — "expected NaN" named nothing.
    expect(Number(rows?.count), `budget rows for v1/v2/v3 (v3 ${v3State.status}); the ledger held ${await budgetRows()}`).toBe(expectedBudgetRows);
    expect(['approved', 'rejected']).toContain(v3State.status);
    if (v3State.status === 'rejected') expect(Number(rows?.count)).toBe(2);
    const approvedEvents = await until(async () => {
      const result = await ownerQuery<{ count: string }>(
        // v3 included: when its approve wins the race it has an approved event too. The query used to
        // count only v1 and v2 while expecting 3 in that case — so it passed only when reject won.
        `select count(*)::text as count from public.aura_events where tenant_id=$1 and type='projects.variation.approved' and aggregate_id in ($2,$3,$4)`, [TENANT, v1.id, v2.id, v3.id]);
      return Number(result[0]?.count) === 2 + (v3State.status === 'approved' ? 1 : 0) ? result[0] : null;
    });
    expect(Number(approvedEvents?.count)).toBe(2 + (v3State.status === 'approved' ? 1 : 0));
  });
});
