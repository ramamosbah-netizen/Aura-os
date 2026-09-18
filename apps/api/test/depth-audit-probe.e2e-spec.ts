import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, TenantContext } from '@aura/core';
import request from 'supertest';
import { it, expect } from 'vitest';
import { AppModule } from '../src/app.module';

it('enforces governed PO approval, supplier and partial-receipt integrity', async () => {
  const previousSecret = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = 'isolated-depth-audit-test-secret';
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  const tenant = app.get(TenantContext);
  const auth = app.get(AuthService);
  const access = app.get(AccessService);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (status: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  try {
    expect(auth.enabled).toBe(true);
    access.registerRole({ id: 'depth-fixtures', name: 'Audit fixtures', permissions: ['*'] });
    access.registerRole({ id: 'depth-update', name: 'Update only', permissions: ['procurement.po.update', 'procurement.po.view'] });
    access.grant({ userId: 'depth-admin', roleId: 'depth-fixtures', scope: { kind: 'org', level: 'tenant', id: 'depth-audit' } });
    access.grant({ userId: 'depth-editor', roleId: 'depth-update', scope: { kind: 'org', level: 'tenant', id: 'depth-audit' } });
    const http = request.agent(app.getHttpServer());
    http.set('Authorization', `Bearer ${auth.mint({ sub: 'depth-admin', tenantId: 'depth-audit' })}`);
    const editorToken = `Bearer ${auth.mint({ sub: 'depth-editor', tenantId: 'depth-audit' })}`;
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Audit fixture' }).expect(201)).body;
    const po = (await http.post('/api/v1/procurement/purchase-orders').send({ title: '100 units', projectId: project.id, value: 1000, orderedQuantity: 100, unit: 'nr' }).expect(201)).body;
    // Submit, then issue (J3-01): issuing is reachable only from approved, and an order under the
    // auto-approve threshold has its approval RECORDED rather than skipped.
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/submit`).expect(201);
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/issue`).expect(201);
    const firstReceipt = await http.post('/api/v1/inventory/grns').send({ title: 'One unit only', poId: po.id, projectId: project.id, receivedQuantity: 1, unit: 'nr', value: 10 });
    expect(firstReceipt.status, JSON.stringify(firstReceipt.body)).toBe(201);
    let observed = po;
    for (let i = 0; i < 20; i++) {
      observed = (await http.get(`/api/v1/procurement/purchase-orders/${po.id}`).expect(200)).body;
      if (observed.status === 'partially_received') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const changed = await http.patch(`/api/v1/procurement/purchase-orders/${po.id}`).send({ supplierId: 'missing-supplier', supplierName: 'Unverified vendor' });
    const expensive = (await http.post('/api/v1/procurement/purchase-orders').send({ title: 'High value', value: 1000000 }).expect(201)).body;
    const normalApproval = await http.post(`/api/v1/procurement/purchase-orders/${expensive.id}/approve`).set('Authorization', editorToken).send({ approverLevel: 3 });
    const directApproval = await http.patch(`/api/v1/procurement/purchase-orders/${expensive.id}/status`).set('Authorization', editorToken).send({ status: 'approved' });
    expect(observed).toMatchObject({ id: po.id, status: 'partially_received', orderedQuantity: 100 });
    expect(changed.status).toBe(404);
    expect(normalApproval.status).toBe(403);
    expect(directApproval.status).toBe(400);

    await http.post('/api/v1/inventory/grns').send({ title: 'Remaining 99 units', poId: po.id, projectId: project.id, receivedQuantity: 99, unit: 'nr', value: 990 }).expect(201);
    for (let i = 0; i < 20; i++) {
      observed = (await http.get(`/api/v1/procurement/purchase-orders/${po.id}`).expect(200)).body;
      if (observed.status === 'received') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect(observed.status).toBe('received');
  } finally { await app.close(); if (previousSecret === undefined) delete process.env.AUTH_JWT_SECRET; else process.env.AUTH_JWT_SECRET = previousSecret; }
});
