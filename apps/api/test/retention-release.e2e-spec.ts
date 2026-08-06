// AURA OS — retention release, over HTTP.
// Retention is withheld from every interim certificate and, until this vertical, had no way home.
// This proves the whole journey a quantity surveyor actually walks: certify an IPC (retention
// accrues) → see the position → claim a tranche → approve it → the client is billed for it, and
// the AR cap — which refuses billing ahead of certified work — lets that invoice through precisely
// because retention was withheld from the certified figure in the first place.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { AccessDeniedFilter } from '../src/auth/access-denied.filter';

const TENANT = 'retention-tenant';
const ACTOR = '00000000-0000-0000-0000-0000000000d1';
// The money controls are maker-checker: whoever raises an IPC or a retention release may not be
// the one who certifies/approves it. Both users are fully authorised — SoD is not what's under test.
const CHECKER = '00000000-0000-0000-0000-0000000000d2';

describe('Retention release — claiming back what the certificates withheld (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let contractId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-retention', name: 'Retention Super', permissions: ['*'] });
    for (const u of [ACTOR, CHECKER]) access.grant({ userId: u, roleId: 'role-retention', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
      const actorId = (req.headers['x-actor'] as string) || ACTOR;
      tenant.run({ tenantId: TENANT, companyId: null, actorId, correlationId: 'e2e-retention' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());

    // A real account: the AR reactors carry the client snapshot off the event, and skip when the
    // contract names no account — so the billing half of this journey needs one.
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Dubai Airports' }).expect(201)).body;
    const contract = (
      await http
        .post('/api/v1/contracts/contracts')
        .send({ title: 'Airport ELV package', reference: 'CT-RET-1', value: 1_000_000, accountId: account.id, accountName: account.name })
        .expect(201)
    ).body;
    contractId = contract.id;

    // IPC 1: 500,000 of work at 10% retention (capped at 5% of the contract) → 50,000 held,
    // 450,000 net certified. Certifying it also auto-drafts the client invoice for that net.
    const ipc = (
      await http
        .post('/api/v1/contracts/certificates')
        .send({ contractId, cumulativeWorkDone: 500_000, retentionPercent: 10, retentionCapPercent: 5 })
        .expect(201)
    ).body;
    await asChecker(http.patch(`/api/v1/contracts/certificates/${ipc.id}/status`)).send({ status: 'certified' }).expect(200);
  });

  afterAll(async () => {
    await app?.close();
  });

  const asChecker = (r: request.Test) => r.set('x-actor', CHECKER);

  it('shows the retention the certificates withheld, with the conventional tranches', async () => {
    const pos = (await http.get(`/api/v1/contracts/retention/position/${contractId}`).expect(200)).body;
    expect(pos.retentionHeld).toBe(50_000);
    expect(pos.releasable).toBe(50_000);
    expect(pos.released).toBe(0);
    expect(pos.suggested.practicalCompletion).toBe(25_000);
  });

  it('refuses a claim for more than was ever withheld', async () => {
    const res = await http.post('/api/v1/contracts/retention').send({ contractId, amount: 75_000 });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/exceeds the 50000 still releasable/i);
  });

  it('releases the practical-completion tranche and bills the client for it', async () => {
    const release = (
      await http
        .post('/api/v1/contracts/retention')
        .send({ contractId, kind: 'practical_completion', amount: 25_000, releaseDate: '2026-08-06' })
        .expect(201)
    ).body;
    expect(release.reference).toBe('RET-001');
    expect(release.status).toBe('draft');

    // Draft reserves against the balance — a second claim cannot spend the same money.
    const pending = (await http.get(`/api/v1/contracts/retention/position/${contractId}`).expect(200)).body;
    expect(pending.pending).toBe(25_000);
    expect(pending.releasable).toBe(25_000);

    await asChecker(http.patch(`/api/v1/contracts/retention/${release.id}/status`)).send({ status: 'approved' }).expect(200);

    const after = (await http.get(`/api/v1/contracts/retention/position/${contractId}`).expect(200)).body;
    expect(after.released).toBe(25_000);
    expect(after.pending).toBe(0);
    expect(after.releasable).toBe(25_000);

    // The approval is the AR trigger: a client invoice exists for the tranche.
    const invoices = (await http.get('/api/v1/finance/customer-invoices').expect(200)).body as Array<{
      invoiceNumber: string; subtotal: number; contractRef: string | null;
    }>;
    const retentionInvoice = invoices.find((i) => i.invoiceNumber.startsWith('AR-RET-001'));
    expect(retentionInvoice).toBeTruthy();
    expect(retentionInvoice?.subtotal).toBe(25_000);
    expect(retentionInvoice?.contractRef).toBe(contractId);
  });

  it('will not approve the same release twice — that would bill the tranche again', async () => {
    const releases = (await http.get(`/api/v1/contracts/retention?contractId=${contractId}`).expect(200)).body as Array<{ id: string; status: string }>;
    const approved = releases.find((r) => r.status === 'approved');
    const res = await asChecker(http.patch(`/api/v1/contracts/retention/${approved?.id}/status`)).send({ status: 'approved' });
    expect(res.status).toBe(409);
    expect(String(res.body.message)).toMatch(/already approved/i);
  });

  it('lets the retention invoice past the AR cap, which still refuses billing beyond it', async () => {
    // 450,000 (IPC) + 25,000 (retention) is already billed. The certified bound is now
    // 450,000 net certified + 25,000 released = 475,000, so anything further is refused.
    const res = await http.post('/api/v1/finance/customer-invoices').send({
      invoiceNumber: `AR-RET-OVER-${Math.random().toString(36).slice(2, 8)}`,
      customerName: 'Dubai Airports',
      contractRef: contractId,
      issueDate: '2026-08-06',
      lines: [{ description: 'Unsupported claim', quantity: 1, unitPrice: 10_000, vatRate: 5 }],
    });
    expect(res.status).toBe(409);
    expect(String(res.body.message)).toMatch(/certified to date/i);
  });
});
