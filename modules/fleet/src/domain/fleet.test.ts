import { describe, expect, it } from 'vitest';
import { makeVehicle } from './vehicle';
import { makeFuelLog } from './fuel-log';
import { makeMaintenanceRecord } from './maintenance';
import {
  InMemoryVehicleStore,
  InMemoryFuelLogStore,
  InMemoryMaintenanceStore,
} from '../in-memory-fleet-store';
import { FleetService } from '../fleet.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  appendWithClient: async () => [],
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

      const service = new FleetService(vehicleStore, fuelLogStore, maintenanceStore, mockEvents, mockTx, mockAccess);

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
  });

  describe('Fuel Logging', () => {
    it('records fuel logs via service', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const fuelLogStore = new InMemoryFuelLogStore();
      const maintenanceStore = new InMemoryMaintenanceStore();

      const service = new FleetService(vehicleStore, fuelLogStore, maintenanceStore, mockEvents, mockTx, mockAccess);

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
  });

  describe('Maintenance Records', () => {
    it('manages scheduling and completing maintenance', async () => {
      const vehicleStore = new InMemoryVehicleStore();
      const fuelLogStore = new InMemoryFuelLogStore();
      const maintenanceStore = new InMemoryMaintenanceStore();

      const service = new FleetService(vehicleStore, fuelLogStore, maintenanceStore, mockEvents, mockTx, mockAccess);

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
  });
});
