import { describe, expect, it, vi } from 'vitest';
import { ScheduleResourceCatalogService } from './schedule-resource-catalog.service';

const employee = { id: 'employee-1', firstName: 'Maya', lastName: 'Khan', role: 'Site Engineer', department: 'Projects', status: 'active' };
const vehicle = { id: 'vehicle-1', make: 'Toyota', model: 'Hilux', plateNumber: 'D 12345', status: 'maintenance' };
const asset = { id: 'asset-1', name: 'Fluke tester', serialNumber: 'FL-01', category: 'Test equipment', status: 'active' };
const pool = { id: 'pool-1', name: 'ELV installation crew', unit: 'crews', sourceType: 'internal' };

function fixture() {
  const hr = { listEmployees: vi.fn(async (tenantId: string) => tenantId === 'tenant-1' ? [employee] : []) };
  const fleet = { listVehicles: vi.fn(async (tenantId: string) => tenantId === 'tenant-1' ? [vehicle] : []) };
  const assets = { listAssets: vi.fn(async (tenantId: string) => tenantId === 'tenant-1' ? [asset] : []) };
  const resourcePlanning = { listPools: vi.fn(async (tenantId: string) => tenantId === 'tenant-1' ? [pool] : []) };
  return {
    service: new ScheduleResourceCatalogService(hr as never, fleet as never, assets as never, resourcePlanning as never),
    hr,
  };
}

describe('ScheduleResourceCatalogService', () => {
  it('returns only safe display fields from the canonical owning registers', async () => {
    const { service } = fixture();
    const result = await service.list('tenant-1');
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'employee', canonicalResourceId: employee.id, label: 'Maya Khan' }),
      expect.objectContaining({ resourceType: 'vehicle', canonicalResourceId: vehicle.id, secondary: 'D 12345', status: 'maintenance' }),
      expect.objectContaining({ resourceType: 'asset', canonicalResourceId: asset.id, label: 'Fluke tester' }),
      expect.objectContaining({ resourceType: 'pool', canonicalResourceId: pool.id, label: 'ELV installation crew' }),
    ]));
    expect(result[0]).not.toHaveProperty('email');
  });

  it('accepts persisted tenant resources and governed pools, and rejects invented or cross-tenant ids', async () => {
    const { service } = fixture();
    const task = (resourceType: 'employee' | 'pool', canonicalResourceId: string, unit: 'persons' | 'crews' = 'persons') => [{
      name: 'Install', plannedStart: '2026-09-20', plannedEnd: '2026-09-21',
      requirements: [{ resource: { resourceType, canonicalResourceId }, quantity: 1, unit }],
    }];
    await expect(service.assertCanonicalReferences('tenant-1', task('employee', employee.id))).resolves.toBeUndefined();
    await expect(service.assertCanonicalReferences('tenant-1', task('pool', pool.id, 'crews'))).resolves.toBeUndefined();
    await expect(service.assertCanonicalReferences('tenant-1', task('pool', pool.id))).rejects.toThrow('measured in crews');
    await expect(service.assertCanonicalReferences('tenant-1', task('employee', 'invented'))).rejects.toThrow('not an available canonical tenant resource');
    await expect(service.assertCanonicalReferences('tenant-2', task('employee', employee.id))).rejects.toThrow('not an available canonical tenant resource');
    await expect(service.assertCanonicalReferences('tenant-1', task('pool', 'invented'))).rejects.toThrow('not an available canonical tenant resource');
  });
});
