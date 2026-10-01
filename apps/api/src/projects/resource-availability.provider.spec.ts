import { describe, expect, it, vi } from 'vitest';
import { businessDateInDays } from '@aura/shared';
import { ResourceAvailabilityFromRegisters } from './resource-availability.provider';

/**
 * What each register's words mean in §22's terms.
 *
 * The distinctions under test are the ones that decide whether a planner is told a useful thing:
 * a pending leave is a request and not a fact; an undated "out of service" is UNKNOWN rather than
 * a known absence; and a pool never inherits its members' leave.
 */

const provider = (registers: {
  leaves?: unknown[]; vehicles?: unknown[]; fleetMaintenance?: unknown[];
  assets?: unknown[]; assetMaintenance?: unknown[];
} = {}) => new ResourceAvailabilityFromRegisters(
  { listLeaves: vi.fn(async () => registers.leaves ?? []) } as never,
  {
    listVehicles: vi.fn(async () => registers.vehicles ?? []),
    listMaintenance: vi.fn(async () => registers.fleetMaintenance ?? []),
  } as never,
  {
    listAssets: vi.fn(async () => registers.assets ?? []),
    listMaintenance: vi.fn(async () => registers.assetMaintenance ?? []),
  } as never,
);

const employee = { resourceType: 'employee' as const, canonicalResourceId: 'emp-maya' };
const vehicle = { resourceType: 'vehicle' as const, canonicalResourceId: 'veh-1' };
const asset = { resourceType: 'asset' as const, canonicalResourceId: 'asset-crane' };
const week = { from: '2026-10-01', to: '2026-10-07' };
// The adapter's "today" is the company's business day; a UTC date disagrees with it for four hours
// every night (Dubai is UTC+4), which is when a test written against the UTC date would fail.
const far = (offset: number): string => businessDateInDays(offset);

