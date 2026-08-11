import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { EdgeRateLimitGuard } from './rate-limit.guard';
import { RateLimiter } from '../reliability/rate-limiter';

function ctx(opts: { ip?: string; url?: string } = {}) {
  const req = { ip: opts.ip ?? '203.0.113.9', originalUrl: opts.url ?? '/api/v1/crm/accounts' };
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };
  return {
    headers,
    context: {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext,
  };
}

describe('EdgeRateLimitGuard', () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_MAX = '3';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
  });
  afterEach(() => {
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  });

  const guard = () => new EdgeRateLimitGuard(new RateLimiter());

  it('allows up to the limit, then rejects with 429', async () => {
    const g = guard();
    for (let i = 0; i < 3; i++) expect(await g.canActivate(ctx().context)).toBe(true);

    await expect(g.canActivate(ctx().context)).rejects.toBeInstanceOf(HttpException);
    await g.canActivate(ctx().context).catch((e: HttpException) => {
      expect(e.getStatus()).toBe(429);
    });
  });

  it('advertises the limit and, once blocked, how long to wait', async () => {
    const g = guard();
    const first = ctx();
    await g.canActivate(first.context);
    expect(first.headers['X-RateLimit-Limit']).toBe('3');
    expect(first.headers['Retry-After']).toBeUndefined();

    for (let i = 0; i < 3; i++) await g.canActivate(ctx().context).catch(() => {});
    const blocked = ctx();
    await g.canActivate(blocked.context).catch(() => {});
    expect(blocked.headers['Retry-After']).toBe('60');
  });

  it('counts each IP separately — one noisy caller must not block everyone', async () => {
    const g = guard();
    for (let i = 0; i < 4; i++) await g.canActivate(ctx({ ip: '198.51.100.1' }).context).catch(() => {});

    expect(await g.canActivate(ctx({ ip: '198.51.100.2' }).context)).toBe(true);
  });

  it('exempts health, which infrastructure polls far above any sane limit', async () => {
    const g = guard();
    for (let i = 0; i < 20; i++) {
      expect(await g.canActivate(ctx({ url: '/api/v1/health' }).context)).toBe(true);
    }
  });

  it('ignores non-HTTP contexts rather than throwing on them', async () => {
    const g = guard();
    const rpc = { getType: () => 'rpc' } as unknown as ExecutionContext;
    expect(await g.canActivate(rpc)).toBe(true);
  });

  it('logs a given caller once, so a flood does not become a log flood', async () => {
    const g = guard();
    const warn = vi.spyOn((g as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn');
    for (let i = 0; i < 10; i++) await g.canActivate(ctx().context).catch(() => {});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('RateLimiter bucket hygiene', () => {
  it('does not grow without bound as keys churn — the flood must not become a leak', async () => {
    const limiter = new RateLimiter();
    // A window of 0ms means every timestamp is already expired by the next call, so the
    // periodic sweep runs and finds every previous bucket collectable.
    for (let i = 0; i < 500; i++) await limiter.isAllowed(`ip-${i}`, 10, 0);
    expect(limiter.size()).toBeLessThan(50);
  });

  it('still blocks a caller that is genuinely over the limit', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) expect(await limiter.isAllowed('k', 3, 60_000)).toBe(true);
    expect(await limiter.isAllowed('k', 3, 60_000)).toBe(false);
  });
});
