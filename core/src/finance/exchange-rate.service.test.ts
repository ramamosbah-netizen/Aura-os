import { describe, expect, it, vi } from 'vitest';
import { ExchangeRateService } from './exchange-rate.service';
import { Money } from '@aura/shared';
import type { Pool } from 'pg';

describe('ExchangeRateService', () => {
  it('performs simple in-memory rate conversion correctly', async () => {
    const service = new ExchangeRateService(null);
    service.registerInMemoryRate('USD', 'AED', 3.6725);

    const usdVal = Money.of(100, 'USD'); // $100
    const aedVal = await service.convert('t1', usdVal, 'AED');

    expect(aedVal.currency).toBe('AED');
    expect(aedVal.major).toBe(367.25);
  });

  it('correctly falls back to standard pegs when rate not registered', async () => {
    const service = new ExchangeRateService(null);

    // USD:SAR standard peg is 3.7500
    const rateUsdSar = await service.getRate('t1', 'USD', 'SAR');
    expect(rateUsdSar).toBe(3.7500);

    // Inverse peg: SAR:USD is 1 / 3.75
    const rateSarUsd = await service.getRate('t1', 'SAR', 'USD');
    expect(rateSarUsd).toBeCloseTo(1 / 3.75);
  });

  it('performs cross-rate calculations through USD anchors', async () => {
    const service = new ExchangeRateService(null);

    // EUR to AED: EUR -> USD -> AED
    // EUR -> USD = 1.09
    // USD -> AED = 3.6725
    // EUR -> AED = 1.09 * 3.6725 = 4.003025
    const rateEurAed = await service.getRate('t1', 'EUR', 'AED');
    expect(rateEurAed).toBeCloseTo(1.09 * 3.6725);
  });

  it('performs database query lookups when pg pool is present', async () => {
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT rate::float')) {
        return { rows: [{ rate: 3.65 }] }; // customized conversion rate
      }
      return { rows: [] };
    });

    const mockPool = {
      query: mockQuery,
    } as unknown as Pool;

    const service = new ExchangeRateService(mockPool);
    const converted = await service.convert('t1', Money.of(10, 'USD'), 'AED');

    expect(mockQuery).toHaveBeenCalled();
    expect(converted.major).toBe(36.5);
    expect(converted.currency).toBe('AED');
  });

  it('setRate registers the pair (and inverse) in-memory without a pool', async () => {
    const service = new ExchangeRateService(null);
    await service.setRate('t1', 'EUR', 'USD', 1.1);
    expect(await service.getRate('t1', 'EUR', 'USD')).toBe(1.1);
    expect(await service.getRate('t1', 'USD', 'EUR')).toBeCloseTo(1 / 1.1, 6);
  });

  it('setRate rejects a non-positive rate', async () => {
    await expect(new ExchangeRateService(null).setRate('t1', 'USD', 'AED', 0)).rejects.toThrow();
  });
});
