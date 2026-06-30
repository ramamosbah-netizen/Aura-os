import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';
import { Money, type Currency } from '@aura/shared';

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger('ExchangeRateService');
  private readonly inMemoryRates = new Map<string, number>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
  ) {}

  /**
   * Registers a rate in-memory for testing/fallback.
   */
  registerInMemoryRate(from: Currency, to: Currency, rate: number): void {
    this.inMemoryRates.set(`${from}:${to}`, rate);
    this.inMemoryRates.set(`${to}:${from}`, 1 / rate);
  }

  /** Upsert an effective rate for a tenant (persisted when a pool is configured; the
   *  inverse is also registered in-memory so conversions work without a DB). */
  async setRate(tenantId: string, from: Currency, to: Currency, rate: number, effectiveDate: Date = new Date()): Promise<void> {
    if (!(rate > 0)) throw new Error('rate must be a positive number');
    this.registerInMemoryRate(from, to, rate);
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO public.aura_exchange_rates (tenant_id, from_currency, to_currency, rate, effective_date)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, from_currency, to_currency, effective_date)
         DO UPDATE SET rate = EXCLUDED.rate`,
        [tenantId, from, to, rate, effectiveDate.toISOString().split('T')[0]],
      );
    }
    this.logger.log(`Rate set ${from}→${to} = ${rate} (${effectiveDate.toISOString().split('T')[0]})`);
  }

  /** All stored rates for a tenant, most recent first. */
  async listRates(tenantId: string): Promise<Array<{ fromCurrency: Currency; toCurrency: Currency; rate: number; effectiveDate: string }>> {
    if (!this.pool) return [];
    const res = await this.pool.query(
      `SELECT from_currency, to_currency, rate::float AS rate, effective_date::text AS effective_date
       FROM public.aura_exchange_rates WHERE tenant_id = $1
       ORDER BY effective_date DESC, from_currency, to_currency`,
      [tenantId],
    );
    return res.rows.map((r: any) => ({ fromCurrency: r.from_currency, toCurrency: r.to_currency, rate: r.rate, effectiveDate: r.effective_date }));
  }

  /**
   * Fetches exchange rate for conversions.
   */
  async getRate(tenantId: string, from: Currency, to: Currency, date: Date = new Date()): Promise<number> {
    if (from === to) return 1.0;

    // 1. Check in-memory registrations first
    const memoryKey = `${from}:${to}`;
    if (this.inMemoryRates.has(memoryKey)) {
      return this.inMemoryRates.get(memoryKey)!;
    }

    if (this.pool) {
      try {
        const formattedDate = date.toISOString().split('T')[0];
        const res = await this.pool.query(
          `SELECT rate::float as rate 
           FROM public.aura_exchange_rates
           WHERE tenant_id = $1 AND from_currency = $2 AND to_currency = $3 
             AND effective_date <= $4
           ORDER BY effective_date DESC
           LIMIT 1`,
          [tenantId, from, to, formattedDate]
        );
        
        if (res.rows.length > 0) {
          return res.rows[0].rate;
        }

        // Try the inverse rate
        const invRes = await this.pool.query(
          `SELECT rate::float as rate 
           FROM public.aura_exchange_rates
           WHERE tenant_id = $1 AND from_currency = $2 AND to_currency = $3 
             AND effective_date <= $4
           ORDER BY effective_date DESC
           LIMIT 1`,
          [tenantId, to, from, formattedDate]
        );

        if (invRes.rows.length > 0) {
          return 1.0 / invRes.rows[0].rate;
        }
      } catch (error: any) {
        this.logger.error(`Error querying database exchange rate: ${error.message}`);
      }
    }

    // 2. Default hardcoded pegs (standard GCC / USD / EUR anchors)
    return this.getDefaultPeg(from, to);
  }

  /**
   * Converts a Money value to a target currency using effective exchange rates.
   */
  async convert(tenantId: string, amount: Money, targetCurrency: Currency, date: Date = new Date()): Promise<Money> {
    if (amount.currency === targetCurrency) return amount;
    const rate = await this.getRate(tenantId, amount.currency, targetCurrency, date);
    
    // Perform conversion on major unit and return brand new Money object in target currency
    const convertedMajor = amount.major * rate;
    return Money.of(convertedMajor, targetCurrency);
  }

  private getDefaultPeg(from: Currency, to: Currency): number {
    // Basic pegs
    const pegs: Record<string, number> = {
      'USD:AED': 3.6725,
      'USD:SAR': 3.7500,
      'EUR:USD': 1.0900,
      'GBP:USD': 1.2700,
    };

    const directKey = `${from}:${to}`;
    if (pegs[directKey]) return pegs[directKey];

    const inverseKey = `${to}:${from}`;
    if (pegs[inverseKey]) return 1.0 / pegs[inverseKey];

    // Cross rates through USD (e.g., EUR to AED)
    if (from !== 'USD' && to !== 'USD') {
      const fromToUsd = this.getDefaultPeg(from, 'USD');
      const usdToTarget = this.getDefaultPeg('USD', to);
      return fromToUsd * usdToTarget;
    }

    return 1.0; // fallback parity
  }
}
