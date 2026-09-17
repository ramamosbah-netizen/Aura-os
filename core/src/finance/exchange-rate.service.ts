import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';
import { toCurrency, type Currency } from '@aura/shared';


/**
 * Where a governed rate came from. A decision can see it and an audit can question it — the point of
 * FX-01 is that a number with no provenance is indistinguishable from an invented one.
 */
export type GovernedRateSource =
  /** A currency valued in itself. Not a market rate and not a fallback — see `resolveGovernedRate`. */
  | 'identity'
  /** A row in `aura_exchange_rates`, the production source of truth. */
  | 'stored' | 'stored-inverse'
  /**
   * A rate registered through `setRate` in a run with NO database (the API e2e suite).
   *
   * Named apart from `stored` deliberately: it is not a governed row, it has no row id, and a
   * caller — or an auditor reading a booked invoice — can tell the difference. In a production
   * runtime a pool is always configured, so this can never be the answer; `governedSourceOfTruth`
   * says which regime is in force.
   */
  | 'registered' | 'registered-inverse';

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
 * A discriminated union ON PURPOSE. The deleted `getRate()` returned a bare number and therefore
 * could not say "I do not know" — which is how a JPY invoice came to be booked at the USD peg.
 * Every caller now handles `unknown` to compile; there is no longer a second path that does not.
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
      /**
       * The `aura_exchange_rates` row this came from, so a booked invoice can cite it.
       *
       * Null for the identity rate and for a pool-less registration, because in neither case is
       * there a row — which is itself the honest answer, not a missing one.
       */
      rateId: string | null;
    }
  | {
      status: 'unknown';
      from: string;
      to: string;
      asOf: string;
      reason: GovernedRateUnknownReason;
      /**
       * THE COMPLETE REFUSAL SENTENCE, written to be read by the person who hit it.
       *
       * One sentence, used verbatim by the API and by the screen, so a user is never shown a
       * generic "Error 400" for something as specific and as fixable as a missing rate. It names
       * the pair and the date because those are what the reader has to act on, and it is phrased so
       * the exception filter classifies it as a 400 rather than a 500.
       */
      detail: string;
    };

/** '2026-06-10' → '10 Jun 2026'. A refusal a user reads should carry a date a user reads. */
function readableDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(m) - 1];
  return month ? `${Number(d)} ${month} ${y}` : iso;
}

