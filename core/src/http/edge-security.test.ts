import { describe, expect, it } from 'vitest';
import {
  BODY_LIMIT,
  DEFAULT_RATE_LIMIT,
  cspFor,
  isRateLimitExempt,
  rateLimitKey,
  resolveCors,
  resolveRateLimit,
} from './edge-security';

describe('resolveCors', () => {
  it('reflects any origin outside production, so local development is not blocked', () => {
    expect(resolveCors({ allowedOrigins: null, isProduction: false })).toEqual({
      origin: true,
      credentials: true,
    });
  });

  it('uses the allowlist when one is configured', () => {
    const d = resolveCors({ allowedOrigins: 'https://app.aura.ae, https://admin.aura.ae', isProduction: true });
    expect(d.origin).toEqual(['https://app.aura.ae', 'https://admin.aura.ae']);
    expect(d.warning).toBeUndefined();
  });

  it('locks down to same-origin and warns when production has no allowlist', () => {
    const d = resolveCors({ allowedOrigins: '', isProduction: true });
    expect(d.origin).toEqual([]);
    expect(d.warning).toMatch(/CORS_ALLOWED_ORIGINS is unset in production/);
  });

  it('never silently reflects every origin in production', () => {
    for (const value of [null, '', '   ', ',,']) {
      expect(resolveCors({ allowedOrigins: value, isProduction: true }).origin).not.toBe(true);
    }
  });
});

describe('resolveRateLimit', () => {
  it('falls back to the defaults when unset', () => {
    expect(resolveRateLimit({})).toEqual(DEFAULT_RATE_LIMIT);
  });

  it('reads limit and window from the environment', () => {
    const c = resolveRateLimit({ limit: '50', windowMs: '10000' });
    expect(c.limit).toBe(50);
    expect(c.windowMs).toBe(10_000);
  });

  it('ignores values that would disable the limiter', () => {
    for (const bad of ['0', '-1', 'abc', '']) {
      expect(resolveRateLimit({ limit: bad }).limit).toBe(DEFAULT_RATE_LIMIT.limit);
      expect(resolveRateLimit({ windowMs: bad }).windowMs).toBe(DEFAULT_RATE_LIMIT.windowMs);
    }
  });
});

describe('rateLimitKey', () => {
  it('keys on the caller IP', () => {
    expect(rateLimitKey({ ip: '203.0.113.9' })).toBe('edge:203.0.113.9');
  });

  it('still produces a key when the IP is unavailable, rather than throwing', () => {
    expect(rateLimitKey({})).toBe('edge:unknown');
  });
});

describe('isRateLimitExempt', () => {
  it('exempts health and metrics, which infrastructure polls', () => {
    expect(isRateLimitExempt('/health', DEFAULT_RATE_LIMIT)).toBe(true);
    expect(isRateLimitExempt('/api/v1/health', DEFAULT_RATE_LIMIT)).toBe(true);
    expect(isRateLimitExempt('/metrics', DEFAULT_RATE_LIMIT)).toBe(true);
  });

  it('ignores the query string when matching', () => {
    expect(isRateLimitExempt('/health?verbose=1', DEFAULT_RATE_LIMIT)).toBe(true);
  });

  it('does not exempt a business route that merely starts with the same letters', () => {
    expect(isRateLimitExempt('/api/v1/healthcare-claims', DEFAULT_RATE_LIMIT)).toBe(false);
    expect(isRateLimitExempt('/api/v1/crm/accounts', DEFAULT_RATE_LIMIT)).toBe(false);
  });
});

describe('cspFor', () => {
  it('gives a JSON route the strictest policy — it needs no resources at all', () => {
    const csp = cspFor('/api/v1/crm/accounts');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('relaxes only enough for Swagger UI, which is real HTML with inline script', () => {
    const csp = cspFor('/api/docs');
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("default-src 'none'");
  });

  it('treats an unknown or empty path as an API route, not as docs', () => {
    expect(cspFor(undefined)).toContain("default-src 'none'");
    expect(cspFor('')).toContain("default-src 'none'");
  });
});

describe('BODY_LIMIT', () => {
  it('is bounded — an unbounded body is a memory-exhaustion vector', () => {
    expect(BODY_LIMIT).toBe('2mb');
  });
});
