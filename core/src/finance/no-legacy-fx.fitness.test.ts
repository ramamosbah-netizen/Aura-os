import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExchangeRateService } from './exchange-rate.service';

/**
 * FX-02's standing guard: the ungoverned FX path stays deleted.
 *
 * Deleting code proves nothing about tomorrow. `getRate()` was a convenient function — it always
 * answered, it never threw, and every one of those properties is exactly why it was dangerous.
 * Something that convenient comes back unless something objects, and a code review is not something.
 *
 * This is deliberately BOTH a structural check and a behavioural one. The structural half catches a
 * helper that quietly reintroduces a peg table without ever being called; the behavioural half
 * catches a re-added method that a source scan would miss because it was named something else.
 */

const SERVICE = path.join(__dirname, 'exchange-rate.service.ts');

/** The file with comments stripped — the removal is described in prose here, and prose is not code. */
function sourceWithoutComments(): string {
  return fs
    .readFileSync(SERVICE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the ungoverned FX path stays deleted', () => {
  it('has no method that resolves a rate outside the governed path', () => {
    const api = new Set(Object.getOwnPropertyNames(ExchangeRateService.prototype));
    for (const gone of ['getRate', 'convert', 'getDefaultPeg', 'registerInMemoryRate']) {
      expect(api.has(gone), `${gone}() was deleted by FX-02 and must not return`).toBe(false);
    }
    // …and the ones that must survive, so this test fails loudly if the file is gutted instead.
    for (const kept of ['resolveGovernedRate', 'requireGovernedRate', 'setRate', 'listRates']) {
      expect(api.has(kept), `${kept}() is the governed authority and must exist`).toBe(true);
    }
  });

  it('carries no hardcoded exchange rate anywhere in its source', () => {
    const src = sourceWithoutComments();
    // The actual constants that were in `getDefaultPeg`. A rate is data that belongs in
    // aura_exchange_rates with an effective date and somebody's authority behind it.
    for (const peg of ['3.6725', '3.7500', '1.0900', '1.2700']) {
      expect(src, `the peg ${peg} must not be reintroduced as a literal`).not.toContain(peg);
    }
    expect(src).not.toContain('getDefaultPeg');
    expect(src).not.toContain('inMemoryRates');
  });

  it('keeps no rate cache that is not scoped to a tenant', () => {
    const src = sourceWithoutComments();
    // `${from}:${to}` — the untenanted key that let one tenant's rate answer another's question.
    expect(src).not.toMatch(/\$\{\s*from\s*\}\s*:\s*\$\{\s*to\s*\}/);
    expect(src).not.toMatch(/\$\{\s*to\s*\}\s*:\s*\$\{\s*from\s*\}/);
    // Every cache key the service builds must start with the tenant.
    const keys = src.match(/`\$\{[^`]*\}\|/g) ?? [];
    expect(keys.length, 'the governed registry key must still be built from the tenant').toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^`\$\{tenantId\}\|/);
  });

  it('cannot be made to answer for an unregistered pair, by any route it still exposes', async () => {
    const service = new ExchangeRateService(null);

    // Nothing registered: every governable pair is unknown, and no peg exists to rescue it.
    for (const [from, to] of [['USD', 'AED'], ['EUR', 'AED'], ['GBP', 'USD'], ['SAR', 'AED']]) {
      const resolved = await service.resolveGovernedRate('t', from, to);
      expect(resolved.status, `${from}->${to} must be unknown with nothing registered`).toBe('unknown');
    }

    // And a currency it cannot govern is refused rather than crossed through USD.
    for (const code of ['JPY', 'KRW', 'INR', 'ZZZ']) {
      const resolved = await service.resolveGovernedRate('t', code, 'AED');
      expect(resolved.status).toBe('unknown');
      if (resolved.status !== 'unknown') throw new Error('unreachable');
      expect(resolved.reason).toBe('unsupported_currency');
    }
  });

  it('cannot be made to answer one tenant with another tenant’s rate', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate('tenant-a', 'EUR', 'AED', 4.21, new Date('2026-09-01'));
    const resolved = await service.resolveGovernedRate('tenant-b', 'EUR', 'AED', new Date('2026-09-17'));
    expect(resolved.status).toBe('unknown');
  });
});
