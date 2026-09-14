import { BadRequestException, Injectable } from '@nestjs/common';
import { HrService } from '@aura/hr';
import { FleetService } from '@aura/fleet';
import { AssetsService } from '@aura/assets';
import type { NewScheduleTask, ResourceType } from '@aura/projects';

export interface ScheduleResourceCatalogItem {
  resourceType: Exclude<ResourceType, 'pool'>;
  canonicalResourceId: string;
  label: string;
  secondary: string | null;
  status: string;
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
  ) {}

  async list(tenantId: string): Promise<ScheduleResourceCatalogItem[]> {
    const [employees, vehicles, assets] = await Promise.all([
      this.hr.listEmployees(tenantId),
      this.fleet.listVehicles(tenantId),
      this.assets.listAssets(tenantId),
    ]);
    return [
      ...employees.filter((employee) => employee.status === 'active').map((employee) => ({
        resourceType: 'employee' as const,
        canonicalResourceId: employee.id,
        label: `${employee.firstName} ${employee.lastName}`.trim(),
        secondary: [employee.role, employee.department].filter(Boolean).join(' · ') || null,
        status: employee.status,
      })),
      ...vehicles.filter((vehicle) => vehicle.status !== 'retired').map((vehicle) => ({
        resourceType: 'vehicle' as const,
        canonicalResourceId: vehicle.id,
        label: `${vehicle.make} ${vehicle.model}`.trim(),
        secondary: vehicle.plateNumber,
        status: vehicle.status,
      })),
      ...assets.filter((asset) => asset.status !== 'disposed').map((asset) => ({
        resourceType: 'asset' as const,
        canonicalResourceId: asset.id,
        label: asset.name,
        secondary: [asset.serialNumber, asset.category].filter(Boolean).join(' · ') || null,
        status: asset.status,
      })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }

  async assertCanonicalReferences(tenantId: string, tasks: readonly NewScheduleTask[]): Promise<void> {
    const requested = tasks.flatMap((task) => task.requirements ?? []);
    if (requested.length === 0) return;
    const catalog = await this.list(tenantId);
    const known = new Set(catalog.map((item) => `${item.resourceType}:${item.canonicalResourceId}`));
    for (const requirement of requested) {
      const ref = requirement.resource;
      if (ref?.resourceType === 'pool') {
        throw new BadRequestException('resource pools are not available until the governed pool register is connected');
      }
      const key = ref ? `${ref.resourceType}:${ref.canonicalResourceId}` : '';
      if (!known.has(key)) {
        throw new BadRequestException(`resource requirement ${key || '(missing)'} is not an available canonical tenant resource`);
      }
    }
  }
}
