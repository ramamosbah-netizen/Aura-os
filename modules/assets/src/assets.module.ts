import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';

import {
  ASSET_STORE,
  ASSET_MAINTENANCE_STORE,
  ASSET_INSPECTION_STORE,
  AssetsService,
} from './assets.service';

import {
  InMemoryAssetStore,
  InMemoryAssetMaintenanceStore,
  InMemoryAssetInspectionStore,
} from './in-memory-assets-store';

import {
  PostgresAssetStore,
  PostgresAssetMaintenanceStore,
  PostgresAssetInspectionStore,
} from './postgres-assets-store';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: ASSET_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAssetStore(pool) : new InMemoryAssetStore(),
    },
    {
      provide: ASSET_MAINTENANCE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAssetMaintenanceStore(pool) : new InMemoryAssetMaintenanceStore(),
    },
    {
      provide: ASSET_INSPECTION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresAssetInspectionStore(pool) : new InMemoryAssetInspectionStore(),
    },
    AssetsService,
  ],
  exports: [AssetsService],
})
export class AssetsModule {}
