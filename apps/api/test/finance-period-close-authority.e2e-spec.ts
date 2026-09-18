// Finance period close — over HTTP, Auth-ON.
//
// THE QUESTION THIS SPEC EXISTS TO ANSWER: after the books are closed, opened again and closed again,
// what does the system say happened?
//
// Before this change it said "closed once". Reopening ran a DELETE, so the register held one row
// naming only the last closer, with no trace that the period had ever been opened again. Executed
// against the running API: close → reopen → close, two closes and two reopens inside one second, and
// the register showed a single close. Reopening asked for no reason at all, while closing could carry
// an optional note — and reopening a period that was never closed answered `201 {"reopened":"2018-01"}`.
//
// Neither route declared a permission, so the guard derived `finance.period.close` and `.reopen` and
// no role NAMED either. `r-finance` reached both through `finance.*` — the wildcard it carried
// alongside invoices, receipts, payments and cash. Declaring the permissions would have changed
// nothing while that wildcard stood, which is why the role model moved too.
//
// Three principals, all on unmodified shipped roles:
//   finance       r-finance             runs the department; may see the register, not close it
//   controllerA   r-finance-controller  closes
//   controllerB   r-finance-controller  the SECOND signature — same role, different person
//
// WHAT THIS PROVES: the HTTP contract, which principal each act belongs to, the status of every
// refusal, and that the history survives a full cycle.
// WHAT IT DOES NOT PROVE: persistence or the database invariants — in-memory stores, by construction.
// That is modules/finance/src/period-close-generations.pg-int.test.ts, against the real schema.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `pc-e2e-${Date.now()}`;
const PERIOD = '2026-08';

interface Generation {
  generation: number;
  closedBy: string | null;
  note: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
}

