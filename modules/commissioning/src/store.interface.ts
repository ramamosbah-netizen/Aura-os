import type { Page, PageParams } from '@aura/shared';
import type { CommissioningRecord } from './domain/commissioning-record';
import type { CommissioningTestItem } from './domain/commissioning-test-item';
import type { CommissioningTestRun } from './domain/commissioning-test-run';
import type { CommissioningItpLink } from './domain/commissioning-itp-link';
import type { AsBuiltLink } from './domain/asbuilt-link';
import type { CertificateLink } from './domain/certificate-link';
import type { OmItem } from './domain/om-package';
import type { DossierItem } from './domain/dossier';
import type { TrainingSession } from './domain/client-training';
import type { PunchItem } from './domain/punch-item';
import type { HandoverPackage } from './domain/handover';

export const COMMISSIONING_STORE = Symbol('COMMISSIONING_STORE');

export interface CommissioningStore {
  // Commissioning (system-level T&C)
  save(record: CommissioningRecord): Promise<void>;
  find(id: string, tenantId: string): Promise<CommissioningRecord | null>;
  list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]>;
  listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>>;

  // Test-sheet items (the point definitions + the derived snapshot of their latest run)
  saveTestItem(item: CommissioningTestItem): Promise<void>;
  findTestItem(id: string, tenantId: string): Promise<CommissioningTestItem | null>;
  listTestItems(commissioningId: string, tenantId: string): Promise<CommissioningTestItem[]>;

  // Test runs — the authoritative, append-only evidence. There is no update and no delete, here or
  // in the database (migration 0296): a recorded run is a fact about what happened.
  appendTestRun(run: CommissioningTestRun): Promise<void>;
  listTestRunsForItem(testItemId: string, tenantId: string): Promise<CommissioningTestRun[]>;
  listTestRuns(commissioningId: string, tenantId: string): Promise<CommissioningTestRun[]>;

  // Punch list (defects that gate sign-off)
  savePunchItem(item: PunchItem): Promise<void>;
  findPunchItem(id: string, tenantId: string): Promise<PunchItem | null>;
  listPunchItems(commissioningId: string, tenantId: string): Promise<PunchItem[]>;

  // Workspace-wide reads. The T&C surfaces answer questions about a PROJECT ("what is stopping this
  // project being commissioned?"), not about one record, and doing that by looping the records would
  // be a query per system — slow, and wrong the moment a project has fifty.
  listTestItemsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestItem[]>;
  listTestRunsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestRun[]>;
  listPunchItemsForProject(tenantId: string, projectId?: string): Promise<PunchItem[]>;

  // ITP links — T&C's own record of which Quality plan applies to which system (TC-GATE-3).
  saveItpLink(link: CommissioningItpLink): Promise<void>;
  deleteItpLink(id: string, tenantId: string): Promise<void>;
  listItpLinks(commissioningId: string, tenantId: string): Promise<CommissioningItpLink[]>;
  listItpLinksForProject(tenantId: string, projectId?: string): Promise<CommissioningItpLink[]>;

  // As-built links — T&C's own record of which controlled drawing documents which system
  // (TC-GATE-8). Mutable, unlike the dossier manifest: a link is a statement about the present, and
  // one made in error must be retractable.
  saveAsBuiltLink(link: AsBuiltLink): Promise<void>;
  deleteAsBuiltLink(id: string, tenantId: string): Promise<void>;
  listAsBuiltLinks(commissioningId: string, tenantId: string): Promise<AsBuiltLink[]>;
  listAsBuiltLinksForProject(tenantId: string, projectId?: string): Promise<AsBuiltLink[]>;

  // Certificate links — T&C's record that a controlled document IS a system's commissioning
  // certificate (TC-GATE-10). One per system, so `save` replaces rather than accumulates.
  saveCertificateLink(link: CertificateLink): Promise<void>;
  deleteCertificateLink(id: string, tenantId: string): Promise<void>;
  findCertificateLink(commissioningId: string, tenantId: string): Promise<CertificateLink | null>;
  listCertificateLinksForProject(tenantId: string, projectId?: string): Promise<CertificateLink[]>;

  // O&M deliverables and client training — Handover's own authorities (TC-GATE-5). Both are scoped
  // to a system, and both are read project-wide to answer "is this package ready".
  saveOmItem(item: OmItem): Promise<void>;
  findOmItem(id: string, tenantId: string): Promise<OmItem | null>;
  listOmItems(tenantId: string, projectId?: string): Promise<OmItem[]>;

  saveTrainingSession(session: TrainingSession): Promise<void>;
  findTrainingSession(id: string, tenantId: string): Promise<TrainingSession | null>;
  listTrainingSessions(tenantId: string, projectId?: string): Promise<TrainingSession[]>;

  // Dossier manifests — what a package actually SENT, captured at issue (TC-GATE-7). Append-only
  // here and in the database (migration 0300): an issued manifest is a record of what the client
  // received, and a manifest that could be edited afterwards would be a draft wearing a record's
  // clothes. There is no update and no delete.
  appendDossierItems(items: DossierItem[]): Promise<void>;
  listDossierItems(handoverId: string, tenantId: string): Promise<DossierItem[]>;

  // Handover (project-level acceptance)
  saveHandover(pkg: HandoverPackage): Promise<void>;
  findHandover(id: string, tenantId: string): Promise<HandoverPackage | null>;
  listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]>;
}
