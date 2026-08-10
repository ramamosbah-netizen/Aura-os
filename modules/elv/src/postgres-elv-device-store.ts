import type { Pool } from 'pg';
import type { Page, PageParams } from '@aura/shared';
import { makePage, toElvSystem } from '@aura/shared';
import type { ElvDeviceFilter, ElvDeviceStore } from './store.interface';
import type { ElvDevice, ElvDeviceStatus } from './domain/device';

// Postgres adapter for the ELV device register. The domain is a plain interface (no class
// rehydration), so mapping is a straight row → object. `date` columns are read via ::text to
// avoid the timezone-drift hazard; timestamptz columns are stored/read as ISO strings.

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  system: string;
  tag: string;
  model: string | null;
  manufacturer: string | null;
  location: string | null;
  drawing_ref: string | null;
  serial_number: string | null;
  mac_address: string | null;
  ip_address: string | null;
  cable_ref: string | null;
  home_run_to: string | null;
  port_ref: string | null;
  status: string;
  commissioning_record_id: string | null;
  warranty_expires_at: string | null;
  asset_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// SELECT list: the date read via ::text to avoid timezone drift.
const COLS = `id, tenant_id, company_id, project_id, system, tag, model, manufacturer, location,
  drawing_ref, serial_number, mac_address, ip_address, cable_ref, home_run_to, port_ref, status,
  commissioning_record_id, warranty_expires_at::text, asset_id, notes, created_by,
  created_at, updated_at`;
// INSERT list: same columns, no casts (a cast is invalid in a column list).
const INSERT_COLS = `id, tenant_id, company_id, project_id, system, tag, model, manufacturer, location,
  drawing_ref, serial_number, mac_address, ip_address, cable_ref, home_run_to, port_ref, status,
  commissioning_record_id, warranty_expires_at, asset_id, notes, created_by,
  created_at, updated_at`;

function toDevice(r: Row): ElvDevice {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    // Alias-aware: a row written before the taxonomies merged must not read back as `other`.
    system: toElvSystem(r.system),
    tag: r.tag,
    model: r.model,
    manufacturer: r.manufacturer,
    location: r.location,
    drawingRef: r.drawing_ref,
    serialNumber: r.serial_number,
    macAddress: r.mac_address,
    ipAddress: r.ip_address,
    cableRef: r.cable_ref,
    homeRunTo: r.home_run_to,
    portRef: r.port_ref,
    status: r.status as ElvDeviceStatus,
    commissioningRecordId: r.commissioning_record_id,
    warrantyExpiresAt: r.warranty_expires_at,
    assetId: r.asset_id,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class PostgresElvDeviceStore implements ElvDeviceStore {
  constructor(private readonly pool: Pool) {}

  async save(d: ElvDevice): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_elv_devices (${INSERT_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         system = EXCLUDED.system, tag = EXCLUDED.tag, model = EXCLUDED.model,
         manufacturer = EXCLUDED.manufacturer, location = EXCLUDED.location,
         drawing_ref = EXCLUDED.drawing_ref, serial_number = EXCLUDED.serial_number,
         mac_address = EXCLUDED.mac_address, ip_address = EXCLUDED.ip_address,
         cable_ref = EXCLUDED.cable_ref, home_run_to = EXCLUDED.home_run_to,
         port_ref = EXCLUDED.port_ref, status = EXCLUDED.status,
         commissioning_record_id = EXCLUDED.commissioning_record_id,
         warranty_expires_at = EXCLUDED.warranty_expires_at, asset_id = EXCLUDED.asset_id,
         notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`,
      [
        d.id, d.tenantId, d.companyId, d.projectId, d.system, d.tag, d.model, d.manufacturer,
        d.location, d.drawingRef, d.serialNumber, d.macAddress, d.ipAddress, d.cableRef,
        d.homeRunTo, d.portRef, d.status, d.commissioningRecordId, d.warrantyExpiresAt,
        d.assetId, d.notes, d.createdBy, d.createdAt, d.updatedAt,
      ],
    );
  }

  async find(id: string, tenantId: string): Promise<ElvDevice | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_elv_devices WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows[0] ? toDevice(res.rows[0]) : null;
  }

  async findByTag(tenantId: string, projectId: string, tag: string): Promise<ElvDevice | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_elv_devices
       WHERE tenant_id = $1 AND project_id = $2 AND tag = $3`,
      [tenantId, projectId, tag.trim().toUpperCase()],
    );
    return res.rows[0] ? toDevice(res.rows[0]) : null;
  }

  async list(tenantId: string, filter?: ElvDeviceFilter): Promise<ElvDevice[]> {
    const { where, params } = this.whereFor(tenantId, filter);
    // Tag order: a device schedule is read in tag order, not by when someone typed it in.
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_elv_devices ${where} ORDER BY tag ASC`,
      params,
    );
    return res.rows.map(toDevice);
  }

  async listPaged(tenantId: string, page: PageParams, filter?: ElvDeviceFilter): Promise<Page<ElvDevice>> {
    const { where, params } = this.whereFor(tenantId, filter);
    const total = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::int AS c FROM public.aura_elv_devices ${where}`,
      params,
    );
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_elv_devices ${where}
       ORDER BY tag ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, page.limit, page.offset],
    );
    return makePage(res.rows.map(toDevice), Number(total.rows[0]?.c ?? 0), page);
  }

  private whereFor(tenantId: string, filter?: ElvDeviceFilter): { where: string; params: unknown[] } {
    const clauses = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (filter?.projectId) {
      params.push(filter.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (filter?.system) {
      params.push(filter.system);
      clauses.push(`system = $${params.length}`);
    }
    if (filter?.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }
    return { where: `WHERE ${clauses.join(' AND ')}`, params };
  }
}
