import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import { type Page, type PageParams, makePage } from '@aura/shared';
import type { Asset } from './domain/asset';
import type { AssetMaintenance } from './domain/asset-maintenance';
import type { AssetInspection } from './domain/asset-inspection';
import type { AssetDisposal } from './domain/asset-disposal';
import type { AssetStore, AssetMaintenanceStore, AssetInspectionStore, AssetDisposalStore, AssetFilter } from './store.interface';

export class PostgresAssetDisposalStore implements AssetDisposalStore {
  constructor(private readonly pool: Pool) {}

  async save(d: AssetDisposal, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_asset_disposals (
        id, tenant_id, company_id, asset_id, asset_name, disposal_date, method, proceeds, book_value, gain_loss, notes, created_by, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (id) do update set
        proceeds = excluded.proceeds, book_value = excluded.book_value, gain_loss = excluded.gain_loss, notes = excluded.notes`,
      [d.id, d.tenantId, d.companyId, d.assetId, d.assetName, d.disposalDate, d.method, d.proceeds, d.bookValue, d.gainLoss, d.notes, d.createdBy, d.createdAt],
    );
  }

  async findById(tenantId: string, id: string): Promise<AssetDisposal | null> {
    const res = await this.pool.query(
      `select * from public.aura_asset_disposals where id = $1 and tenant_id = $2`, [id, tenantId]);
    if (res.rowCount === 0) return null;
    return this.mapDisposal(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<AssetDisposal[]> {
    const res = await this.pool.query(
      `select * from public.aura_asset_disposals where tenant_id = $1 order by disposal_date desc`, [tenantId]);
    return res.rows.map(this.mapDisposal);
  }

  private mapDisposal(row: any): AssetDisposal {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      assetId: row.asset_id,
      assetName: row.asset_name,
      disposalDate: row.disposal_date instanceof Date ? row.disposal_date.toISOString().split('T')[0] : String(row.disposal_date),
      method: row.method,
      proceeds: Number(row.proceeds),
      bookValue: Number(row.book_value),
      gainLoss: Number(row.gain_loss),
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
    };
  }
}

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
      `select * from public.aura_assets where id = $1 and tenant_id = $2 and deleted_at is null`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapAsset(res.rows[0]);
  }

  async findByTenant(tenantId: string): Promise<Asset[]> {
    const res = await this.pool.query(
      `select * from public.aura_assets where tenant_id = $1 and deleted_at is null order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapAsset);
  }

  async setDeleted(tenantId: string, id: string, deleted: boolean, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `update public.aura_assets set deleted_at = ${deleted ? 'now()' : 'NULL'} where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
  }

  private mapAsset(row: QueryResultRow): Asset {
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
      deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private buildWhere(filter: AssetFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    where.push('deleted_at IS NULL');
    add('tenant_id', filter.tenantId);
    add('category', filter.category);
    add('status', filter.status);
    return { whereSql: `WHERE ${where.join(' AND ')}`, params };
  }

  async listPaged(filter: AssetFilter, page: PageParams): Promise<Page<Asset>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_assets ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<any>(
      `SELECT * FROM public.aura_assets ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map((row) => this.mapAsset(row)), total, page);
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

  private mapMaintenance(row: QueryResultRow): AssetMaintenance {
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

  private mapInspection(row: QueryResultRow): AssetInspection {
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