describe('availability read from the owning registers', () => {
  it('reads an APPROVED leave as a dated absence, and ignores one still being decided', async () => {
    const facts = await provider({
      leaves: [
        { employeeId: 'emp-maya', status: 'approved', leaveType: 'annual', startDate: '2026-10-02', endDate: '2026-10-03' },
        { employeeId: 'emp-maya', status: 'pending', leaveType: 'sick', startDate: '2026-10-05', endDate: '2026-10-05' },
        { employeeId: 'emp-other', status: 'approved', leaveType: 'annual', startDate: '2026-10-02', endDate: '2026-10-03' },
      ],
    }).unavailability('t1', [employee], week);

    expect(facts).toEqual([
      expect.objectContaining({ resource: employee, from: '2026-10-02', to: '2026-10-03', effect: 'absent', source: 'hr' }),
    ]);
    // Pending leave is a request, not a fact: planning must not pre-empt HR's decision.
    expect(facts.some((fact) => fact.reason.includes('sick'))).toBe(false);
  });

  it('ignores a leave that does not touch the interval at all', async () => {
    const facts = await provider({
      leaves: [{ employeeId: 'emp-maya', status: 'approved', leaveType: 'annual', startDate: '2026-11-01', endDate: '2026-11-05' }],
    }).unavailability('t1', [employee], week);
    expect(facts).toEqual([]);
  });

  it('reads a scheduled service as a dated absence and a completed one as history', async () => {
    const facts = await provider({
      vehicles: [{ id: 'veh-1', status: 'active', plateNumber: 'A-12345' }],
      fleetMaintenance: [
        { vehicleId: 'veh-1', status: 'scheduled', date: '2026-10-04', description: 'annual service' },
        { vehicleId: 'veh-1', status: 'completed', date: '2026-10-05', description: 'tyres' },
      ],
    }).unavailability('t1', [vehicle], week);

    expect(facts).toEqual([
      expect.objectContaining({ from: '2026-10-04', to: '2026-10-04', effect: 'absent', source: 'fleet' }),
    ]);
  });

  it('separates a permanent exit from an undated one: retired is absent, in-maintenance is unknown', async () => {
    const retired = await provider({ vehicles: [{ id: 'veh-1', status: 'retired', plateNumber: 'A-12345' }] })
      .unavailability('t1', [vehicle], { from: far(0), to: far(7) });
    expect(retired[0]).toMatchObject({ effect: 'absent' });
    expect(retired[0].reason).toContain('retired');

    const offRoad = await provider({ vehicles: [{ id: 'veh-1', status: 'maintenance', plateNumber: 'A-12345' }] })
      .unavailability('t1', [vehicle], { from: far(0), to: far(7) });
    // Nobody said until when, so nobody can state a capacity — and UNKNOWN is never AVAILABLE.
    expect(offRoad[0]).toMatchObject({ effect: 'unknown' });
    expect(offRoad[0].reason).toContain('no stated return date');
  });

  it('does not rewrite the past: an undated statement starts today, not at the interval start', async () => {
    const facts = await provider({ vehicles: [{ id: 'veh-1', status: 'maintenance', plateNumber: 'A-12345' }] })
      .unavailability('t1', [vehicle], { from: far(-30), to: far(7) });
    expect(facts[0].from).toBe(far(0));
  });

  it('says nothing about an interval entirely in the past', async () => {
    const facts = await provider({ vehicles: [{ id: 'veh-1', status: 'maintenance', plateNumber: 'A-12345' }] })
      .unavailability('t1', [vehicle], { from: far(-30), to: far(-10) });
    expect(facts).toEqual([]);
  });

  it('reads an asset the same way, disposal included', async () => {
    const disposed = await provider({ assets: [{ id: 'asset-crane', status: 'disposed', name: 'Tower crane' }] })
      .unavailability('t1', [asset], { from: far(0), to: far(7) });
    expect(disposed[0]).toMatchObject({ effect: 'absent', source: 'assets' });

    const booked = await provider({
      assets: [{ id: 'asset-crane', status: 'active', name: 'Tower crane' }],
      assetMaintenance: [{ assetId: 'asset-crane', status: 'scheduled', date: '2026-10-06', description: 'calibration' }],
    }).unavailability('t1', [asset], week);
    expect(booked[0]).toMatchObject({ from: '2026-10-06', to: '2026-10-06', effect: 'absent' });
    expect(booked[0].reason).toContain('calibration');
  });

  it('names a breakdown in the Fleet administrator\'s own words, from the day it was declared (F-08)', async () => {
    const facts = await provider({
      vehicles: [{ id: 'veh-1', status: 'maintenance', plateNumber: 'A-12345', outOfServiceSince: far(-2), outOfServiceReason: 'gearbox failure' }],
    }).unavailability('t1', [vehicle], { from: far(0), to: far(7) });
    // Still UNKNOWN — a breakdown has no return date — but the planner reads what happened and when.
    expect(facts).toEqual([expect.objectContaining({ resource: vehicle, from: far(0), to: far(7), effect: 'unknown', source: 'fleet' })]);
    expect(facts[0].reason).toBe(`A-12345 is out of service since ${far(-2)}: gearbox failure — no stated return date`);
  });

  it('reads an asset in maintenance by the dates its open jobs state, not as out of service from today', async () => {
    // Scheduling a service moves the asset into `maintenance` the moment it is booked (AssetsService).
    // A calibration booked for next month is a statement about next month: it must not make the
    // machine UNKNOWN this week.
    const ahead = await provider({
      assets: [{ id: 'asset-crane', status: 'maintenance', name: 'Tower crane' }],
      assetMaintenance: [{ assetId: 'asset-crane', status: 'scheduled', date: far(5), description: 'calibration' }],
    }).unavailability('t1', [asset], { from: far(0), to: far(7) });
    expect(ahead).toEqual([expect.objectContaining({ from: far(5), to: far(5), effect: 'absent' })]);

    // A job dated today or earlier and still open IS the machine on the workbench, with no end stated.
    const overdue = await provider({
      assets: [{ id: 'asset-crane', status: 'maintenance', name: 'Tower crane' }],
      assetMaintenance: [{ assetId: 'asset-crane', status: 'scheduled', date: far(-3), description: 'hydraulic leak' }],
    }).unavailability('t1', [asset], { from: far(0), to: far(7) });
    expect(overdue).toEqual([expect.objectContaining({ from: far(0), to: far(7), effect: 'unknown' })]);
    expect(overdue[0].reason).toContain(`in maintenance since ${far(-3)}: hydraulic leak`);

    // In maintenance with no job behind it: nobody said why or until when.
    const unexplained = await provider({ assets: [{ id: 'asset-crane', status: 'maintenance', name: 'Tower crane' }] })
      .unavailability('t1', [asset], { from: far(0), to: far(7) });
    expect(unexplained).toEqual([expect.objectContaining({ from: far(0), to: far(7), effect: 'unknown' })]);
  });

  it('never speaks about a pool, whatever its members are doing', async () => {
    const facts = await provider({
      leaves: [{ employeeId: 'emp-maya', status: 'approved', leaveType: 'annual', startDate: '2026-10-02', endDate: '2026-10-03' }],
    }).unavailability('t1', [{ resourceType: 'pool', canonicalResourceId: 'pool-elv' }], week);
    // A crew of twelve that fields two crews does not lose a crew because one member is away;
    // deriving pool capacity from a roster is the arithmetic §22 refuses to invent.
    expect(facts).toEqual([]);
  });

  it('asks no register it was not asked about', async () => {
    const hr = { listLeaves: vi.fn(async () => []) };
    const fleet = { listVehicles: vi.fn(async () => []), listMaintenance: vi.fn(async () => []) };
    const assets = { listAssets: vi.fn(async () => []), listMaintenance: vi.fn(async () => []) };
    const only = new ResourceAvailabilityFromRegisters(hr as never, fleet as never, assets as never);

    await only.unavailability('t1', [employee], week);
    expect(hr.listLeaves).toHaveBeenCalledTimes(1);
    expect(fleet.listVehicles).not.toHaveBeenCalled();
    expect(assets.listAssets).not.toHaveBeenCalled();

    expect(await only.unavailability('t1', [], week)).toEqual([]);
  });
});
