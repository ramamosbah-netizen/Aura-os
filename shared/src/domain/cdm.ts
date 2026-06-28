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

/**
 * Geographic Location Value Object (CDM). Coordinates + a UAE emirate classifier, with an
 * optional geofence radius used by field/dispatch features (AMC, Fleet, Site).
 * (The canonical Document CDM is the DMS `Document` re-exported from this same package.)
 */
export type Emirate =
  | 'Abu Dhabi' | 'Dubai' | 'Sharjah' | 'Ajman'
  | 'Umm Al Quwain' | 'Ras Al Khaimah' | 'Fujairah';

export interface Location {
  id: Id;
  latitude: number;
  longitude: number;
  addressLine: string;
  emirate: Emirate | null;
  country: string; // ISO 3166 alpha-2, e.g. "AE"
  geofenceRadiusMeters: number | null;
}

export interface NewLocation {
  id?: Id;
  latitude: number;
  longitude: number;
  addressLine?: string;
  emirate?: Emirate | null;
  country?: string;
  geofenceRadiusMeters?: number | null;
}

/** Build a validated Location (lat ∈ [-90,90], long ∈ [-180,180]). */
export function makeLocation(input: NewLocation): Location {
  if (input.latitude < -90 || input.latitude > 90) {
    throw new Error(`latitude out of range: ${input.latitude}`);
  }
  if (input.longitude < -180 || input.longitude > 180) {
    throw new Error(`longitude out of range: ${input.longitude}`);
  }
  if (input.geofenceRadiusMeters != null && input.geofenceRadiusMeters < 0) {
    throw new Error('geofence radius cannot be negative');
  }
  return {
    id: input.id ?? newId(),
    latitude: input.latitude,
    longitude: input.longitude,
    addressLine: input.addressLine ?? '',
    emirate: input.emirate ?? null,
    country: input.country ?? 'AE',
    geofenceRadiusMeters: input.geofenceRadiusMeters ?? null,
  };
}

/** Great-circle distance in metres between two coordinates (haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000; // mean Earth radius (m)
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether `point` falls inside `location`'s geofence (requires geofenceRadiusMeters). */
export function withinGeofence(
  location: Location,
  point: { latitude: number; longitude: number },
): boolean {
  if (location.geofenceRadiusMeters == null) return false;
  return distanceMeters(location, point) <= location.geofenceRadiusMeters;
}

/**
 * Chart-of-Accounts Account (CDM) — the canonical financial account record. Modules that
 * post to the ledger reference these by code; the Finance module owns the live table.
 */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: Id;
  code: string; // COA code, e.g. "1010"
  name: string;
  type: AccountType;
}

/** Cost Center (CDM) — a postable dimension tying spend to a project and/or department. */
export interface CostCenter {
  id: Id;
  code: string;
  name: string;
  projectId: Id | null;
  departmentId: Id | null;
}

/**
 * Project (CDM) — the canonical execution context (the physical job a contract delivers),
 * distinct from the Projects module's live aggregate. Links a client Party to a Location +
 * a Period of performance.
 */
export type ProjectStatus = 'planned' | 'active' | 'suspended' | 'completed' | 'archived';

export interface Project {
  id: Id;
  tenantId: Id;
  code: string; // auto-generated, e.g. "PRJ-2026-001"
  title: string;
  clientPartyId: Id;
  location: Location | null;
  period: Period | null;
  status: ProjectStatus;
}
