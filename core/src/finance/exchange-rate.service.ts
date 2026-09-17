import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';
import { Money, toCurrency, type Currency } from '@aura/shared';


/**
 * Where a governed rate came from. A decision can see it and an audit can question it — the point of
 * FX-01 is that a number with no provenance is indistinguishable from an invented one.
 */
export type GovernedRateSource = 'identity' | 'stored' | 'stored-inverse';

/** Why no governed rate could be produced. Absence and failure are NOT the same answer. */
export type GovernedRateUnknownReason =
  /** The code is not one AURA can govern a rate for at all. */
  | 'unsupported_currency'
  /** A governable pair, but nobody has registered a rate effective on or before the date. */
  | 'no_governed_rate'
  /** The rate store could not be read. This is NOT absence, and must never be treated as one. */
  | 'lookup_failed';

/**
 * The decision-grade answer to "what is this worth in that currency".
 *
 * A discriminated union ON PURPOSE. `getRate()` returns a bare number and therefore cannot say "I
 * do not know" — which is how a JPY invoice came to be booked at the USD peg. Anything that turns
 * an amount into money in the ledger asks this instead, and has to handle `unknown` to compile.
 */
export type GovernedRate =
  | {
      status: 'governed';
      rate: number;
      from: Currency;
      to: Currency;
      /** The date the rate was asked for. */
      asOf: string;
      /** The date the governing rate took effect — null only for the identity rate. */
      effectiveDate: string | null;
      source: GovernedRateSource;
    }
  | {
      status: 'unknown';
      from: string;
      to: string;
      asOf: string;
      reason: GovernedRateUnknownReason;
      /** The refusal in the domain's own words, safe to show a user. */
      detail: string;
    };

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger('ExchangeRateService');
  private readonly inMemoryRates = new Map<string, number>();
  /**
   * Rates that were actually REGISTERED, for runs with no database (the API e2e suite).
   *
   * Separate from `inMemoryRates` deliberately. That map is keyed `FROM:TO` with no tenant and no
   * effective date, so it cannot be an authority for a decision: one tenant's rate would answer
   * another tenant's question. This one is keyed by tenant and carries the date, and only `setRate`
   * writes it — `registerInMemoryRate` is test scaffolding and does NOT create a governed rate.
   */
  private readonly governedRates = new Map<string, Array<{ rate: number; effectiveDate: string }>>();

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
    this.recordGoverned(tenantId, from, to, rate, effectiveDate.toISOString().split('T')[0]);
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

  private governedKey(tenantId: string, from: Currency, to: Currency): string {
    return `${tenantId}|${from}|${to}`;
  }

  private recordGoverned(tenantId: string, from: Currency, to: Currency, rate: number, effectiveDate: string): void {
    const bucket = this.governedRates.get(this.governedKey(tenantId, from, to)) ?? [];
    const existing = bucket.findIndex((r) => r.effectiveDate === effectiveDate);
    if (existing >= 0) bucket[existing] = { rate, effectiveDate };
    else bucket.push({ rate, effectiveDate });
    bucket.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    this.governedRates.set(this.governedKey(tenantId, from, to), bucket);
  }

  /** The most recent registered rate effective on or before `asOf`, for pool-less runs. */
  private governedFromMemory(tenantId: string, from: Currency, to: Currency, asOf: string) {
    return (this.governedRates.get(this.governedKey(tenantId, from, to)) ?? []).find((r) => r.effectiveDate <= asOf);
  }

  /**
   * THE DECISION-GRADE RATE. Resolves a rate, or says it does not know — and never invents one.
   *
   * This is the strict path FX-01 asks for, and it stands BESIDE `getRate()` rather than replacing
   * it: existing callers keep the behaviour they have until each is moved deliberately. The
   * differences are the whole point of it existing:
   *
   *   It takes the currency as a STRING and narrows it here. The hole FX-01 records was an unchecked
   *   `as Currency` cast at the call site, so a path that accepts a raw code and refuses it is the
   *   only one that can close it.
   *
   *   It NEVER consults `getDefaultPeg`. A hardcoded constant is not governance: nobody in the
   *   tenant approved it, it carries no effective date, and for a floating currency it is a guess
   *   wearing the costume of a rate.
   *
   *   It does NOT cross-rate. A governed EUR:USD and a governed USD:AED do not make a governed
   *   EUR:AED — that needs a declared pivot currency and a rounding policy, which is a decision
   *   nobody has made. Until somebody does, an uncrossed pair is honestly unknown.
   *
   *   A read that FAILS is reported as a failure. `getRate` catches the error, logs it and falls
   *   through to a peg, so a database outage and a missing rate produce the same confident number.
   */
  async resolveGovernedRate(tenantId: string, from: string, to: string, date: Date = new Date()): Promise<GovernedRate> {
    const asOf = date.toISOString().split('T')[0];
    const source = toCurrency(from);
    const target = toCurrency(to);
    if (!source || !target) {
      const offending = !source ? from : to;
      return {
        status: 'unknown', from, to, asOf, reason: 'unsupported_currency',
        detail: `'${String(offending).trim().toUpperCase()}' is not a currency AURA can govern a rate for`,
      };
    }

    if (source === target) {
      return { status: 'governed', rate: 1, from: source, to: target, asOf, effectiveDate: null, source: 'identity' };
    }

    const absent: GovernedRate = {
      status: 'unknown', from: source, to: target, asOf, reason: 'no_governed_rate',
      detail: `no exchange rate from ${source} to ${target} is registered effective on or before ${asOf}`,
    };

    if (!this.pool) {
      const direct = this.governedFromMemory(tenantId, source, target, asOf);
      if (direct) return { status: 'governed', rate: direct.rate, from: source, to: target, asOf, effectiveDate: direct.effectiveDate, source: 'stored' };
      const inverse = this.governedFromMemory(tenantId, target, source, asOf);
      if (inverse) return { status: 'governed', rate: 1 / inverse.rate, from: source, to: target, asOf, effectiveDate: inverse.effectiveDate, source: 'stored-inverse' };
      return absent;
    }

    const lookup = async (a: Currency, b: Currency) => {
      const res = await this.pool!.query(
        `SELECT rate::float AS rate, effective_date::text AS effective_date
         FROM public.aura_exchange_rates
         WHERE tenant_id = $1 AND from_currency = $2 AND to_currency = $3 AND effective_date <= $4
         ORDER BY effective_date DESC
         LIMIT 1`,
        [tenantId, a, b, asOf],
      );
      return res.rows[0] as { rate: number; effective_date: string } | undefined;
    };

    try {
      const direct = await lookup(source, target);
      if (direct) return { status: 'governed', rate: direct.rate, from: source, to: target, asOf, effectiveDate: direct.effective_date, source: 'stored' };
      const inverse = await lookup(target, source);
      if (inverse) return { status: 'governed', rate: 1 / inverse.rate, from: source, to: target, asOf, effectiveDate: inverse.effective_date, source: 'stored-inverse' };
      return absent;
    } catch (error: any) {
      // NOT absence. A caller that cannot read the rate store knows nothing about whether a rate
      // exists, and must refuse for that reason rather than behave as though none was registered.
      this.logger.error(`Governed rate lookup failed ${source}->${target}: ${error?.message}`);
      return {
        status: 'unknown', from: source, to: target, asOf, reason: 'lookup_failed',
        detail: `the exchange rate register could not be read, so ${source} cannot be valued in ${target}`,
      };
    }
  }

  /**
   * The same resolution for a caller that has no way to carry on without an answer.
   *
   * Refuses in the domain's own words. The wording matters: the API exception filter reads the
   * sentence, and `must`/`cannot` place it as a 400 — the caller's request cannot be honoured as
   * given, which is exactly what it is.
   */
  async requireGovernedRate(
    tenantId: string, from: string, to: string, date: Date = new Date(),
  ): Promise<{ rate: number; from: Currency; to: Currency; effectiveDate: string | null; source: GovernedRateSource; asOf: string }> {
    const resolved = await this.resolveGovernedRate(tenantId, from, to, date);
    if (resolved.status === 'unknown') {
      throw new Error(`${resolved.detail} — a governed rate must be registered before this amount can be valued`);
    }
    const { status, ...rate } = resolved;
    return rate;
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
