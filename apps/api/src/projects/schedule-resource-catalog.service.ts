import { BadRequestException, Injectable } from '@nestjs/common';
import { HrService } from '@aura/hr';
import { FleetService } from '@aura/fleet';
import { AssetsService } from '@aura/assets';
import { ResourcePlanningService, type NewScheduleTask, type ResourceRef, type ResourceType, type ResourceUnit } from '@aura/projects';

export interface ScheduleResourceCatalogItem {
  resourceType: ResourceType;
  canonicalResourceId: string;
  label: string;
  secondary: string | null;
  status: string;
  unit: ResourceUnit | null;
}

/**
 * Application-layer bridge from Planning references to the HR, Fleet and Assets authorities.
 * Projects keeps typed references only; this bridge prevents a caller from inventing an id and
 * gives the planner safe display fields without exposing a complete HR or asset record.
 */
@Injectable()
export class ScheduleResourceCatalogService {
  constructor(
    private readonly hr: HrService,
    private readonly fleet: FleetService,
    private readonly assets: AssetsService,
    private readonly resourcePlanning: ResourcePlanningService,
  ) {}

  async list(tenantId: string): Promise<ScheduleResourceCatalogItem[]> {
    const [employees, vehicles, assets, pools] = await Promise.all([
      this.hr.listEmployees(tenantId),
      this.fleet.listVehicles(tenantId),
      this.assets.listAssets(tenantId),
      this.resourcePlanning.listPools(tenantId),
    ]);
    return [
      ...employees.filter((employee) => employee.status === 'active').map((employee) => ({
        resourceType: 'employee' as const,
        canonicalResourceId: employee.id,
        label: `${employee.firstName} ${employee.lastName}`.trim(),
        secondary: [employee.role, employee.department].filter(Boolean).join(' · ') || null,
        status: employee.status,
        unit: null,
      })),
      ...vehicles.filter((vehicle) => vehicle.status !== 'retired').map((vehicle) => ({
        resourceType: 'vehicle' as const,
        canonicalResourceId: vehicle.id,
        label: `${vehicle.make} ${vehicle.model}`.trim(),
        secondary: vehicle.plateNumber,
        status: vehicle.status,
        unit: null,
      })),
      ...assets.filter((asset) => asset.status !== 'disposed').map((asset) => ({
        resourceType: 'asset' as const,
        canonicalResourceId: asset.id,
        label: asset.name,
        secondary: [asset.serialNumber, asset.category].filter(Boolean).join(' · ') || null,
        status: asset.status,
        unit: null,
      })),
      ...pools.map((pool) => ({
        resourceType: 'pool' as const,
        canonicalResourceId: pool.id,
        label: pool.name,
        secondary: `${pool.sourceType} · ${pool.unit}`,
        status: 'active',
        unit: pool.unit,
      })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }

  async assertCanonicalReferences(tenantId: string, tasks: readonly NewScheduleTask[]): Promise<void> {
    const requested = tasks.flatMap((task) => task.requirements ?? []);
    if (requested.length === 0) return;
    const catalog = await this.list(tenantId);
    const known = new Map(catalog.map((item) => [`${item.resourceType}:${item.canonicalResourceId}`, item]));
    for (const requirement of requested) {
      const ref = requirement.resource;
      const key = ref ? `${ref.resourceType}:${ref.canonicalResourceId}` : '';
      const canonical = known.get(key);
      if (!canonical) {
        throw new BadRequestException(`resource requirement ${key || '(missing)'} is not an available canonical tenant resource`);
      }
      if (canonical.unit && canonical.unit !== requirement.unit) {
        throw new BadRequestException(`${canonical.label} is measured in ${canonical.unit}; the requirement cannot reinterpret it as ${requirement.unit}`);
      }
    }
  }

  async assertCanonicalResource(tenantId: string, resource: ResourceRef): Promise<void> {
    const key = `${resource.resourceType}:${resource.canonicalResourceId}`;
    if (!(await this.list(tenantId)).some((item) => `${item.resourceType}:${item.canonicalResourceId}` === key)) {
      throw new BadRequestException(`resource ${key} is not an available canonical tenant resource`);
    }
  }
}
