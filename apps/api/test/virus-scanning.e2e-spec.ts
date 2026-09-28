import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:net';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterEach, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * J1-06 / XOP-09 — EVERY UPLOAD IS SCANNED BY THE CENTRAL SCANNER, AND NO VERDICT MEANS NO UPLOAD.
 *
 * Auth ON, the whole application, a real upload route (`POST /documents`). The scanner is chosen at
 * boot from CLAMAV_HOST/CLAMAV_PORT, so each case boots the app against a different daemon:
 *
 *   unreachable   nothing listens on the port → the upload is refused 503, nothing is stored
 *   infected      a clamd that names the EICAR test file → refused 400 with the signature named
 *   clean         the same clamd clears an ordinary file → stored (201) and listed
 *
 * The EICAR test file is assembled at run time so this source file is not itself flagged.
 */
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
const TENANT = 'virus-scan-tenant';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

/** A clamd that flags anything containing the EICAR marker and clears the rest. */
function fakeClamd(): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= 4 && buf.subarray(buf.length - 4).equals(Buffer.alloc(4))) {
        socket.end(buf.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) ? 'stream: Win.Test.EICAR_HDB-1 FOUND\0' : 'stream: OK\0');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: (server.address() as { port: number }).port,
    close: () => new Promise((done) => server.close(() => done())),
  })));
}

async function closedPort(): Promise<number> {
  const probe = await fakeClamd();
  await probe.close();
  return probe.port;
}

async function boot(clamavPort: number): Promise<{ app: INestApplication; http: ReturnType<typeof request.agent> }> {
  process.env.AUTH_JWT_SECRET = 'isolated-virus-scan-secret';
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String(clamavPort);
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  app.get(AccessService).grant({ userId: 'vs-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
  app.get(UsersService).save({ tenantId: TENANT, userId: 'vs-admin', displayName: 'vs-admin', active: true });
  const http = request.agent(app.getHttpServer());
  http.set('Authorization', `Bearer ${auth.mint({ sub: 'vs-admin', tenantId: TENANT })}`);
  cleanups.push(async () => { await app.close(); delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT; });
  return { app, http };
}

const upload = (http: ReturnType<typeof request.agent>, title: string, content: string) =>
  http.post('/api/v1/documents').send({ kind: 'report', title, aggregateType: 'crm.lead', aggregateId: 'lead-vs-1', fileName: `${title}.txt`, contentType: 'text/plain', content });

it('J1-06: an unreachable scanner refuses the upload — nothing is stored unscanned', async () => {
  const { http } = await boot(await closedPort());
  const refused = await upload(http, 'unscanned-note', 'an ordinary note');
  expect(refused.status).toBe(503);
  expect(refused.body.message).toContain('cannot be stored: the virus scanner could not be reached');
  const listed = (await http.get('/api/v1/documents?aggregateType=crm.lead&aggregateId=lead-vs-1').expect(200)).body as Array<{ title: string }>;
  expect(listed.map((d) => d.title)).not.toContain('unscanned-note');
}, 120_000);

it('J1-06: an infected file is refused with the signature named, and a clean one is stored', async () => {
  const clamd = await fakeClamd();
  cleanups.push(clamd.close);
  const { http } = await boot(clamd.port);
  const infected = await upload(http, 'eicar-test', EICAR);
  expect(infected.status).toBe(400);
  expect(infected.body.message).toBe('"eicar-test.txt" cannot be stored: the virus scanner found Win.Test.EICAR_HDB-1');
  await upload(http, 'clean-note', 'scope of works for the lobby').expect(201);
  const listed = (await http.get('/api/v1/documents?aggregateType=crm.lead&aggregateId=lead-vs-1').expect(200)).body as Array<{ title: string }>;
  expect(listed.map((d) => d.title)).toEqual(['clean-note']);
}, 120_000);
