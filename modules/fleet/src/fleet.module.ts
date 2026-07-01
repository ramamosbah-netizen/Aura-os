import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  VEHICLE_STORE,
  FUEL_LOG_STORE,
  MAINTENANCE_STORE,
  TRAFFIC_FINE_STORE,
  SALIK_CHARGE_STORE,
  TELEMETRY_STORE,
  FleetService,
} from './fleet.service';

import {
  InMemoryVehicleStore,
  InMemoryFuelLogStore,
  InMemoryMaintenanceStore,
  InMemoryTrafficFineStore,
  InMemorySalikChargeStore,
  InMemoryTelemetryStore,
} from './in-memory-fleet-store';

import {
  PostgresVehicleStore,
  PostgresFuelLogStore,
  PostgresMaintenanceStore,
  PostgresTrafficFineStore,
  PostgresSalikChargeStore,
  PostgresTelemetryStore,
} from './postgres-fleet-store';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: VEHICLE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresVehicleStore(pool) : new InMemoryVehicleStore(),
    },
    {
      provide: FUEL_LOG_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresFuelLogStore(pool) : new InMemoryFuelLogStore(),
    },
    {
      provide: MAINTENANCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresMaintenanceStore(pool) : new InMemoryMaintenanceStore(),
    },
    {
      provide: TRAFFIC_FINE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTrafficFineStore(pool) : new InMemoryTrafficFineStore(),
    },
    {
      provide: SALIK_CHARGE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSalikChargeStore(pool) : new InMemorySalikChargeStore(),
    },
    {
      provide: TELEMETRY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresTelemetryStore(pool) : new InMemoryTelemetryStore(),
    },
    FleetService,
  ],
  exports: [FleetService],
})
export class FleetModule {}
