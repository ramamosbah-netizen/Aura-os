import { describe, expect, it, vi } from 'vitest';
import { ExchangeRateService } from './exchange-rate.service';
import type { Pool } from 'pg';

/**
 * FX-01's strict path — the rate resolution a DECISION is allowed to use.
 *
 * Every case here is one of the ways the deleted `getRate()` produced a confident wrong number. The
 * point of the union return type is that none of them can be reached silently any more: a caller
 * has to handle `unknown` to compile, and the reasons are distinguishable so it can say WHICH kind
 * of not-knowing it hit.
 *
 * The assertions that used to sit beside these, showing what `getRate()` answered for the same
 * input, are gone with the function (FX-02). What replaced them is
 * `no-legacy-fx.fitness.test.ts`, which fails if any of it is reintroduced — a stronger guarantee
 * than a comparison, because a comparison only holds while both sides still exist.
 */
describe('resolveGovernedRate — the FX authority is allowed to say no', () => {
  const t = 'tenant-a';

  it('refuses a currency it cannot govern, instead of cross-rating it into the USD peg', async () => {
    const service = new ExchangeRateService(null);

    // THE FX-01 CASE. The old path answered 3.6725 here — the USD peg — because the unknown leg of
    // its cross-rate resolved to parity. That is how JPY 1,000,000 became AED 3,672,500.
    const resolved = await service.resolveGovernedRate(t, 'JPY', 'AED');
    expect(resolved.status).toBe('unknown');
    if (resolved.status !== 'unknown') throw new Error('unreachable');
    expect(resolved.reason).toBe('unsupported_currency');
    expect(resolved.detail).toContain('JPY');
  });

  it('refuses a governable pair that nobody has registered — it does NOT reach for a peg', async () => {
    const service = new ExchangeRateService(null);

    // The old path handed back a hardcoded EUR:USD 1.09 crossed into AED — 4.003025, a number
    // nobody in any tenant had approved.
    const resolved = await service.resolveGovernedRate(t, 'EUR', 'AED');
    expect(resolved.status).toBe('unknown');
    if (resolved.status !== 'unknown') throw new Error('unreachable');
    expect(resolved.reason).toBe('no_governed_rate');
    expect(resolved.detail).toContain('EUR');
  });

  it('resolves a registered rate, carrying the date it took effect and where it came from', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate(t, 'EUR', 'AED', 4.21, new Date('2026-09-01'));

    const resolved = await service.resolveGovernedRate(t, 'EUR', 'AED', new Date('2026-09-17'));
    expect(resolved).toMatchObject({
      status: 'governed', rate: 4.21, source: 'registered', effectiveDate: '2026-09-01', asOf: '2026-09-17', rateId: null,
    });
  });

  it('will not use a rate that had not taken effect yet on the date asked about', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate(t, 'EUR', 'AED', 4.21, new Date('2026-09-15'));

    const earlier = await service.resolveGovernedRate(t, 'EUR', 'AED', new Date('2026-09-01'));
    expect(earlier.status).toBe('unknown');
  });

  it('takes the most recent rate effective on or before the date, not merely the latest', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate(t, 'EUR', 'AED', 4.0, new Date('2026-08-01'));
    await service.setRate(t, 'EUR', 'AED', 4.3, new Date('2026-09-10'));

    const mid = await service.resolveGovernedRate(t, 'EUR', 'AED', new Date('2026-09-01'));
    expect(mid).toMatchObject({ status: 'governed', rate: 4.0, effectiveDate: '2026-08-01' });
  });

  it('names a stored inverse as an inverse, so a decision can see it was derived', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate(t, 'AED', 'EUR', 0.25, new Date('2026-09-01'));

    const resolved = await service.resolveGovernedRate(t, 'EUR', 'AED', new Date('2026-09-17'));
    expect(resolved).toMatchObject({ status: 'governed', rate: 4, source: 'registered-inverse' });
  });

  it('does not answer one tenant with the rate registered by another', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate('tenant-a', 'EUR', 'AED', 4.21, new Date('2026-09-01'));

    // The deleted `inMemoryRates` was keyed FROM:TO with no tenant, so this exact call returned
    // tenant-a's 4.21 to tenant-b. The registry that replaced it is keyed by tenant.
    const resolved = await service.resolveGovernedRate('tenant-b', 'EUR', 'AED');
    expect(resolved.status).toBe('unknown');
  });

  it('does not cross a governed EUR:USD and a governed USD:AED into a EUR:AED nobody declared', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate(t, 'EUR', 'USD', 1.09, new Date('2026-09-01'));
    await service.setRate(t, 'USD', 'AED', 3.6725, new Date('2026-09-01'));

    const resolved = await service.resolveGovernedRate(t, 'EUR', 'AED', new Date('2026-09-17'));
    expect(resolved.status).toBe('unknown');
    if (resolved.status !== 'unknown') throw new Error('unreachable');
    expect(resolved.reason).toBe('no_governed_rate');
  });

  it('values a currency in itself at 1, and says the rate is the identity', async () => {
    const resolved = await new ExchangeRateService(null).resolveGovernedRate(t, 'AED', 'AED');
    expect(resolved).toMatchObject({ status: 'governed', rate: 1, source: 'identity', effectiveDate: null });
  });

  it('accepts a lowercase or padded code, because a caller passes a raw string', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate(t, 'EUR', 'AED', 4.21, new Date('2026-09-01'));

    const resolved = await service.resolveGovernedRate(t, ' eur ', 'aed', new Date('2026-09-17'));
    expect(resolved).toMatchObject({ status: 'governed', rate: 4.21, from: 'EUR', to: 'AED' });
  });

  it('reports an unreadable rate store as a FAILURE, never as an absent rate', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('connection terminated')) } as unknown as Pool;
    const service = new ExchangeRateService(pool);

    // The old path swallowed this and answered with a peg, so an outage looked like a rate.
    const resolved = await service.resolveGovernedRate(t, 'EUR', 'AED');
    expect(resolved.status).toBe('unknown');
    if (resolved.status !== 'unknown') throw new Error('unreachable');
    expect(resolved.reason).toBe('lookup_failed');
  });

  it('reads the governed rate from the database, with its effective date', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'row-7', rate: 4.18, effective_date: '2026-09-12' }] }),
    } as unknown as Pool;

    const resolved = await new ExchangeRateService(pool).resolveGovernedRate(t, 'EUR', 'AED', new Date('2026-09-17'));
    expect(resolved).toMatchObject({ status: 'governed', rate: 4.18, effectiveDate: '2026-09-12', source: 'stored', rateId: 'row-7' });
  });
});

