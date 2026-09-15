import { Injectable } from '@nestjs/common';
import { HrService } from '@aura/hr';
import { FleetService } from '@aura/fleet';
import { AssetsService } from '@aura/assets';
import type {
  ResourceAvailabilityFact,
  ResourceAvailabilityProvider,
  ResourceRef,
} from '@aura/projects';

/**
 * The application-layer binding of §22's availability port to the registers that own the answer.
 *
 * Projects may not import HR, Fleet or Assets (ADR-0004), so the rule stays a pure function of the
 * facts and this is where the facts are fetched — the same shape as the resource catalogue bridge
 * beside it.
 *
 * WHAT COUNTS AS A STATEMENT, and why each is the effect it is:
 *
 *   HR      an APPROVED leave           → `absent` for its dated range. Pending leave is a request,
 *                                         not a fact, and planning must not pre-empt HR's decision.
 *   Fleet   a SCHEDULED maintenance     → `absent` on that date. A completed one is history.
 *           a `retired` vehicle         → `absent` from today on. It has left service for good.
 *           a `maintenance` status      → `unknown` from today on, because nobody said until when.
 *   Assets  a SCHEDULED maintenance     → `absent` on that date.
 *           a `disposed` asset          → `absent` from today on.
 *           a `maintenance`/`inactive`  → `unknown` from today on, same reasoning as Fleet.
 *
 * POOLS ARE DELIBERATELY ABSENT from all of this. A pool's capacity is declared, and deriving it
 * from its roster's leave would be exactly the arithmetic migration 0319 refuses to invent:
 * twelve members who field two crews do not lose a crew because one of them is away. A member's
 * leave is real and belongs on the member's own bookings, which is where it appears.
 *
 * Nothing here vetoes anything. HR still approves the leave, Fleet still services the van; what
 * changes is what the plan says about itself (DG-22.8).
 */
@Injectable()
export class ResourceAvailabilityFromRegisters implements ResourceAvailabilityProvider {
  constructor(
    private readonly hr: HrService,
    private readonly fleet: FleetService,
    private readonly assets: AssetsService,
  ) {}

  async unavailability(
    tenantId: string,
    refs: readonly ResourceRef[],
    interval: { from: string; to: string },
  ): Promise<ResourceAvailabilityFact[]> {
    const employees = new Set(refs.filter((r) => r.resourceType === 'employee').map((r) => r.canonicalResourceId));
    const vehicles = new Set(refs.filter((r) => r.resourceType === 'vehicle').map((r) => r.canonicalResourceId));
    const assets = new Set(refs.filter((r) => r.resourceType === 'asset').map((r) => r.canonicalResourceId));
    if (employees.size === 0 && vehicles.size === 0 && assets.size === 0) return [];

    // Today, not the interval's start: an undated "out of service" is a statement about now and
    // everything after it, and saying it about days already past would rewrite history.
    const today = new Date().toISOString().slice(0, 10);
    const openEnd = { from: today > interval.from ? today : interval.from, to: interval.to };
    const overlaps = (from: string, to: string): boolean => from <= interval.to && to >= interval.from;

    const [leaves, fleetVehicles, fleetMaintenance, assetRows, assetMaintenance] = await Promise.all([
      employees.size > 0 ? this.hr.listLeaves(tenantId) : Promise.resolve([]),
      vehicles.size > 0 ? this.fleet.listVehicles(tenantId) : Promise.resolve([]),
      vehicles.size > 0 ? this.fleet.listMaintenance(tenantId) : Promise.resolve([]),
      assets.size > 0 ? this.assets.listAssets(tenantId) : Promise.resolve([]),
      assets.size > 0 ? this.assets.listMaintenance(tenantId) : Promise.resolve([]),
    ]);

    const facts: ResourceAvailabilityFact[] = [];

    for (const leave of leaves) {
      if (!employees.has(leave.employeeId) || leave.status !== 'approved') continue;
      if (!overlaps(leave.startDate, leave.endDate)) continue;
      facts.push({
        resource: { resourceType: 'employee', canonicalResourceId: leave.employeeId },
        from: leave.startDate, to: leave.endDate, effect: 'absent',
        reason: `approved ${leave.leaveType} leave`, source: 'hr',
      });
    }

    for (const vehicle of fleetVehicles) {
      if (!vehicles.has(vehicle.id)) continue;
      if (vehicle.status === 'retired' && openEnd.from <= openEnd.to) {
        facts.push({
          resource: { resourceType: 'vehicle', canonicalResourceId: vehicle.id },
          from: openEnd.from, to: openEnd.to, effect: 'absent',
          reason: `${vehicle.plateNumber} is retired from service`, source: 'fleet',
        });
      } else if (vehicle.status === 'maintenance' && openEnd.from <= openEnd.to) {
        facts.push({
          resource: { resourceType: 'vehicle', canonicalResourceId: vehicle.id },
          from: openEnd.from, to: openEnd.to, effect: 'unknown',
          reason: `${vehicle.plateNumber} is off the road for maintenance with no stated return date`,
          source: 'fleet',
        });
      }
    }

    for (const record of fleetMaintenance) {
      if (!vehicles.has(record.vehicleId) || record.status !== 'scheduled') continue;
      if (!overlaps(record.date, record.date)) continue;
      facts.push({
        resource: { resourceType: 'vehicle', canonicalResourceId: record.vehicleId },
        from: record.date, to: record.date, effect: 'absent',
        reason: `scheduled maintenance: ${record.description}`, source: 'fleet',
      });
    }

    for (const asset of assetRows) {
      if (!assets.has(asset.id)) continue;
      if (asset.status === 'disposed' && openEnd.from <= openEnd.to) {
        facts.push({
          resource: { resourceType: 'asset', canonicalResourceId: asset.id },
          from: openEnd.from, to: openEnd.to, effect: 'absent',
          reason: `${asset.name} has been disposed of`, source: 'assets',
        });
      } else if ((asset.status === 'maintenance' || asset.status === 'inactive') && openEnd.from <= openEnd.to) {
        facts.push({
          resource: { resourceType: 'asset', canonicalResourceId: asset.id },
          from: openEnd.from, to: openEnd.to, effect: 'unknown',
          reason: `${asset.name} is ${asset.status} with no stated return date`, source: 'assets',
        });
      }
    }

    for (const record of assetMaintenance) {
      if (!assets.has(record.assetId) || record.status !== 'scheduled') continue;
      if (!overlaps(record.date, record.date)) continue;
      facts.push({
        resource: { resourceType: 'asset', canonicalResourceId: record.assetId },
        from: record.date, to: record.date, effect: 'absent',
        reason: `scheduled maintenance: ${record.description}`, source: 'assets',
      });
    }

    return facts;
  }
}
