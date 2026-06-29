import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Asset } from './domain/asset';
import type { AssetMaintenance } from './domain/asset-maintenance';
import type { AssetInspection } from './domain/asset-inspection';
import type { AssetStore, AssetMaintenanceStore, AssetInspectionStore } from './store.interface';

/**
 * Format a `date` column as YYYY-MM-DD using LOCAL parts. node-pg parses `date` to a Date at
 * local midnight; `toISOString()` would shift it a day in a UTC+ timezone (the date-drift bug).
 */
function dateOnly(v: Date | string | null): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

export class PostgresAssetStore implements AssetStore {
  constructor(private readonly pool: Pool) {}

  async save(asset: Asset, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_assets (
        id, tenant_id, company_id, name, serial_number, category, purchase_date, purchase_cost, status, warranty_expiry, next_calibration_date, next_inspection_date, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (id) do update set
        name = excluded.name,
        serial_number = excluded.serial_number,
        category = excluded.category,
        purchase_date = excluded.purchase_date,
        purchase_cost = excluded.purchase_cost,
        status = excluded.status,
        warranty_expiry = excluded.warranty_expiry,
        next_calibration_date = excluded.next_calibration_date,
        next_inspection_date = excluded.next_inspection_date,
        updated_at = excluded.updated_at`,
      [
        asset.id,
        asset.tenantId,
        asset.companyId,
        asset.name,
        asset.serialNumber,
        asset.category,
        asset.purchaseDate,
        asset.purchaseCost,
        asset.status,
        asset.warrantyExpiry,
        asset.nextCalibrationDate,
        asset.nextInspectionDate,
        asset.createdAt,
        asset.updatedAt,
      ],
    );
  }

  async findById(tenantId: string, id: string): Promise<Asset | null> {
    const res = await this.pool.query(
      `select * from public.aura_assets where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapAsset(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<Asset[]> {
    const res = await this.pool.query(
      `select * from public.aura_assets where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapAsset);
  }

  async delete(tenantId: string, id: string, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `delete from public.aura_assets where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
  }

  private mapAsset(row: any): Asset {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      name: row.name,
      serialNumber: row.serial_number,
      category: row.category,
      purchaseDate: dateOnly(row.purchase_date) ?? '',
      purchaseCost: Number(row.purchase_cost),
      status: row.status,
      warrantyExpiry: dateOnly(row.warranty_expiry),
      nextCalibrationDate: dateOnly(row.next_calibration_date),
      nextInspectionDate: dateOnly(row.next_inspection_date),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresAssetMaintenanceStore implements AssetMaintenanceStore {
  constructor(private readonly pool: Pool) {}

  async save(m: AssetMaintenance, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_asset_maintenance (
        id, tenant_id, company_id, asset_id, date, description, cost, status, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (id) do update set
        cost = excluded.cost,
        status = excluded.status,
        updated_at = excluded.updated_at`,
      [
        m.id,
        m.tenantId,
        m.companyId,
        m.assetId,
        m.date,
        m.description,
        m.cost,
        m.status,
        m.createdAt,
        m.updatedAt,
      ],
    );
  }

  async findById(tenantId: string, id: string): Promise<AssetMaintenance | null> {
    const res = await this.pool.query(
      `select * from public.aura_asset_maintenance where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapMaintenance(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<AssetMaintenance[]> {
    const res = await this.pool.query(
      `select * from public.aura_asset_maintenance where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapMaintenance);
  }

  private mapMaintenance(row: any): AssetMaintenance {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      assetId: row.asset_id,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      description: row.description,
      cost: Number(row.cost),
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresAssetInspectionStore implements AssetInspectionStore {
  constructor(private readonly pool: Pool) {}

  async save(ins: AssetInspection, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_asset_inspections (
        id, tenant_id, company_id, asset_id, date, inspector, result, notes, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (id) do update set
        result = excluded.result,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
      [
        ins.id,
        ins.tenantId,
        ins.companyId,
        ins.assetId,
        ins.date,
        ins.inspector,
        ins.result,
        ins.notes,
        ins.createdAt,
        ins.updatedAt,
      ],
    );
  }

  async findById(tenantId: string, id: string): Promise<AssetInspection | null> {
    const res = await this.pool.query(
      `select * from public.aura_asset_inspections where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapInspection(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<AssetInspection[]> {
    const res = await this.pool.query(
      `select * from public.aura_asset_inspections where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapInspection);
  }

  private mapInspection(row: any): AssetInspection {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      assetId: row.asset_id,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      inspector: row.inspector,
      result: row.result,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