describe('requireGovernedRate — refusing in words the API can classify', () => {
  it('refuses each way of not knowing in a sentence a person can act on', async () => {
    const service = new ExchangeRateService(null);

    // A currency AURA cannot govern at all — telling the reader to register a rate would be wrong
    // advice, because they cannot.
    await expect(service.requireGovernedRate('t', 'JPY', 'AED'))
      .rejects.toThrow(/'JPY' is not a currency AURA can govern an exchange rate for/);

    // A governable pair with no rate — names the pair and the date, in the form a person reads.
    await expect(service.requireGovernedRate('t', 'EUR', 'AED', new Date('2026-06-10')))
      .rejects.toThrow(/No governed EUR\/AED exchange rate is available for 10 Jun 2026/);

    // `cannot` / `must` is what the exception filter reads to place these as 400s, not 500s.
    await expect(service.requireGovernedRate('t', 'JPY', 'AED')).rejects.toThrow(/cannot|must/);
    await expect(service.requireGovernedRate('t', 'EUR', 'AED')).rejects.toThrow(/cannot|must/);
  });

  it('returns the rate with its provenance when one is governed', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate('t', 'USD', 'AED', 3.67, new Date('2026-09-01'));

    await expect(service.requireGovernedRate('t', 'USD', 'AED', new Date('2026-09-17')))
      .resolves.toMatchObject({ rate: 3.67, from: 'USD', to: 'AED', effectiveDate: '2026-09-01', source: 'registered' });
  });
});

describe('the production authority is PostgreSQL, and only PostgreSQL', () => {
  it('says which regime is governing rates, rather than leaving it to be inferred', () => {
    expect(new ExchangeRateService(null).governedSourceOfTruth).toBe('in-memory-registry');
    expect(new ExchangeRateService({ query: vi.fn() } as unknown as Pool).governedSourceOfTruth).toBe('postgres');
  });

  it('never falls back to an in-process registration when a pool is configured', async () => {
    // The INSERT from setRate succeeds; every SELECT finds nothing. That is a tenant whose rate
    // lives only in this process's memory — exactly the case that must NOT govern money.
    const query = vi.fn().mockImplementation((sql: string) =>
      sql.trim().toUpperCase().startsWith('INSERT') ? { rows: [] } : { rows: [] });
    const service = new ExchangeRateService({ query } as unknown as Pool);
    await service.setRate('t', 'EUR', 'AED', 4.21, new Date('2026-09-01'));

    // It IS in the in-process registry — a pool-less service would answer with it…
    const poolless = new ExchangeRateService(null);
    await poolless.setRate('t', 'EUR', 'AED', 4.21, new Date('2026-09-01'));
    expect((await poolless.resolveGovernedRate('t', 'EUR', 'AED', new Date('2026-09-17'))).status).toBe('governed');

    // …and the pool-backed one refuses, because the governed table has no row.
    const resolved = await service.resolveGovernedRate('t', 'EUR', 'AED', new Date('2026-09-17'));
    expect(resolved.status).toBe('unknown');
    if (resolved.status !== 'unknown') throw new Error('unreachable');
    expect(resolved.reason).toBe('no_governed_rate');
  });

  it('carries the governed row id, so a booked amount can cite WHY the rate was that number', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'rate-row-1', rate: 4.18, effective_date: '2026-09-12' }] }),
    } as unknown as Pool;
    const resolved = await new ExchangeRateService(pool).resolveGovernedRate('t', 'EUR', 'AED');
    expect(resolved).toMatchObject({ status: 'governed', rateId: 'rate-row-1', source: 'stored' });
  });

  it('gives the identity rate no row and no effective date, because there is no rate to cite', async () => {
    const resolved = await new ExchangeRateService(null).resolveGovernedRate('t', 'AED', 'AED');
    expect(resolved).toMatchObject({ status: 'governed', rate: 1, source: 'identity', rateId: null, effectiveDate: null });
  });
});
