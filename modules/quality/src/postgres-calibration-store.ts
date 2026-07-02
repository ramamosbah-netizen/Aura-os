// Split from postgres-quality-store.ts — one file per entity store.
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Ncr } from './domain/ncr';
import type { InspectionRequest } from './domain/inspection-request';
import type { Snag } from './domain/snag';
import type { Itp, ItpPoint } from './domain/itp';
import type { MaterialApproval } from './domain/material-approval';
import type { Calibration } from './domain/calibration';
import type { AuditSchedule } from './domain/audit-schedule';
import { type Page, PageParams, makePage } from '@aura/shared';
import type { NcrStore, InspectionRequestStore, SnagStore, ItpStore, MaterialApprovalStore, CalibrationStore, AuditScheduleStore, MaterialApprovalFilter } from './store.interface';

export class PostgresCalibrationStore implements CalibrationStore {
  constructor(private readonly pool: Pool) {}

  async save(cal: Calibration, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_calibrations (
        id, tenant_id, company_id, project_id, project_name, equipment_name, equipment_serial,
        instrument_type, calibration_date, due_date, certificate_number, calibrated_by, status, notes,
        created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict (id) do update set
        status = excluded.status, due_date = excluded.due_date, certificate_number = excluded.certificate_number,
        notes = excluded.notes, updated_at = excluded.updated_at`,
      [
        cal.id, cal.tenantId, cal.companyId, cal.projectId, cal.projectName, cal.equipmentName, cal.equipmentSerial,
        cal.instrumentType, cal.calibrationDate, cal.dueDate, cal.certificateNumber, cal.calibratedBy, cal.status, cal.notes,
        cal.createdBy, cal.createdAt, cal.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<Calibration | null> {
    const res = await this.pool.query(
      `select * from public.aura_quality_calibrations where id = $1 and tenant_id = $2`, [id, tenantId]);
    if (res.rowCount === 0) return null;
    return this.mapCalibration(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<Calibration[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_calibrations where project_id = $1 and tenant_id = $2 order by due_date asc`, [projectId, tenantId]);
    return res.rows.map(this.mapCalibration);
  }

  async findAll(tenantId: string): Promise<Calibration[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_calibrations where tenant_id = $1 order by due_date asc`, [tenantId]);
    return res.rows.map(this.mapCalibration);
  }

  private mapCalibration(row: any): Calibration {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      equipmentName: row.equipment_name,
      equipmentSerial: row.equipment_serial,
      instrumentType: row.instrument_type,
      calibrationDate: typeof row.calibration_date === 'string' ? row.calibration_date.slice(0, 10) : row.calibration_date.toISOString().slice(0, 10),
      dueDate: typeof row.due_date === 'string' ? row.due_date.slice(0, 10) : row.due_date.toISOString().slice(0, 10),
      certificateNumber: row.certificate_number,
      calibratedBy: row.calibrated_by,
      status: row.status,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
