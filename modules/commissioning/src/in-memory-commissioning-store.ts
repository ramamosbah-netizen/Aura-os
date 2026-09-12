import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { CommissioningStore } from './store.interface';
import type { CommissioningRecord } from './domain/commissioning-record';
import type { CommissioningTestItem } from './domain/commissioning-test-item';
import type { CommissioningTestRun } from './domain/commissioning-test-run';
import type { CommissioningItpLink } from './domain/commissioning-itp-link';
import type { AsBuiltLink } from './domain/asbuilt-link';
import type { OmItem } from './domain/om-package';
import type { DossierItem } from './domain/dossier';
import type { TrainingSession } from './domain/client-training';
import type { PunchItem } from './domain/punch-item';
import type { HandoverPackage } from './domain/handover';

/** Dev/test adapter — in-memory, non-persistent. Mirrors the Postgres adapter's ordering. */
export class InMemoryCommissioningStore implements CommissioningStore {
  private readonly records = new Map<string, CommissioningRecord>();
  private readonly testItems = new Map<string, CommissioningTestItem>();
  // Append-only, like the table: this adapter offers no way to replace or remove a run either, so a
  // test that passes here cannot be one that would fail against Postgres's refusal to update.
  private readonly testRuns: CommissioningTestRun[] = [];
  private readonly punchItems = new Map<string, PunchItem>();
  private readonly itpLinks = new Map<string, CommissioningItpLink>();
  private readonly asBuiltLinks = new Map<string, AsBuiltLink>();
  private readonly omItems = new Map<string, OmItem>();
  private readonly trainingSessions = new Map<string, TrainingSession>();
  private readonly handovers = new Map<string, HandoverPackage>();
  // Append-only, like the table: this adapter offers no way to replace or remove a captured line
  // either, so a test that passes here cannot be one that would fail against Postgres's refusal.
  private readonly dossierItems: DossierItem[] = [];

  async appendTestRun(run: CommissioningTestRun): Promise<void> {
    if (this.testRuns.some((r) => r.testItemId === run.testItemId && r.runNo === run.runNo)) {
      throw new Error(`conflict: run ${run.runNo} already recorded for test point ${run.testItemId}`);
    }
    this.testRuns.push({ ...run });
  }
  async listTestRunsForItem(testItemId: string, tenantId: string): Promise<CommissioningTestRun[]> {
    return this.testRuns.filter((r) => r.testItemId === testItemId && r.tenantId === tenantId).sort((a, b) => a.runNo - b.runNo);
  }
  async listTestRuns(commissioningId: string, tenantId: string): Promise<CommissioningTestRun[]> {
    return this.testRuns
      .filter((r) => r.commissioningId === commissioningId && r.tenantId === tenantId)
      .sort((a, b) => (a.testItemId === b.testItemId ? a.runNo - b.runNo : a.testItemId < b.testItemId ? -1 : 1));
  }