/**
 * THE FX AUTHORITY. One resolution path, and it is allowed to refuse (FX-01, FX-02).
 *
 * What used to live here, and why none of it is coming back:
 *
 *   `getRate()` returned a bare number and could not fail. An unregistered pair got a hardcoded peg;
 *   a currency outside the governable set cross-rated through USD where the unknown leg resolved to
 *   parity, so anything unrecognised converted at the USD peg 3.6725; and a database error was
 *   caught, logged and followed by a peg, making an outage indistinguishable from a missing rate.
 *
 *   `convert()` was a thin wrapper over it and inherited all of that.
 *
 *   `getDefaultPeg()` pinned floating EUR and GBP to constants nobody in any tenant had approved.
 *
 *   `inMemoryRates` was keyed `FROM:TO` with NO TENANT, so a rate registered by one tenant answered
 *   another tenant's question — a tenant-isolation breach, not merely a wrong number.
 *
 * `no-legacy-fx.fitness.test.ts` fails if any of them is reintroduced.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger('ExchangeRateService');
  /**
   * Rates that were actually REGISTERED, for runs with no database (the API e2e suite).
   *
   * Keyed by TENANT and carrying the effective date. Its deleted predecessor, `inMemoryRates`, was
   * keyed `FROM:TO` with neither, so one tenant's rate answered another tenant's question — which is
   * why this one is not simply the same map under a new name (FX-02).
   */
  private readonly governedRates = new Map<string, Array<{ rate: number; effectiveDate: string }>>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
  ) {}

  /** Upsert an effective rate for a tenant: persisted when a pool is configured, and recorded in
   *  the tenant-scoped registry so a pool-less run still has a dated, tenant-correct authority. */
  async setRate(tenantId: string, from: Currency, to: Currency, rate: number, effectiveDate: Date = new Date()): Promise<void> {
    if (!(rate > 0)) throw new Error('rate must be a positive number');
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
   * This began as FX-01's strict path, standing beside the old `getRate()` while callers were moved
   * across one at a time. They have all been moved and `getRate()` is gone (FX-02), so this is now
   * the only way to resolve a rate. The properties below are why it replaced it:
   *
   *   It takes the currency as a STRING and narrows it here. The hole FX-01 records was an unchecked
   *   `as Currency` cast at the call site, so a path that accepts a raw code and refuses it is the
   *   only one that can close it.
   *
   *   There are no pegs left to consult. A hardcoded constant is not governance: nobody in the
   *   tenant approved it, it carries no effective date, and for a floating currency it is a guess
   *   wearing the costume of a rate.
   *
   *   It does NOT cross-rate. A governed EUR:USD and a governed USD:AED do not make a governed
   *   EUR:AED — that needs a declared pivot currency and a rounding policy, which is a decision
   *   nobody has made. Until somebody does, an uncrossed pair is honestly unknown.
   *
   *   A read that FAILS is reported as a failure. The old path caught the error, logged it and fell
   *   through to a peg, so a database outage and a missing rate produced the same confident number.
   */
  async resolveGovernedRate(tenantId: string, from: string, to: string, date: Date = new Date()): Promise<GovernedRate> {
    const asOf = date.toISOString().split('T')[0];
    const source = toCurrency(from);
    const target = toCurrency(to);
    if (!source || !target) {
      const offending = String(!source ? from : to).trim().toUpperCase();
      return {
        status: 'unknown', from, to, asOf, reason: 'unsupported_currency',
        detail: `'${offending}' is not a currency AURA can govern an exchange rate for, so an amount in ${offending} cannot be valued.`,
      };
    }

    if (source === target) {
      /**
       * A currency valued in ITSELF. Explicit, not a shortcut: base→base is 1 by definition, it is
       * not a market rate and it is not a fallback, and it must never require a governed row —
       * otherwise an ordinary AED invoice would be refused for want of an AED:AED rate. It is
       * labelled `identity` so a booked invoice records that nothing was converted.
       */
      return { status: 'governed', rate: 1, from: source, to: target, asOf, effectiveDate: null, source: 'identity', rateId: null };
    }

    const absent: GovernedRate = {
      status: 'unknown', from: source, to: target, asOf, reason: 'no_governed_rate',
      detail: `No governed ${source}/${target} exchange rate is available for ${readableDate(asOf)} — a rate must be registered for that date before this amount can be valued.`,
    };

    if (!this.pool) {
      // NO DATABASE. There is no governed store to read, so the only thing that can answer is what
      // `setRate` registered in this process — reported as `registered`, never as `stored`, and
      // scoped to the tenant that registered it.
      const direct = this.governedFromMemory(tenantId, source, target, asOf);
      if (direct) return { status: 'governed', rate: direct.rate, from: source, to: target, asOf, effectiveDate: direct.effectiveDate, source: 'registered', rateId: null };
      const inverse = this.governedFromMemory(tenantId, target, source, asOf);
      if (inverse) return { status: 'governed', rate: 1 / inverse.rate, from: source, to: target, asOf, effectiveDate: inverse.effectiveDate, source: 'registered-inverse', rateId: null };
      return absent;
    }

    /**
     * A POOL IS CONFIGURED, so `aura_exchange_rates` is the ONLY authority consulted from here on.
     * The in-memory registry is not read, not merged and not used as a fallback when the table has
     * no row — a rate that exists only in this process has no audit trail and cannot govern money.
     */
    const lookup = async (a: Currency, b: Currency) => {
      const res = await this.pool!.query(
        `SELECT id::text AS id, rate::float AS rate, effective_date::text AS effective_date
         FROM public.aura_exchange_rates
         WHERE tenant_id = $1 AND from_currency = $2 AND to_currency = $3 AND effective_date <= $4
         ORDER BY effective_date DESC
         LIMIT 1`,
        [tenantId, a, b, asOf],
      );
      return res.rows[0] as { id: string; rate: number; effective_date: string } | undefined;
    };

    try {
      const direct = await lookup(source, target);
      if (direct) return { status: 'governed', rate: direct.rate, from: source, to: target, asOf, effectiveDate: direct.effective_date, source: 'stored', rateId: direct.id };
      const inverse = await lookup(target, source);
      if (inverse) return { status: 'governed', rate: 1 / inverse.rate, from: source, to: target, asOf, effectiveDate: inverse.effective_date, source: 'stored-inverse', rateId: inverse.id };
      return absent;
    } catch (error: any) {
      // NOT absence. A caller that cannot read the rate store knows nothing about whether a rate
      // exists, and must refuse for that reason rather than behave as though none was registered.
      this.logger.error(`Governed rate lookup failed ${source}->${target}: ${error?.message}`);
      return {
        status: 'unknown', from: source, to: target, asOf, reason: 'lookup_failed',
        detail: `The exchange rate register could not be read, so an amount in ${source} cannot be valued in ${target}.`,
      };
    }
  }

  /**
   * WHICH REGIME IS GOVERNING RATES IN THIS RUNTIME. A production runtime must answer 'postgres'.
   *
   * Exposed so a caller, a health check or a test can assert it rather than infer it from whether a
   * pool happens to be wired.
   */
  get governedSourceOfTruth(): 'postgres' | 'in-memory-registry' {
    return this.pool ? 'postgres' : 'in-memory-registry';
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
  ): Promise<{ rate: number; from: Currency; to: Currency; effectiveDate: string | null; source: GovernedRateSource; rateId: string | null; asOf: string }> {
    const resolved = await this.resolveGovernedRate(tenantId, from, to, date);
    // The refusal is thrown VERBATIM. One sentence, written once, shown identically by the API and
    // by the screen — a message assembled differently at each layer is how a user ends up reading
    // "Error 400" for a missing rate somebody could have registered in ten seconds.
    if (resolved.status === 'unknown') throw new Error(resolved.detail);
    const { status, ...rate } = resolved;
    return rate;
  }

}
