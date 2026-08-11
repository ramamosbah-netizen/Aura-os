import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { ElvDeviceService } from './elv-device.service';
import { InMemoryElvDeviceStore } from './in-memory-elv-device-store';
import { PostgresElvDeviceStore } from './postgres-elv-device-store';
import { ELV_DEVICE_STORE } from './store.interface';

/**
 * ELV business module — the device register. Postgres when a pool is configured, in-memory
 * otherwise: the same DI-swap discipline as every other module.
 */
@Module({
  imports: [CoreModule],
  providers: [
    ElvDeviceService,
    {
      provide: ELV_DEVICE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresElvDeviceStore(pool) : new InMemoryElvDeviceStore(),
    },
  ],
  exports: [ElvDeviceService],
})
export class ElvModule {}
