import { type Id, newId } from './id';

/**
 * Address Value Object
 */
export interface Address {
  street: string;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string; // e.g., "AE"
}

/**
 * Date Period Value Object with validation
 */
export class Period {
  readonly startDate: Date;
  readonly endDate: Date;

  constructor(start: Date | string, end: Date | string) {
    const s = typeof start === 'string' ? new Date(start) : start;
    const e = typeof end === 'string' ? new Date(end) : end;

    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      throw new Error('Invalid dates provided for Period.');
    }
    if (s > e) {
      throw new Error('Period start date must be before or equal to end date.');
    }

    this.startDate = s;
    this.endDate = e;
  }

  get durationDays(): number {
    const diffTime = Math.abs(this.endDate.getTime() - this.startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  contains(date: Date): boolean {
    return date >= this.startDate && date <= this.endDate;
  }

  overlaps(other: Period): boolean {
    return this.startDate <= other.endDate && this.endDate >= other.startDate;
  }
}

/**
 * Quantity Value Object for units of measure (UoM)
 */
export class Quantity {
  constructor(
    readonly value: number,
    readonly unit: string, // e.g. "m3", "kg", "hrs", "pcs"
  ) {
    if (value < 0) {
      throw new Error('Quantity cannot be negative.');
    }
  }

  add(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return new Quantity(this.value + other.value, this.unit);
  }

  subtract(other: Quantity): Quantity {
    this.assertSameUnit(other);
    const result = this.value - other.value;
    if (result < 0) {
      throw new Error('Resulting quantity would be negative.');
    }
    return new Quantity(result, this.unit);
  }

  multiply(factor: number): Quantity {
    return new Quantity(this.value * factor, this.unit);
  }

  private assertSameUnit(other: Quantity): void {
    if (other.unit !== this.unit) {
      throw new Error(`Unit mismatch: ${this.unit} vs ${other.unit}`);
    }
  }
}

/**
 * Party Entity Representation (Golden Record CDM reference)
 */
export type PartyType = 'employee' | 'supplier' | 'customer' | 'subcontractor' | 'consultant';

export interface Party {
  id: Id;
  tenantId: Id;
  name: string;
  type: PartyType;
  email: string | null;
  phone: string | null;
  taxId: string | null; // e.g. TRN in UAE
  address: Address | null;
  isActive: boolean;
  createdAt: string;
}
