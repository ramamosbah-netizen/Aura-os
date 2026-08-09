import { describe, it, expect } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/** No pg pool bound — exercises the in-process fallback path. */
const svc = () => new IdempotencyService(null);

describe('IdempotencyService leases', () => {
  it('acquires a lease for a new operation', async () => {
    const service = svc();
    const res = await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });
    expect(res.status).toBe('acquired');
  });

  it('returns cached response when same operationId and same payload hash are re-sent after completion', async () => {
    const service = svc();
    await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });
    await service.completeLease('t1', 'op-1', 201, { id: 'rep-101', name: 'report' }, 'daily_report', 'rep-101');

    const res = await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });
    expect(res.status).toBe('cached');
    expect(res.cachedResponse?.status).toBe(201);
    expect(res.cachedResponse?.body).toEqual({ id: 'rep-101', name: 'report' });
  });

  it('rejects with 409 when same operationId is reused with a different payload hash', async () => {
    const service = svc();
    await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report A' });
    await service.completeLease('t1', 'op-1', 201, { id: 'rep-101' });

    await expect(
      service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report B — different payload!' })
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a second caller while the first still holds a live lease', async () => {
    const service = svc();
    await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });

    await expect(
      service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' })
    ).rejects.toThrow(ConflictException);
  });

  it('lets the client retry after a released (failed) lease', async () => {
    const service = svc();
    await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });
    await service.releaseLease('t1', 'op-1');

    const res = await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });
    expect(res.status).toBe('acquired');
  });

  it('allows same operationId under a different tenantId (multi-tenant composite index)', async () => {
    const service = svc();
    const res1 = await service.acquireLease('t1', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });
    const res2 = await service.acquireLease('t2', 'op-1', 'u1', '/api/test', 'POST', { name: 'report' });
    expect(res1.status).toBe('acquired');
    expect(res2.status).toBe('acquired');
  });

  it('carries the response cache API used by CommandBus unchanged', async () => {
    const service = svc();
    expect(await service.getRecord('t1', 'k1')).toBeNull();
    await service.saveRecord('t1', 'k1', 201, { id: 'x' });
    expect(await service.getRecord('t1', 'k1')).toEqual({ status: 201, body: { id: 'x' } });
  });
});
