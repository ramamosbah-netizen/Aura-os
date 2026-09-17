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
