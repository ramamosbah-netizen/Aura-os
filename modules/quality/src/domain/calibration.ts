import { randomUUID } from 'node:crypto';

// Quality domain — framework-free. A Calibration record tracks a measuring instrument's
// calibration certificate and its validity window, so QA can prove equipment used on site
// was in-calibration and flag instruments due/overdue for recalibration.

export type CalibrationStatus = 'valid' | 'due_soon' | 'expired';

export interface Calibration {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string | null;
  projectName: string | null;
  equipmentName: string;
  equipmentSerial: string;
  instrumentType: string | null;
  calibrationDate: string; // YYYY-MM-DD
  dueDate: string;         // YYYY-MM-DD
  certificateNumber: string | null;
  calibratedBy: string | null; // lab / vendor
  status: CalibrationStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewCalibration {
  tenantId: string;
  companyId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  equipmentName: string;
  equipmentSerial: string;
  instrumentType?: string | null;
  calibrationDate: string;
  dueDate: string;
  certificateNumber?: string | null;
  calibratedBy?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

/** Validity relative to `asOf` (default today): expired if past due, due_soon within 30 days. */
export function calibrationStatus(dueDate: string, asOf?: string): CalibrationStatus {
  const now = asOf ?? new Date().toISOString().slice(0, 10);
  const due = dueDate.slice(0, 10);
  if (due < now) return 'expired';
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);
  return due <= soon.toISOString().slice(0, 10) ? 'due_soon' : 'valid';
}

export function makeCalibration(input: NewCalibration): Calibration {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    equipmentName: input.equipmentName.trim(),
    equipmentSerial: input.equipmentSerial.trim(),
    instrumentType: input.instrumentType?.trim() || null,
    calibrationDate: input.calibrationDate.slice(0, 10),
    dueDate: input.dueDate.slice(0, 10),
    certificateNumber: input.certificateNumber?.trim() || null,
    calibratedBy: input.calibratedBy?.trim() || null,
    status: calibrationStatus(input.dueDate),
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
