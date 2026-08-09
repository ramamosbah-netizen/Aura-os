import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';
import { TenantContext } from '../tenancy/tenant-context';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';

const tenant = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'u1' }) } as unknown as TenantContext;

/** Real service on its no-pool path — the mocks would not exercise the lease logic. */
const makeInterceptor = () => new IdempotencyInterceptor(new IdempotencyService(null), tenant);

function ctx(opts: { key?: string; method?: string; body?: unknown }) {
  const request = {
    headers: opts.key ? { 'idempotency-key': opts.key } : {},
    method: opts.method ?? 'POST',
    originalUrl: '/api/site/daily-reports',
    body: opts.body ?? { note: 'a' },
  };
  const response = { statusCode: 201, status: vi.fn(), setHeader: vi.fn() };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, response };
}

const handlerOf = (body: unknown) => ({ handle: vi.fn(() => of(body)) }) as unknown as CallHandler;

describe('IdempotencyInterceptor', () => {
  it('bypasses when idempotency key is absent', async () => {
    const { context } = ctx({});
    const handler = handlerOf({ success: true });

    const result = await lastValueFrom(await makeInterceptor().intercept(context, handler));

    expect(result).toEqual({ success: true });
    expect(handler.handle).toHaveBeenCalled();
  });

  it('bypasses reads even when a key is present', async () => {
    const { context } = ctx({ key: 'op-1', method: 'GET' });
    const handler = handlerOf({ rows: [] });

    const result = await lastValueFrom(await makeInterceptor().intercept(context, handler));

    expect(result).toEqual({ rows: [] });
    expect(handler.handle).toHaveBeenCalled();
  });

  it('runs the handler once and replays its response for the same key and payload', async () => {
    const interceptor = makeInterceptor();

    const first = ctx({ key: 'op-1' });
    const firstHandler = handlerOf({ id: 'rep-1' });
    const created = await lastValueFrom(await interceptor.intercept(first.context, firstHandler));
    expect(created).toEqual({ id: 'rep-1' });

    const replay = ctx({ key: 'op-1' });
    const replayHandler = handlerOf({ id: 'rep-2-SHOULD-NOT-HAPPEN' });
    const restored = await lastValueFrom(await interceptor.intercept(replay.context, replayHandler));

    expect(restored).toEqual({ id: 'rep-1' });
    expect(replayHandler.handle).not.toHaveBeenCalled();
    expect(replay.response.status).toHaveBeenCalledWith(201);
    expect(replay.response.setHeader).toHaveBeenCalledWith('X-Idempotent-Replay', 'true');
  });

  it('rejects the same key carrying a different payload with 409', async () => {
    const interceptor = makeInterceptor();

    const first = ctx({ key: 'op-1', body: { note: 'a' } });
    await lastValueFrom(await interceptor.intercept(first.context, handlerOf({ id: 'rep-1' })));

    const mutated = ctx({ key: 'op-1', body: { note: 'b — edited after queueing' } });
    await expect(
      interceptor.intercept(mutated.context, handlerOf({ id: 'rep-2' })),
    ).rejects.toThrow(ConflictException);
  });

  it('releases the lease when the handler throws so the client can retry', async () => {
    const interceptor = makeInterceptor();

    const failing = ctx({ key: 'op-1' });
    const boom = { handle: () => throwError(() => new Error('downstream exploded')) } as unknown as CallHandler;
    await expect(
      lastValueFrom(await interceptor.intercept(failing.context, boom)),
    ).rejects.toThrow('downstream exploded');

    const retry = ctx({ key: 'op-1' });
    const retryHandler = handlerOf({ id: 'rep-1' });
    const result = await lastValueFrom(await interceptor.intercept(retry.context, retryHandler));

    expect(result).toEqual({ id: 'rep-1' });
    expect(retryHandler.handle).toHaveBeenCalled();
  });
});
