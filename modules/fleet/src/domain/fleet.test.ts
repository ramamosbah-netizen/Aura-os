import { describe, expect, it } from 'vitest';
import { makeVehicle } from './vehicle';
import { makeFuelLog } from './fuel-log';
import { makeMaintenanceRecord } from './maintenance';
import {
  InMemoryVehicleStore,
  InMemoryFuelLogStore,
  InMemoryMaintenanceStore,
  InMemoryTrafficFineStore,
  InMemorySalikChargeStore,
  InMemoryTelemetryStore,
} from '../in-memory-fleet-store';
import { FleetService } from '../fleet.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';
import { businessDate } from '@aura/shared';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  appendWithClient: async () => [],
  append: async () => [],
} as unknown as EventStore;

const mockTx: TxRunner = {
  run: (fn) => fn(null),
};

describe('Fleet Bounded Context', () => {
  describe('Vehicles', () => {
    it('creates a vehicle record correctly', () => {
      const v = makeVehicle({
        tenantId: 't1',
        make: 'Toyota',
        model: 'Hilux',
        year: 2024,
        plateNumber: 'dxb-12345',
        registrationExpiry: '2026-12-31',
        driverEmployeeId: 'emp-1',
      });
      expect(v.make).toBe('Toyota');
      expect(v.plateNumber).toBe('DXB-12345');
      expect(v.status).toBe('active');
    });

    it('manages vehicle lifecycle via service', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const fuelLogStore = new InMemoryFuelLogStore();
      const maintenanceStore = new InMemoryMaintenanceStore();

      const service = new FleetService(vehicleStore, fuelLogStore, maintenanceStore, new InMemoryTrafficFineStore(), new InMemorySalikChargeStore(), new InMemoryTelemetryStore(), mockEvents, mockTx, mockAccess);

      const vehicle = await service.createVehicle(null, {
        tenantId: 't1',
        make: 'Nissan',
        model: 'Patrol',
        year: 2025,
        plateNumber: 'ad-54321',
      });

      expect(vehicle.status).toBe('active');

      const listed = await service.listVehicles('t1');
      expect(listed.length).toBe(1);
      expect(listed[0].id).toBe(vehicle.id);

      const deleted = await service.deleteVehicle('t1', null, vehicle.id);
      expect(deleted).toBe(true);

      const afterDelete = await service.listVehicles('t1');
      expect(afterDelete.length).toBe(0);
    });

    it('paginates vehicle list correctly', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const fuelLogStore = new InMemoryFuelLogStore();
      const maintenanceStore = new InMemoryMaintenanceStore();

      const service = new FleetService(vehicleStore, fuelLogStore, maintenanceStore, new InMemoryTrafficFineStore(), new InMemorySalikChargeStore(), new InMemoryTelemetryStore(), mockEvents, mockTx, mockAccess);

      await service.createVehicle(null, {
        tenantId: 't1',
        make: 'Toyota',
        model: 'Hilux',
        year: 2024,
        plateNumber: 'dxb-1',
      });
      await service.createVehicle(null, {
        tenantId: 't1',
        make: 'Toyota',
        model: 'Camry',
        year: 2023,
        plateNumber: 'dxb-2',
      });
      await service.createVehicle(null, {
        tenantId: 't1',
        make: 'Nissan',
        model: 'Patrol',
        year: 2025,
        plateNumber: 'dxb-3',
      });

      const page1 = await service.listVehiclesPaged({ tenantId: 't1' }, { limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);

      const pageMake = await service.listVehiclesPaged({ tenantId: 't1', make: 'Toyota' }, { limit: 10, offset: 0 });
      expect(pageMake.items.length).toBe(2);
      expect(pageMake.items.every(item => item.make === 'Toyota')).toBe(true);
    });
  });

  describe('Fuel Logging', () => {
    it('records fuel logs via service', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const fuelLogStore = new InMemoryFuelLogStore();
      const maintenanceStore = new InMemoryMaintenanceStore();

      const service = new FleetService(vehicleStore, fuelLogStore, maintenanceStore, new InMemoryTrafficFineStore(), new InMemorySalikChargeStore(), new InMemoryTelemetryStore(), mockEvents, mockTx, mockAccess);

      const log = await service.logFuel(null, {
        tenantId: 't1',
        vehicleId: 'v-123',
        date: '2026-06-25',
        liters: 60.5,
        cost: 200,
        odometer: 120500,
      });

      expect(log.liters).toBe(60.5);
      expect(log.cost).toBe(200);

      const list = await service.listFuelLogs('t1');
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(log.id);
    });

    it('paginates fuel logs and filters by vehicle', async () => {
      const service = new FleetService(
        new InMemoryVehicleStore(), new InMemoryFuelLogStore(), new InMemoryMaintenanceStore(),
        new InMemoryTrafficFineStore(), new InMemorySalikChargeStore(), new InMemoryTelemetryStore(),
        mockEvents, mockTx, mockAccess,
      );

      for (let i = 0; i < 3; i++) {
        await service.logFuel(null, { tenantId: 't1', vehicleId: 'v-a', date: '2026-06-25', liters: 10, cost: 40, odometer: 1000 + i });
      }
      await service.logFuel(null, { tenantId: 't1', vehicleId: 'v-b', date: '2026-06-25', liters: 10, cost: 40, odometer: 5000 });

      const page1 = await service.listFuelLogsPaged({ tenantId: 't1' }, { limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(4);
      expect(page1.hasMore).toBe(true);

      const byVehicle = await service.listFuelLogsPaged({ tenantId: 't1', vehicleId: 'v-a' }, { limit: 10, offset: 0 });
      expect(byVehicle.total).toBe(3);
      expect(byVehicle.items.every((l) => l.vehicleId === 'v-a')).toBe(true);
    });
  });

  describe('Maintenance Records', () => {
    it('manages scheduling and completing maintenance', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const fuelLogStore = new InMemoryFuelLogStore();
      const maintenanceStore = new InMemoryMaintenanceStore();

      const service = new FleetService(vehicleStore, fuelLogStore, maintenanceStore, new InMemoryTrafficFineStore(), new InMemorySalikChargeStore(), new InMemoryTelemetryStore(), mockEvents, mockTx, mockAccess);

      const record = await service.scheduleMaintenance(null, {
        tenantId: 't1',
        vehicleId: 'v-123',
        date: '2026-07-05',
        description: 'Brake pad replacement and oil change',
        cost: 500,
      });

      expect(record.status).toBe('scheduled');
      expect(record.cost).toBe(500);

      const completed = await service.completeMaintenance('t1', null, record.id, 650);
      expect(completed.status).toBe('completed');
      expect(completed.cost).toBe(650);
    });

    it('paginates maintenance records and filters by status', async () => {
      const service = new FleetService(
        new InMemoryVehicleStore(), new InMemoryFuelLogStore(), new InMemoryMaintenanceStore(),
        new InMemoryTrafficFineStore(), new InMemorySalikChargeStore(), new InMemoryTelemetryStore(),
        mockEvents, mockTx, mockAccess,
      );

      const r1 = await service.scheduleMaintenance(null, { tenantId: 't1', vehicleId: 'v-1', date: '2026-07-05', description: 'Oil change service' });
      await service.scheduleMaintenance(null, { tenantId: 't1', vehicleId: 'v-2', date: '2026-07-06', description: 'Tyre rotation service' });
      await service.completeMaintenance('t1', null, r1.id, 300);

      const all = await service.listMaintenancePaged({ tenantId: 't1' }, { limit: 10, offset: 0 });
      expect(all.total).toBe(2);

      const scheduled = await service.listMaintenancePaged({ tenantId: 't1', status: 'scheduled' }, { limit: 10, offset: 0 });
      expect(scheduled.total).toBe(1);
      expect(scheduled.items[0].status).toBe('scheduled');
    });
  });

  describe('GPS Telematics & Expiry Triggers', () => {
    it('records telematics data and updates vehicle location state', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const telemetryStore = new InMemoryTelemetryStore();
      const service = new FleetService(
        vehicleStore,
        new InMemoryFuelLogStore(),
        new InMemoryMaintenanceStore(),
        new InMemoryTrafficFineStore(),
        new InMemorySalikChargeStore(),
        telemetryStore,
        mockEvents,
        mockTx,
        mockAccess,
      );

      const vehicle = await service.createVehicle(null, {
        tenantId: 't1',
        make: 'Toyota',
        model: 'Hilux',
        year: 2024,
        plateNumber: 'dxb-100',
      });

      const tel = await service.recordTelemetry('t1', {
        vehicleId: vehicle.id,
        latitude: 25.2048,
        longitude: 55.2708,
        speed: 80,
        odometer: 15000,
        recordedAt: '2026-07-01T12:00:00Z',
      });

      expect(tel.speed).toBe(80);

      const updatedVehicle = await service.getVehicle('t1', vehicle.id);
      expect(updatedVehicle?.lastLatitude).toBe(25.2048);
      expect(updatedVehicle?.lastLongitude).toBe(55.2708);
      expect(updatedVehicle?.lastSpeed).toBe(80);
      expect(updatedVehicle?.lastOdometer).toBe(15000);
      expect(updatedVehicle?.lastTelemetryAt).toBe('2026-07-01T12:00:00Z');

      const logs = await service.getTelemetryForVehicle('t1', vehicle.id);
      expect(logs.length).toBe(1);
    });

    it('triggers alerts for expiring Mulkiya registration within 30 days', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const service = new FleetService(
        vehicleStore,
        new InMemoryFuelLogStore(),
        new InMemoryMaintenanceStore(),
        new InMemoryTrafficFineStore(),
        new InMemorySalikChargeStore(),
        new InMemoryTelemetryStore(),
        mockEvents,
        mockTx,
        mockAccess,
      );

      // expires in 15 days
      const d = new Date();
      d.setDate(d.getDate() + 15);
      const expiryStr = d.toISOString().split('T')[0];

      await service.createVehicle(null, {
        tenantId: 't1',
        make: 'Toyota',
        model: 'Hilux',
        year: 2024,
        plateNumber: 'dxb-expires',
        registrationExpiry: expiryStr,
      });

      const triggered = await service.checkRegistrationsAndTriggerRenewals('t1');
      expect(triggered.length).toBe(1);
      expect(triggered[0].plateNumber).toBe('DXB-EXPIRES');
      expect(triggered[0].daysRemaining).toBeLessThanOrEqual(15);
    });
  });

  // F-08: a breakdown is said once, in Fleet, and the availability bridge carries it to every
  // commitment made against the vehicle. These are the rules of saying it.
  describe('Out of service', () => {
    const build = () => {
      const appended: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const asserted: string[] = [];
      const events = {
        appendWithClient: async (_h: unknown, list: Array<{ type: string; payload: Record<string, unknown> }>) => { appended.push(...list); return list; },
        append: async () => [],
      } as unknown as EventStore;
      const access = { assert: (_actor: string, req: { permission: string }) => { asserted.push(req.permission); } } as unknown as AccessService;
      const service = new FleetService(
        new InMemoryVehicleStore(), new InMemoryFuelLogStore(), new InMemoryMaintenanceStore(),
        new InMemoryTrafficFineStore(), new InMemorySalikChargeStore(), new InMemoryTelemetryStore(),
        events, mockTx, access,
      );
      return { service, appended, asserted };
    };
    const van = (service: FleetService) => service.createVehicle(null, { tenantId: 't1', make: 'Toyota', model: 'Hiace', year: 2022, plateNumber: 'dxb-77' });

    it('takes an active vehicle out of service today, with the reason as stated, and says so', async () => {
      const { service, appended, asserted } = build();
      const v = await van(service);
      const out = await service.takeOutOfService('t1', 'u-fleet', v.id, '  gearbox failure  ');
      expect(out).toMatchObject({ status: 'maintenance', outOfServiceSince: businessDate(), outOfServiceReason: 'gearbox failure' });
      expect((await service.getVehicle('t1', v.id))?.status).toBe('maintenance');
      expect(asserted).toEqual(['fleet.vehicle.update']);
      expect(appended.at(-1)).toMatchObject({ type: 'fleet.vehicle.out_of_service', payload: { plateNumber: 'DXB-77', since: businessDate(), reason: 'gearbox failure' } });
    });

    it('refuses without a reason, twice in a row, and for a retired vehicle', async () => {
      const { service } = build();
      const v = await van(service);
      await expect(service.takeOutOfService('t1', null, v.id, '   ')).rejects.toThrow(/requires a reason/);
      await service.takeOutOfService('t1', null, v.id, 'flat battery');
      await expect(service.takeOutOfService('t1', null, v.id, 'again')).rejects.toThrow(/only an active vehicle can be taken out of service/);
      const retired = await service.createVehicle(null, { tenantId: 't1', make: 'Nissan', model: 'Urvan', year: 2012, plateNumber: 'old-1', status: 'retired' });
      await expect(service.takeOutOfService('t1', null, retired.id, 'engine')).rejects.toThrow(/only an active vehicle can be taken out of service — OLD-1 is retired/);
      await expect(service.takeOutOfService('t1', null, 'missing', 'engine')).rejects.toThrow(/not found/);
      await expect(service.takeOutOfService('t2', null, v.id, 'engine')).rejects.toThrow(/not found/);
    });

    it('returns it to service and clears what was said, keeping it in the event', async () => {
      const { service, appended } = build();
      const v = await van(service);
      await expect(service.returnToService('t1', null, v.id)).rejects.toThrow(/only a vehicle that is out of service can return to service/);
      await service.takeOutOfService('t1', null, v.id, 'gearbox failure');
      const back = await service.returnToService('t1', 'u-fleet', v.id);
      expect(back).toMatchObject({ status: 'active', outOfServiceSince: null, outOfServiceReason: null });
      expect(appended.at(-1)).toMatchObject({ type: 'fleet.vehicle.returned_to_service', payload: { outSince: businessDate(), reason: 'gearbox failure' } });
    });
  });
});
