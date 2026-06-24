export type Currency = 'AED' | 'USD' | 'EUR' | 'SAR' | 'GBP';

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
