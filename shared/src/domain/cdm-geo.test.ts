import { describe, it, expect } from 'vitest';
import {
  makeLocation,
  distanceMeters,
  withinGeofence,
  type Account,
  type CostCenter,
  type Project,
} from './cdm';

describe('CDM Location & geofencing', () => {
  it('builds a validated location with defaults (country AE, no geofence)', () => {
    const loc = makeLocation({ latitude: 25.2048, longitude: 55.2708, addressLine: 'Downtown Dubai', emirate: 'Dubai' });
    expect(loc.id).toBeTruthy();
    expect(loc.country).toBe('AE');
    expect(loc.emirate).toBe('Dubai');
    expect(loc.geofenceRadiusMeters).toBeNull();
  });

  it('rejects out-of-range coordinates and negative radius', () => {
    expect(() => makeLocation({ latitude: 120, longitude: 0 })).toThrow('latitude');
    expect(() => makeLocation({ latitude: 0, longitude: 200 })).toThrow('longitude');
    expect(() => makeLocation({ latitude: 0, longitude: 0, geofenceRadiusMeters: -1 })).toThrow('geofence');
  });

  it('computes great-circle distance (Dubai → Abu Dhabi ≈ 130 km)', () => {
    const d = distanceMeters(
      { latitude: 25.2048, longitude: 55.2708 },
      { latitude: 24.4539, longitude: 54.3773 },
    );
    expect(d).toBeGreaterThan(120_000);
    expect(d).toBeLessThan(140_000);
  });

  it('geofence: a point inside the radius matches, outside does not', () => {
    const site = makeLocation({ latitude: 25.2, longitude: 55.27, geofenceRadiusMeters: 500 });
    expect(withinGeofence(site, { latitude: 25.2009, longitude: 55.27 })).toBe(true); // ~100 m
    expect(withinGeofence(site, { latitude: 25.25, longitude: 55.27 })).toBe(false); // ~5.5 km
  });

  it('a location without a geofence radius never matches', () => {
    const loc = makeLocation({ latitude: 25.2, longitude: 55.27 });
    expect(withinGeofence(loc, { latitude: 25.2, longitude: 55.27 })).toBe(false);
  });

  it('exposes Account / CostCenter / Project CDM shapes', () => {
    const account: Account = { id: 'a1', code: '1010', name: 'Main Bank', type: 'asset' };
    const cc: CostCenter = { id: 'c1', code: 'CC-01', name: 'Tower A', projectId: 'p1', departmentId: null };
    const project: Project = {
      id: 'p1', tenantId: 't1', code: 'PRJ-2026-001', title: 'Tower A',
      clientPartyId: 'party1', location: null, period: null, status: 'active',
    };
    expect(account.type).toBe('asset');
    expect(cc.projectId).toBe('p1');
    expect(project.status).toBe('active');
  });
});