  async saveTestItem(item: CommissioningTestItem): Promise<void> {
    this.testItems.set(item.id, { ...item });
  }
  async findTestItem(id: string, tenantId: string): Promise<CommissioningTestItem | null> {
    const i = this.testItems.get(id);
    return i && i.tenantId === tenantId ? { ...i } : null;
  }
  async listTestItems(commissioningId: string, tenantId: string): Promise<CommissioningTestItem[]> {
    return [...this.testItems.values()]
      .filter((i) => i.commissioningId === commissioningId && i.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async savePunchItem(item: PunchItem): Promise<void> {
    this.punchItems.set(item.id, { ...item });
  }
  async findPunchItem(id: string, tenantId: string): Promise<PunchItem | null> {
    const i = this.punchItems.get(id);
    return i && i.tenantId === tenantId ? { ...i } : null;
  }
  async listPunchItems(commissioningId: string, tenantId: string): Promise<PunchItem[]> {
    return [...this.punchItems.values()]
      .filter((i) => i.commissioningId === commissioningId && i.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listTestItemsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestItem[]> {
    return [...this.testItems.values()]
      .filter((i) => i.tenantId === tenantId && (!projectId || i.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
  async listTestRunsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestRun[]> {
    return this.testRuns
      .filter((r) => r.tenantId === tenantId && (!projectId || r.projectId === projectId))
      .sort((a, b) => (a.testItemId === b.testItemId ? a.runNo - b.runNo : a.testItemId < b.testItemId ? -1 : 1));
  }
  async saveItpLink(link: CommissioningItpLink): Promise<void> {
    const clash = [...this.itpLinks.values()].find(
      (l) => l.id !== link.id && l.commissioningId === link.commissioningId && l.itpId === link.itpId && l.pointIndex === link.pointIndex,
    );
    if (clash) throw new Error('conflict: this ITP requirement is already linked to the system');
    this.itpLinks.set(link.id, { ...link });
  }
  async deleteItpLink(id: string, tenantId: string): Promise<void> {
    const found = this.itpLinks.get(id);
    if (found && found.tenantId === tenantId) this.itpLinks.delete(id);
  }
  async listItpLinks(commissioningId: string, tenantId: string): Promise<CommissioningItpLink[]> {
    return [...this.itpLinks.values()]
      .filter((l) => l.commissioningId === commissioningId && l.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
  async listItpLinksForProject(tenantId: string, projectId?: string): Promise<CommissioningItpLink[]> {
    return [...this.itpLinks.values()]
      .filter((l) => l.tenantId === tenantId && (!projectId || l.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listPunchItemsForProject(tenantId: string, projectId?: string): Promise<PunchItem[]> {
    return [...this.punchItems.values()]
      .filter((i) => i.tenantId === tenantId && (!projectId || i.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async saveAsBuiltLink(link: AsBuiltLink): Promise<void> {
    const clash = [...this.asBuiltLinks.values()].find(
      (l) => l.id !== link.id && l.commissioningId === link.commissioningId && l.documentId === link.documentId,
    );
    if (clash) throw new Error('conflict: this drawing is already linked to the system');
    this.asBuiltLinks.set(link.id, { ...link });
  }
  async deleteAsBuiltLink(id: string, tenantId: string): Promise<void> {
    const found = this.asBuiltLinks.get(id);
    if (found && found.tenantId === tenantId) this.asBuiltLinks.delete(id);
  }
  async listAsBuiltLinks(commissioningId: string, tenantId: string): Promise<AsBuiltLink[]> {
    return [...this.asBuiltLinks.values()]
      .filter((l) => l.commissioningId === commissioningId && l.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
  async listAsBuiltLinksForProject(tenantId: string, projectId?: string): Promise<AsBuiltLink[]> {
    return [...this.asBuiltLinks.values()]
      .filter((l) => l.tenantId === tenantId && (!projectId || l.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async saveOmItem(item: OmItem): Promise<void> {
    const clash = [...this.omItems.values()].find(
      (i) => i.id !== item.id && i.commissioningId === item.commissioningId && i.deliverable === item.deliverable,
    );
    if (clash) throw new Error('conflict: this deliverable is already on the system’s O&M pack');
    this.omItems.set(item.id, { ...item });
  }
  async findOmItem(id: string, tenantId: string): Promise<OmItem | null> {
    const i = this.omItems.get(id);
    return i && i.tenantId === tenantId ? { ...i } : null;
  }
  async listOmItems(tenantId: string, projectId?: string): Promise<OmItem[]> {
    return [...this.omItems.values()]
      .filter((i) => i.tenantId === tenantId && (!projectId || i.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async saveTrainingSession(session: TrainingSession): Promise<void> {
    this.trainingSessions.set(session.id, { ...session });
  }
  async findTrainingSession(id: string, tenantId: string): Promise<TrainingSession | null> {
    const s = this.trainingSessions.get(id);
    return s && s.tenantId === tenantId ? { ...s } : null;
  }
  async listTrainingSessions(tenantId: string, projectId?: string): Promise<TrainingSession[]> {
    return [...this.trainingSessions.values()]
      .filter((s) => s.tenantId === tenantId && (!projectId || s.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async appendDossierItems(items: DossierItem[]): Promise<void> {
    for (const item of items) {
      const clash = this.dossierItems.some(
        (d) => d.handoverId === item.handoverId && d.issueNo === item.issueNo && d.kind === item.kind && d.sourceId === item.sourceId,
      );
      if (clash) throw new Error(`conflict: ${item.label} is already cited in issue ${item.issueNo}`);
    }
    this.dossierItems.push(...items.map((i) => ({ ...i })));
  }
  async listDossierItems(handoverId: string, tenantId: string): Promise<DossierItem[]> {
    return this.dossierItems
      .filter((d) => d.handoverId === handoverId && d.tenantId === tenantId)
      .sort((a, b) => a.issueNo - b.issueNo || a.label.localeCompare(b.label))
      .map((d) => ({ ...d }));
  }

  async save(record: CommissioningRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async find(id: string, tenantId: string): Promise<CommissioningRecord | null> {
    const r = this.records.get(id);
    return r && r.tenantId === tenantId ? { ...r } : null;
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.tenantId === tenantId && (!projectId || r.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    const all = await this.list(tenantId, projectId);
    const items = all.slice(page.offset, page.offset + page.limit);
    return makePage(items, all.length, page);
  }

  async saveHandover(pkg: HandoverPackage): Promise<void> {
    this.handovers.set(pkg.id, { ...pkg, checklist: { ...pkg.checklist } });
  }

  async findHandover(id: string, tenantId: string): Promise<HandoverPackage | null> {
    const h = this.handovers.get(id);
    return h && h.tenantId === tenantId ? { ...h, checklist: { ...h.checklist } } : null;
  }

  async listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]> {
    return [...this.handovers.values()]
      .filter((h) => h.tenantId === tenantId && (!projectId || h.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((h) => ({ ...h, checklist: { ...h.checklist } }));
  }
}
