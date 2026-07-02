import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('debug2', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      transform: true, whitelist: true, forbidUnknownValues: false,
      transformOptions: { exposeUnsetFields: false },
    }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'dbg2', companyId: null, actorId: null, correlationId: 'dbg2' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => await app?.close());

  it('opportunity create carries accountName', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities')
        .send({ title: 'Named Job', value: 10, accountName: 'Acme Developments LLC' })
        .expect(201)
    ).body;
    console.log('CREATED OPP:', JSON.stringify(opp));
    expect(opp.accountName).toBe('Acme Developments LLC');
  });
});
