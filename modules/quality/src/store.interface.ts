import type { TxHandle } from '@aura/core';
import type { Page, PageParams } from '@aura/shared';
import type { Ncr } from './domain/ncr';
import type { NcrVerification } from './domain/ncr-verification';
import type { InspectionRequest } from './domain/inspection-request';
import type { IrEvidence } from './domain/ir-evidence';
import type { NcrEvidence } from './domain/ncr-evidence';
import type { Snag } from './domain/snag';
import type { Itp } from './domain/itp';
import type { ItpTemplate } from './domain/itp-template';
import type { ElvSystem } from '@aura/shared';
import type { MaterialApproval } from './domain/material-approval';
import type { Calibration } from './domain/calibration';
import type { AuditSchedule } from './domain/audit-schedule';

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
  listPaged(tenantId: string, page: PageParams): Promise<Page<Ncr>>;

  /** The non-conformance and the repair, each evidenced on its own side. Append-only. */
  saveEvidence(evidence: NcrEvidence, tx?: TxHandle): Promise<void>;
  listEvidence(ncrId: string, tenantId: string): Promise<NcrEvidence[]>;
}

export interface NcrVerificationStore {
  save(v: NcrVerification, tx?: TxHandle): Promise<void>;
  listByNcr(ncrId: string, tenantId: string): Promise<NcrVerification[]>;
}

export interface InspectionRequestStore {
  save(ir: InspectionRequest, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<InspectionRequest | null>;
  findByProject(projectId: string, tenantId: string): Promise<InspectionRequest[]>;
  findAll(tenantId: string): Promise<InspectionRequest[]>;
  listPaged(tenantId: string, page: PageParams): Promise<Page<InspectionRequest>>;

  /**
   * The photographs and the signature an inspection produced. Append-only: an inspection
   * re-signed after being re-measured keeps the earlier row, which is the record that it was
   * signed once and then changed.
   */
  saveEvidence(evidence: IrEvidence, tx?: TxHandle): Promise<void>;
  listEvidence(inspectionId: string, tenantId: string): Promise<IrEvidence[]>;
}

export interface SnagStore {
  save(snag: Snag, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Snag | null>;
  findByProject(projectId: string, tenantId: string): Promise<Snag[]>;
  findAll(tenantId: string): Promise<Snag[]>;
  listPaged(tenantId: string, page: PageParams): Promise<Page<Snag>>;
}

/** The tenant library of system templates (TC-08/TC-09, migration 0388). */
export interface ItpTemplateStore {
  save(template: ItpTemplate, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<ItpTemplate | null>;
  list(tenantId: string, system?: ElvSystem): Promise<ItpTemplate[]>;
}

export interface ItpStore {
  save(itp: Itp, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Itp | null>;
  findByProject(projectId: string, tenantId: string): Promise<Itp[]>;
  findAll(tenantId: string): Promise<Itp[]>;
  listPaged(tenantId: string, page: PageParams): Promise<Page<Itp>>;
}

export interface MaterialApprovalFilter {
  tenantId?: string;
  projectId?: string;
  status?: string;
  supplier?: string;
}

export interface MaterialApprovalStore {
  save(mar: MaterialApproval, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<MaterialApproval | null>;
  findByProject(projectId: string, tenantId: string): Promise<MaterialApproval[]>;
  findAll(tenantId: string): Promise<MaterialApproval[]>;
  listPaged(filter: MaterialApprovalFilter, page: PageParams): Promise<Page<MaterialApproval>>;
}

export interface AuditScheduleStore {
  save(audit: AuditSchedule, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<AuditSchedule | null>;
  findByProject(projectId: string, tenantId: string): Promise<AuditSchedule[]>;
  findAll(tenantId: string): Promise<AuditSchedule[]>;
}
