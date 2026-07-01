import type { TxHandle } from '@aura/core';
import type { Ncr } from './domain/ncr';
import type { InspectionRequest } from './domain/inspection-request';
import type { Snag } from './domain/snag';
import type { Itp } from './domain/itp';
import type { MaterialApproval } from './domain/material-approval';
import type { Calibration } from './domain/calibration';

export interface CalibrationStore {
  save(cal: Calibration, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Calibration | null>;
  findByProject(projectId: string, tenantId: string): Promise<Calibration[]>;
  findAll(tenantId: string): Promise<Calibration[]>;
}

export interface NcrStore {
  save(ncr: Ncr, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Ncr | null>;
  findByProject(projectId: string, tenantId: string): Promise<Ncr[]>;
  findAll(tenantId: string): Promise<Ncr[]>;
}

export interface InspectionRequestStore {
  save(ir: InspectionRequest, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<InspectionRequest | null>;
  findByProject(projectId: string, tenantId: string): Promise<InspectionRequest[]>;
  findAll(tenantId: string): Promise<InspectionRequest[]>;
}

export interface SnagStore {
  save(snag: Snag, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Snag | null>;
  findByProject(projectId: string, tenantId: string): Promise<Snag[]>;
  findAll(tenantId: string): Promise<Snag[]>;
}

export interface ItpStore {
  save(itp: Itp, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Itp | null>;
  findByProject(projectId: string, tenantId: string): Promise<Itp[]>;
  findAll(tenantId: string): Promise<Itp[]>;
}

export interface MaterialApprovalStore {
  save(mar: MaterialApproval, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<MaterialApproval | null>;
  findByProject(projectId: string, tenantId: string): Promise<MaterialApproval[]>;
  findAll(tenantId: string): Promise<MaterialApproval[]>;
}