describe('finance period close — closing the books is a history, not a flag (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let finance: ReturnType<typeof request.agent>;
  let controllerA: ReturnType<typeof request.agent>;
  let controllerB: ReturnType<typeof request.agent>;

  const post = async <T>(a: ReturnType<typeof request.agent>, path: string, data?: unknown): Promise<T> => {
    const res = await a.post(path).send(data ?? {});
    expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
    return res.body as T;
  };
  const close = (a: ReturnType<typeof request.agent>, period: string, note?: string) =>
    a.post('/api/v1/finance/periods/close').send({ period, ...(note ? { note } : {}) });
  const reopen = (a: ReturnType<typeof request.agent>, period: string, reason?: string) =>
    a.post('/api/v1/finance/periods/reopen').send({ period, ...(reason === undefined ? {} : { reason }) });

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'period-close-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.grant({ userId: 'pc-finance', roleId: 'r-finance', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'pc-controller-a', roleId: 'r-finance-controller', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'pc-controller-b', roleId: 'r-finance-controller', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    for (const userId of ['pc-finance', 'pc-controller-a', 'pc-controller-b']) {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    const tenant = app.get(TenantContext);
    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled, 'this spec is worthless with auth off — the guard would never run').toBe(true);

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    finance = agent('pc-finance'); controllerA = agent('pc-controller-a'); controllerB = agent('pc-controller-b');
  });

  afterAll(async () => { await app?.close(); });

  it('THE CYCLE: closed, opened again by a second person, closed again — and all of it readable', async () => {
    // FINANCE CANNOT CLOSE. It used to, through `finance.*`, with the same permission that raises an
    // invoice. It can still see which periods are closed, because it works inside them.
    expect((await close(finance, PERIOD)).status).toBe(403);
    expect((await reopen(finance, PERIOD, 'because')).status).toBe(403);
    expect((await finance.get('/api/v1/finance/periods')).status).toBe(200);

    // CONTROLLER A CLOSES.
    const first = await post<Generation>(controllerA, '/api/v1/finance/periods/close', { period: PERIOD, note: 'August month-end' });
    expect(first).toMatchObject({ generation: 1, closedBy: 'pc-controller-a', reopenedAt: null });

    // A SECOND CLOSE IS REFUSED — it used to return the first row with a 201, so the second caller
    // read somebody else's `closedBy` against their own success.
    const second = await close(controllerB, PERIOD);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already closed/);

    // CONTROLLER A CANNOT REOPEN THEIR OWN CLOSE. Not a permission refusal — A holds
    // `finance.period.reopen` — a domain one, about WHICH close is being undone.
    const ownClose = await reopen(controllerA, PERIOD, 'I closed it too early');
    expect(ownClose.status, JSON.stringify(ownClose.body)).toBe(403);
    expect(ownClose.body.message).toMatch(/may not reopen their own close/);

    // A SILENT REOPEN IS REFUSED. Closing may carry an optional note; reopening may not be silent.
    expect((await reopen(controllerB, PERIOD)).status).toBe(400);
    expect((await reopen(controllerB, PERIOD, '   ')).status).toBe(400);

    // CONTROLLER B REOPENS, WITH A REASON — and gets back the close it undid, not an acknowledgement.
    const reopened = await post<Generation>(controllerB, '/api/v1/finance/periods/reopen', {
      period: PERIOD, reason: 'late supplier invoice for August',
    });
    expect(reopened).toMatchObject({
      generation: 1,
      closedBy: 'pc-controller-a',            // untouched by the reopen
      reopenedBy: 'pc-controller-b',
      reopenReason: 'late supplier invoice for August',
    });

    // REOPENING IT AGAIN IS A CONFLICT: there is no longer a close to undo.
    const twice = await reopen(controllerB, PERIOD, 'again');
    expect(twice.status).toBe(409);
    expect(twice.body.message).toMatch(/is not currently closed/);

    // CLOSED AGAIN — a new generation, not an overwrite of the first.
    const third = await post<Generation>(controllerA, '/api/v1/finance/periods/close', { period: PERIOD, note: 'August re-close' });
    expect(third).toMatchObject({ generation: 2, closedBy: 'pc-controller-a', reopenedAt: null });

    // THE FINDING, ANSWERED. Two generations on record: the first with its reopen, the second current.
    const history = (await controllerA.get(`/api/v1/finance/periods/${PERIOD}/history`)).body as Generation[];
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ generation: 2, closedBy: 'pc-controller-a', reopenedBy: null });
    expect(history[1]).toMatchObject({
      generation: 1, closedBy: 'pc-controller-a',
      reopenedBy: 'pc-controller-b', reopenReason: 'late supplier invoice for August',
    });

    // …while the register still answers the simple question with one row per period.
    const register = (await finance.get('/api/v1/finance/periods')).body as Generation[];
    expect(register.filter((p: Generation & { period?: string }) => p.period === PERIOD)).toHaveLength(1);
  });

  it('refuses a reopen of a period that was never closed, instead of reporting one', async () => {
    // It used to answer `201 {"reopened":"2018-01"}` — a success for an act that did not happen.
    // 409 and not 404: the endpoint and the period both exist; the state does not.
    const res = await reopen(controllerB, '2018-01', 'nothing to undo');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Finance period 2018-01 is not currently closed');
  });

  it('keeps the controller out of the entries it closes over', async () => {
    // Posting a journal is operational finance work. A controller who could also post would be
    // closing a period over their own entries, which is the arrangement the split exists to prevent.
    const journal = {
      reference: `PC-${Date.now()}`, description: 'controller tries to post', postedAt: '2026-12-01T00:00:00.000Z',
      lines: [{ accountCode: '1100', debit: 100, credit: 0 }, { accountCode: '4000', debit: 0, credit: 100 }],
    };
    expect((await controllerA.post('/api/v1/finance/journals').send(journal)).status).toBe(403);
    // …and Finance, who may post, cannot close the period it posted into.
    expect((await close(finance, '2026-12')).status).toBe(403);
  });

  it('still locks the ledger — the control this whole record is about', async () => {
    await post(controllerA, '/api/v1/finance/periods/close', { period: '2026-07', note: 'July' });
    const res = await finance.post('/api/v1/finance/journals').send({
      reference: `PC-LOCK-${Date.now()}`, description: 'posting into a closed period', postedAt: '2026-07-15T00:00:00.000Z',
      lines: [{ accountCode: '1100', debit: 100, credit: 0 }, { accountCode: '4000', debit: 0, credit: 100 }],
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toMatch(/2026-07 is closed/);
  });
});
