/**
 * The currencies AURA can actually govern a rate for.
 *
 * Declared as a runtime list first and the type derived from it, so the two cannot drift apart. They
 * had: `Currency` was a type with no runtime counterpart, which is why an unchecked `as Currency`
 * cast could hand the FX authority a currency it had never heard of (FX-01).
 */
export const CURRENCIES = ['AED', 'USD', 'EUR', 'SAR', 'GBP'] as const;

export type Currency = (typeof CURRENCIES)[number];

/** Narrows an arbitrary string to a governable currency. Case-insensitive; trims. */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value.trim().toUpperCase());
}

/** The canonical form of a governable currency code, or null when it is not one. */
export function toCurrency(value: unknown): Currency | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(upper) ? (upper as Currency) : null;
}

/**
 * WHETHER AURA MAY ACCEPT AN AMOUNT IN THIS CURRENCY AT ALL.
 *
 * The invariant, deliberately in three parts rather than one enum, because they are three different
 * questions with three different owners and they will not always have the same answer:
 *
 *   1. SYNTACTICALLY a currency code — three letters, ISO-4217 shaped. Owned by nobody; it is just
 *      a format.
 *   2. GOVERNABLE by AURA — a currency the FX authority can hold a rate for. Owned by the platform,
 *      and today that is a closed set.
 *   3. PERMITTED FOR THIS TENANT — owned by the tenant, and NOT IMPLEMENTED. There is no tenant
 *      currency policy yet, so this function does not pretend to answer it; the `tenantPolicy` seam
 *      below is where it goes when there is one, and `admitCurrency` is the single place every
 *      caller asks, so adding it will not need a fourth list.
 *
 * FX-01 exists because the DTO, the domain and the FX authority each answered this differently: a
 * `@IsString()`, an open `currency: string` field, and a five-member type. Every caller now asks
 * here, so they cannot drift again.
 */
export type CurrencyAdmissibility =
  | { admissible: true; currency: Currency }
  | { admissible: false; reason: 'missing' | 'malformed' | 'not_governable'; detail: string };

export function admitCurrency(value: unknown): CurrencyAdmissibility {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return { admissible: false, reason: 'missing', detail: 'a currency is required' };
  }
  if (typeof value !== 'string') {
    return { admissible: false, reason: 'malformed', detail: 'a currency must be a three-letter code' };
  }
  const upper = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) {
    return { admissible: false, reason: 'malformed', detail: `'${value.trim()}' is not a three-letter currency code` };
  }
  if (!(CURRENCIES as readonly string[]).includes(upper)) {
    return {
      admissible: false,
      reason: 'not_governable',
      detail: `'${upper}' is not a currency AURA can govern a rate for — supported: ${CURRENCIES.join(', ')}`,
    };
  }
  // SEAM: tenant currency policy goes here, taking the tenant's allowed list as an argument. Until
  // one exists this function must not invent an answer to question 3 — see §22, absence is UNKNOWN.
  return { admissible: true, currency: upper as Currency };
}

/**
 * Money as integer **minor units** (fils/cents) to avoid floating-point drift —
 * non-negotiable for an ERP. Immutable value object.
 */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: Currency,
  ) {}

  static of(amountMajor: number, currency: Currency = 'AED'): Money {
    return new Money(Math.round(amountMajor * 100), currency);
  }

  static minor(amountMinor: number, currency: Currency = 'AED'): Money {
    return new Money(Math.trunc(amountMinor), currency);
  }

  static zero(currency: Currency = 'AED'): Money {
    return new Money(0, currency);
  }

  get major(): number {
    return this.amountMinor / 100;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amountMinor * factor), this.currency);
  }

  isNegative(): boolean {
    return this.amountMinor < 0;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  toString(): string {
    return `${this.major.toFixed(2)} ${this.currency}`;
  }
}
