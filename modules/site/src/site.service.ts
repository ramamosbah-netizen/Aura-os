import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent, type Page, type PageParams, paginate } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import {
  type DailyReport,
  makeDailyReport,
  submitReport,
  startReviewReport,
  approveReport,
  rejectReport,
  reopenReport,
  assertReportEditable,
  SITE_REPORT_EVENT,
} from './domain/daily-report';
import {
  type SiteLabourEntry, type NewSiteLabourEntry, makeSiteLabourEntry,
  type SitePlantEntry, type NewSitePlantEntry, makeSitePlantEntry,
  type SiteProgressEntry, type NewSiteProgressEntry, makeSiteProgressEntry,
  type SiteDelayEntry, type NewSiteDelayEntry, makeSiteDelayEntry,
  type SiteEvidence, type NewSiteEvidence, makeSiteEvidence,
} from './domain/daily-report-lines';
import { type DelayLog, makeDelayLog } from './domain/delay-log';
import { type MaterialConsumption, makeMaterialConsumption } from './domain/material-consumption';
import { type SiteInstruction, makeSiteInstruction, acknowledgeInstruction, closeInstruction } from './domain/site-instruction';
import { type LabourAllocation, type TradeManHours, makeLabourAllocation, summariseByTrade } from './domain/labour-allocation';

export const DAILY_REPORT_STORE = Symbol('DAILY_REPORT_STORE');
export const DELAY_LOG_STORE = Symbol('DELAY_LOG_STORE');
export const MATERIAL_CONSUMPTION_STORE = Symbol('MATERIAL_CONSUMPTION_STORE');
export const SITE_INSTRUCTION_STORE = Symbol('SITE_INSTRUCTION_STORE');
export const LABOUR_ALLOCATION_STORE = Symbol('LABOUR_ALLOCATION_STORE');
export const PLANT_USAGE_STORE = Symbol('PLANT_USAGE_STORE');
export const INSTALLATION_STORE = Symbol('INSTALLATION_STORE');
export const SITE_REPORT_LABOUR_STORE = Symbol('SITE_REPORT_LABOUR_STORE');
export const SITE_REPORT_PLANT_STORE = Symbol('SITE_REPORT_PLANT_STORE');
export const SITE_REPORT_PROGRESS_STORE = Symbol('SITE_REPORT_PROGRESS_STORE');
export const SITE_REPORT_DELAY_STORE = Symbol('SITE_REPORT_DELAY_STORE');
export const SITE_REPORT_EVIDENCE_STORE = Symbol('SITE_REPORT_EVIDENCE_STORE');

import {
  type DailyReportStore,
  type DelayLogStore,
  type MaterialConsumptionStore,
  type SiteInstructionStore,
  type LabourAllocationStore,
  type PlantUsageStore,
  type InstallationStore,
  type DailyReportFilter,
  type SiteLabourEntryStore,
  type SitePlantEntryStore,
  type SiteProgressEntryStore,
  type SiteDelayEntryStore,
  type SiteEvidenceStore,
} from './store.interface';
import { type PlantUsage, makePlantUsage } from './domain/plant-usage';
import { type InstallationRecord, makeInstallationRecord } from './domain/installation';
import { type SiteSurvey, type NewSiteSurvey, makeSiteSurvey, SITE_SURVEY_EVENT } from './domain/survey';

export const SITE_EVENT = {
  dailyReportSubmitted: 'site.daily_report.submitted',
  materialConsumed: 'site.material.consumed',
  delayLogged: 'site.delay.logged',
  instructionIssued: 'site.instruction.issued',
  instructionClosed: 'site.instruction.closed',
  labourLogged: 'site.labour.logged',
  plantLogged: 'site.plant.logged',
  installationRecorded: 'site.installation.recorded',
  surveyCompleted: SITE_SURVEY_EVENT.completed,
};

/**
 * A daily report already exists for that project and day.
 *
 * Its own type so both the pre-check and the unique-violation translation raise exactly the same
 * thing, and the taxonomy maps it to 409 rather than leaking SQL as a 400.
 */
/**
 * Is this the "one report per project per day" unique index refusing the write?
 *
 * Matched on SQLSTATE 23505 plus the constraint name, not on the message text: the text is
 * localisable and version-dependent, and every OTHER unique violation must keep its own meaning
 * rather than being reported as a duplicate daily report.
 */
function isDailyReportDateViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string } | null;
  return e?.code === '23505' && e?.constraint === 'aura_site_daily_reports_tenant_id_project_id_date_key';
}

export class DailyReportExistsError extends Error {
  constructor(date: string) {
    super(`A daily report already exists for this project on ${date}.`);
    this.name = 'DailyReportExistsError';
  }
}

@Injectable()
export class SiteService {
  private readonly logger = new Logger('SiteControl');

  constructor(
    @Inject(DAILY_REPORT_STORE) private readonly dailyReportStore: DailyReportStore,
    @Inject(DELAY_LOG_STORE) private readonly delayLogStore: DelayLogStore,
    @Inject(MATERIAL_CONSUMPTION_STORE) private readonly materialConsumptionStore: MaterialConsumptionStore,
    @Inject(SITE_INSTRUCTION_STORE) private readonly siteInstructionStore: SiteInstructionStore,
    @Inject(LABOUR_ALLOCATION_STORE) private readonly labourStore: LabourAllocationStore,
    @Inject(PLANT_USAGE_STORE) private readonly plantStore: PlantUsageStore,
    @Inject(INSTALLATION_STORE) private readonly installationStore: InstallationStore,
    @Inject(SITE_REPORT_LABOUR_STORE) private readonly reportLabourStore: SiteLabourEntryStore,
    @Inject(SITE_REPORT_PLANT_STORE) private readonly reportPlantStore: SitePlantEntryStore,
    @Inject(SITE_REPORT_PROGRESS_STORE) private readonly reportProgressStore: SiteProgressEntryStore,
    @Inject(SITE_REPORT_DELAY_STORE) private readonly reportDelayStore: SiteDelayEntryStore,
    @Inject(SITE_REPORT_EVIDENCE_STORE) private readonly reportEvidenceStore: SiteEvidenceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Daily Reports ──────────────────────────────────────────────────────────

  async createDailyReport(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    reportNumber?: string;
    date: string;
    workDescription: string;
    siteConditions?: string;
    safetyNotes?: string;
    manpowerCount?: number;
    equipmentCount?: number;
    createdBy?: string;
  }): Promise<DailyReport> {
    this.assertReportPerm(input.createdBy ?? null, input.tenantId, input.companyId ?? null, 'site.daily_report.create');
    await this.assertNoReportForDate(input.tenantId, input.projectId, input.date);
    const report = makeDailyReport(input);
    const event = makeEvent({
      type: SITE_REPORT_EVENT.created,
      tenantId: report.tenantId, companyId: report.companyId, actorId: report.createdBy,
      aggregateType: 'site.daily_report', aggregateId: report.id,
      payload: { reportNumber: report.reportNumber, date: report.date, projectId: report.projectId },
    });
    try {
      await this.tx.run(async (handle) => {
        await this.dailyReportStore.save(report, handle);
        await this.events.appendWithClient(handle, [event]);
      });
    } catch (err) {
      // The pre-check above cannot be the guarantee — two concurrent creates both pass it. The
      // unique index is the arbiter; a lost race is translated to the SAME refusal so the caller
      // never sees a difference between losing a race and being second.
      if (isDailyReportDateViolation(err)) throw new DailyReportExistsError(input.date);
      throw err;
    }
    this.logger.log(`Daily Report drafted: ${report.reportNumber} for project ${report.projectId}`);
    return report;
  }

/**
 * One daily report per project per day — refused HERE, in the domain, and again by the database.
 *
 * The schema has always carried `UNIQUE (tenant_id, project_id, date)`, but nothing checked it
 * before persistence, so the rule was enforced in the wrong layer and expressed in the wrong
 * contract: PostgreSQL raised `duplicate key value violates unique constraint …`, which the filter
 * turned into a 400 VALIDATION carrying raw SQL at the user.
 *
 * Worse, before the upsert arbiter was corrected the rule did not bite at all: the insert said
 * `on conflict (tenant_id, project_id, date) do update`, so a SECOND report — a different id, a
 * different author — silently overwrote the first one in place. Two engineers filing the same
 * day's diary meant the second replaced the first, and every test was green.
 *
 * The pre-check below is for the person: it names the conflict in a sentence they can act on. It
 * is NOT the guarantee — two concurrent creates can both pass it. The unique index remains the
 * arbiter, and `23505` is translated to the same refusal, so the race loses nothing.
 */

private async assertNoReportForDate(tenantId: string, projectId: string, date: string): Promise<void> {
  const existing = await this.dailyReportStore.findByProject(projectId, tenantId);
  if (existing.some((report) => report.date === date)) {
    throw new DailyReportExistsError(date);
  }
}

  // ── Governed daily-report lifecycle ──────────────────────────────────────────

  private assertReportPerm(actorId: Id | null, tenantId: Id, companyId: string | null, permission: string): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) orgPath.push({ level: 'company', id: companyId });
    this.access.assert(actorId, { permission, orgPath });
  }

  private async loadReport(tenantId: Id, id: Id): Promise<DailyReport> {
    const report = await this.dailyReportStore.findById(id, tenantId);
    if (!report) throw new Error(`Daily report with ID ${id} not found`);
    return report;
  }

  private async saveReportWithEvent(report: DailyReport, actorId: Id | null, type: string): Promise<DailyReport> {
    const event = makeEvent({
      type, tenantId: report.tenantId, companyId: report.companyId, actorId,
      aggregateType: 'site.daily_report', aggregateId: report.id,
      payload: { reportNumber: report.reportNumber, date: report.date, status: report.status, projectId: report.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.dailyReportStore.save(report, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Daily Report ${report.reportNumber} → ${report.status}`);
    return report;
  }

  /** draft → submitted (kept name for the existing BFF/UI; now enforced). */
  async submitDailyReport(tenantId: Id, actorId: Id | null, id: Id): Promise<DailyReport> {
    const report = await this.loadReport(tenantId, id);
    this.assertReportPerm(actorId, tenantId, report.companyId, 'site.daily_report.submit');
    return this.saveReportWithEvent(submitReport(report, actorId), actorId, SITE_REPORT_EVENT.submitted);
  }

  /** submitted → under_review. */
  async startReviewReport(tenantId: Id, actorId: Id | null, id: Id): Promise<DailyReport> {
    const report = await this.loadReport(tenantId, id);
    this.assertReportPerm(actorId, tenantId, report.companyId, 'site.daily_report.review');
    return this.saveReportWithEvent(startReviewReport(report, actorId), actorId, SITE_REPORT_EVENT.reviewStarted);
  }

  /** under_review → approved (immutable thereafter). */
  async approveDailyReport(tenantId: Id, actorId: Id | null, id: Id): Promise<DailyReport> {
    const report = await this.loadReport(tenantId, id);
    this.assertReportPerm(actorId, tenantId, report.companyId, 'site.daily_report.approve');
    return this.saveReportWithEvent(approveReport(report, actorId), actorId, SITE_REPORT_EVENT.approved);
  }

  /** under_review → rejected (reason mandatory) then auto-reopened to draft for correction. */
  async rejectDailyReport(tenantId: Id, actorId: Id | null, id: Id, reason: string): Promise<DailyReport> {
    const report = await this.loadReport(tenantId, id);
    this.assertReportPerm(actorId, tenantId, report.companyId, 'site.daily_report.approve');
    const rejected = rejectReport(report, actorId, reason);
    // record the rejection, then reopen to draft so the site team can correct and resubmit.
    await this.saveReportWithEvent(rejected, actorId, SITE_REPORT_EVENT.rejected);
    const reopened = reopenReport(rejected);
    await this.tx.run(async (handle) => { await this.dailyReportStore.save(reopened, handle); });
    return reopened;
  }

  // ── Report line-items (attachable only while the report is a draft) ────────────

  private async addLine<T>(tenantId: Id, reportId: Id, permission: string, make: (report: DailyReport) => T, save: (line: T, tx: import('@aura/core').TxHandle | null) => Promise<void>, actorId: Id | null): Promise<T> {
    const report = await this.loadReport(tenantId, reportId);
    this.assertReportPerm(actorId, tenantId, report.companyId, permission);
    assertReportEditable(report); // 409 unless the report is still a draft
    const line = make(report);
    await this.tx.run(async (handle) => { await save(line, handle); });
    return line;
  }

  addReportLabour(tenantId: Id, actorId: Id | null, reportId: Id, input: Omit<NewSiteLabourEntry, 'tenantId' | 'companyId' | 'dailyReportId' | 'projectId' | 'createdBy'>): Promise<SiteLabourEntry> {
    return this.addLine(tenantId, reportId, 'site.daily_report.update',
      (r) => makeSiteLabourEntry({ ...input, tenantId, companyId: r.companyId, dailyReportId: r.id, projectId: r.projectId, createdBy: actorId }),
      (l, h) => this.reportLabourStore.save(l, h), actorId);
  }

  addReportPlant(tenantId: Id, actorId: Id | null, reportId: Id, input: Omit<NewSitePlantEntry, 'tenantId' | 'companyId' | 'dailyReportId' | 'projectId' | 'createdBy'>): Promise<SitePlantEntry> {
    return this.addLine(tenantId, reportId, 'site.daily_report.update',
      (r) => makeSitePlantEntry({ ...input, tenantId, companyId: r.companyId, dailyReportId: r.id, projectId: r.projectId, createdBy: actorId }),
      (l, h) => this.reportPlantStore.save(l, h), actorId);
  }

  addReportProgress(tenantId: Id, actorId: Id | null, reportId: Id, input: Omit<NewSiteProgressEntry, 'tenantId' | 'companyId' | 'dailyReportId' | 'projectId' | 'createdBy'>): Promise<SiteProgressEntry> {
    return this.addLine(tenantId, reportId, 'site.daily_report.update',
      (r) => makeSiteProgressEntry({ ...input, tenantId, companyId: r.companyId, dailyReportId: r.id, projectId: r.projectId, createdBy: actorId }),
      (l, h) => this.reportProgressStore.save(l, h), actorId);
  }

  addReportDelay(tenantId: Id, actorId: Id | null, reportId: Id, input: Omit<NewSiteDelayEntry, 'tenantId' | 'companyId' | 'dailyReportId' | 'projectId' | 'createdBy'>): Promise<SiteDelayEntry> {
    return this.addLine(tenantId, reportId, 'site.daily_report.update',
      (r) => makeSiteDelayEntry({ ...input, tenantId, companyId: r.companyId, dailyReportId: r.id, projectId: r.projectId, createdBy: actorId }),
      (l, h) => this.reportDelayStore.save(l, h), actorId);
  }

  addReportEvidence(tenantId: Id, actorId: Id | null, reportId: Id, input: Omit<NewSiteEvidence, 'tenantId' | 'companyId' | 'dailyReportId' | 'projectId' | 'createdBy'>): Promise<SiteEvidence> {
    return this.addLine(tenantId, reportId, 'site.daily_report.update',
      (r) => makeSiteEvidence({ ...input, tenantId, companyId: r.companyId, dailyReportId: r.id, projectId: r.projectId, createdBy: actorId }),
      (l, h) => this.reportEvidenceStore.save(l, h), actorId);
  }

  /** The full report with all its line-items — the Site Daily Report 360. */
  async getDailyReportDetail(tenantId: Id, id: Id): Promise<{
    report: DailyReport; labour: SiteLabourEntry[]; plant: SitePlantEntry[];
    progress: SiteProgressEntry[]; delays: SiteDelayEntry[]; evidence: SiteEvidence[];
  } | null> {
    const report = await this.dailyReportStore.findById(id, tenantId);
    if (!report) return null;
    const [labour, plant, progress, delays, evidence] = await Promise.all([
      this.reportLabourStore.listByReport(id, tenantId),
      this.reportPlantStore.listByReport(id, tenantId),
      this.reportProgressStore.listByReport(id, tenantId),
      this.reportDelayStore.listByReport(id, tenantId),
      this.reportEvidenceStore.listByReport(id, tenantId),
    ]);
    return { report, labour, plant, progress, delays, evidence };
  }

  getDailyReport(tenantId: Id, id: Id): Promise<DailyReport | null> {
    return this.dailyReportStore.findById(id, tenantId);
  }

  listDailyReports(tenantId: Id): Promise<DailyReport[]> {
    return this.dailyReportStore.findAll(tenantId);
  }

  listDailyReportsPaged(filter: DailyReportFilter, page: PageParams): Promise<Page<DailyReport>> {
    return this.dailyReportStore.listPaged(filter, page);
  }

  // ── Delay Logs ─────────────────────────────────────────────────────────────

  async createDelayLog(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    date: string;
    delayType: DelayLog['delayType'];
    description: string;
    impactHours?: number;
    createdBy?: string;
  }): Promise<DelayLog> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'site.delay.log', orgPath });
    }

    const log = makeDelayLog(input);
    const event = makeEvent({
      type: SITE_EVENT.delayLogged,
      tenantId: log.tenantId,
      companyId: log.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'site.delay_log',
      aggregateId: log.id,
      payload: { delayType: log.delayType, date: log.date, projectId: log.projectId, impactHours: log.impactHours },
    });

    await this.tx.run(async (handle) => {
      await this.delayLogStore.save(log, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Delay logged: ${log.delayType} on ${log.date} for project ${log.projectId}`);
    return log;
  }

  async resolveDelayLog(tenantId: Id, actorId: Id | null, id: Id): Promise<DelayLog> {
    const log = await this.delayLogStore.findById(id, tenantId);
    if (!log) throw new Error(`Delay log with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (log.companyId) orgPath.push({ level: 'company', id: log.companyId });
      this.access.assert(actorId, { permission: 'site.delay.resolve', orgPath });
    }

    log.status = 'resolved';
    log.resolvedAt = new Date().toISOString();
    log.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.delayLogStore.save(log, handle);
    });

    this.logger.log(`Delay resolved: ${log.id}`);
    return log;
  }

  listDelayLogs(tenantId: Id): Promise<DelayLog[]> {
    return this.delayLogStore.findAll(tenantId);
  }

  /** Paged variant — low-growth list, so windowing over findAll suffices (gap #9 tail). */
  async listDelayLogsPaged(tenantId: Id, page: PageParams): Promise<Page<DelayLog>> {
    return paginate(await this.delayLogStore.findAll(tenantId), page);
  }

  // ── Site Instructions ──────────────────────────────────────────────────────

  async issueSiteInstruction(input: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    reference: string;
    issuedBy: string;
    date: string;
    instruction: string;
    costImplication?: boolean;
    timeImplication?: boolean;
    createdBy?: string | null;
  }): Promise<SiteInstruction> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'site.instruction.issue', orgPath });
    }

    const si = makeSiteInstruction(input);
    const event = makeEvent({
      type: SITE_EVENT.instructionIssued,
      tenantId: si.tenantId,
      companyId: si.companyId,
      actorId: si.createdBy,
      aggregateType: 'site.instruction',
      aggregateId: si.id,
      payload: { reference: si.reference, projectId: si.projectId, costImplication: si.costImplication, timeImplication: si.timeImplication },
    });

    await this.tx.run(async (handle) => {
      await this.siteInstructionStore.save(si, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Site instruction issued: ${si.reference} on project ${si.projectId}`);
    return si;
  }

  async acknowledgeSiteInstruction(tenantId: Id, id: Id): Promise<SiteInstruction> {
    const si = await this.siteInstructionStore.findById(id, tenantId);
    if (!si) throw new Error(`site instruction ${id} not found`);
    const updated = acknowledgeInstruction(si);
    await this.tx.run(async (handle) => {
      await this.siteInstructionStore.save(updated, handle);
    });
    return updated;
  }

  async closeSiteInstruction(tenantId: Id, id: Id): Promise<SiteInstruction> {
    const si = await this.siteInstructionStore.findById(id, tenantId);
    if (!si) throw new Error(`site instruction ${id} not found`);
    const updated = closeInstruction(si);
    const event = makeEvent({
      type: SITE_EVENT.instructionClosed,
      tenantId, companyId: si.companyId, actorId: null,
      aggregateType: 'site.instruction', aggregateId: id,
      payload: { reference: si.reference },
    });
    await this.tx.run(async (handle) => {
      await this.siteInstructionStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  listSiteInstructions(tenantId: Id): Promise<SiteInstruction[]> {
    return this.siteInstructionStore.findAll(tenantId);
  }

  /** Paged variant — low-growth list, windowed over findAll (gap #9 tail). */
  async listSiteInstructionsPaged(tenantId: Id, page: PageParams): Promise<Page<SiteInstruction>> {
    return paginate(await this.siteInstructionStore.findAll(tenantId), page);
  }

  // ── Material Consumption ───────────────────────────────────────────────────

  async createMaterialConsumption(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    date: string;
    itemId: string;
    itemName: string;
    quantityConsumed: number;
    unit: string;
    createdBy?: string;
  }): Promise<MaterialConsumption> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'site.consumption.log', orgPath });
    }

    const consumption = makeMaterialConsumption(input);
    const event = makeEvent({
      type: SITE_EVENT.materialConsumed,
      tenantId: consumption.tenantId,
      companyId: consumption.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'site.material_consumption',
      aggregateId: consumption.id,
      payload: { itemId: consumption.itemId, itemName: consumption.itemName, quantityConsumed: consumption.quantityConsumed, unit: consumption.unit, projectId: consumption.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.materialConsumptionStore.save(consumption, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Material consumption logged: ${consumption.quantityConsumed} ${consumption.unit} of ${consumption.itemName}`);
    return consumption;
  }

  listMaterialConsumption(tenantId: Id): Promise<MaterialConsumption[]> {
    return this.materialConsumptionStore.findAll(tenantId);
  }

  /** Paged variant — low-growth list, windowed over findAll (gap #9 tail). */
  async listMaterialConsumptionPaged(tenantId: Id, page: PageParams): Promise<Page<MaterialConsumption>> {
    return paginate(await this.materialConsumptionStore.findAll(tenantId), page);
  }

  // ── Labour allocation (manpower by trade) ───────────────────────────────────

  async createLabourAllocation(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    date: string;
    trade: string;
    headcount: number;
    hours: number;
    costRate?: number;
    cbsNodeId?: string | null;
    subcontractorName?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<LabourAllocation> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'site.labour.log', orgPath });
    }
    const allocation = makeLabourAllocation(input);
    // Carry the labour cost + coding so the Transaction Engine posts it as ACTUAL on the CBS line.
    const event = makeEvent({
      type: SITE_EVENT.labourLogged,
      tenantId: allocation.tenantId,
      companyId: allocation.companyId,
      actorId: allocation.createdBy,
      aggregateType: 'site.labour',
      aggregateId: allocation.id,
      payload: {
        projectId: allocation.projectId,
        cbsNodeId: allocation.cbsNodeId,
        trade: allocation.trade,
        manHours: allocation.manHours,
        costRate: allocation.costRate,
        labourCost: allocation.labourCost,
      },
    });
    await this.tx.run(async (handle) => {
      await this.labourStore.save(allocation, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Labour logged: ${allocation.headcount}× ${allocation.trade} @ ${allocation.hours}h = ${allocation.manHours}mh (cost ${allocation.labourCost}) on ${allocation.projectId}`);
    return allocation;
  }

  listLabourAllocations(tenantId: Id): Promise<LabourAllocation[]> {
    return this.labourStore.findAll(tenantId);
  }

  /** Paged variant — low-growth list, windowed over findAll (gap #9 tail). */
  async listLabourAllocationsPaged(tenantId: Id, page: PageParams): Promise<Page<LabourAllocation>> {
    return paginate(await this.labourStore.findAll(tenantId), page);
  }

  /** Manpower rolled up by trade for a project (headcount + man-hours). */
  async labourByTrade(tenantId: Id, projectId: Id): Promise<TradeManHours[]> {
    const rows = await this.labourStore.findByProject(projectId, tenantId);
    return summariseByTrade(rows);
  }

  // ── Plant / equipment usage ─────────────────────────────────────────────────

  async createPlantUsage(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    cbsNodeId?: string | null;
    date: string;
    equipment: string;
    hours: number;
    rate?: number;
    notes?: string;
    createdBy?: string;
  }): Promise<PlantUsage> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'site.labour.log', orgPath });
    }
    const usage = makePlantUsage(input);
    // Carry the plant cost + coding so the Transaction Engine posts it as ACTUAL on the CBS line.
    const event = makeEvent({
      type: SITE_EVENT.plantLogged,
      tenantId: usage.tenantId,
      companyId: usage.companyId,
      actorId: usage.createdBy,
      aggregateType: 'site.plant',
      aggregateId: usage.id,
      payload: {
        projectId: usage.projectId,
        cbsNodeId: usage.cbsNodeId,
        equipment: usage.equipment,
        hours: usage.hours,
        rate: usage.rate,
        cost: usage.cost,
      },
    });
    await this.tx.run(async (handle) => {
      await this.plantStore.save(usage, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Plant logged: ${usage.equipment} @ ${usage.hours}h × ${usage.rate} = ${usage.cost} on ${usage.projectId}`);
    return usage;
  }

  listPlantUsage(tenantId: Id): Promise<PlantUsage[]> {
    return this.plantStore.findAll(tenantId);
  }

  // ── Installation records (physical work fixed in place = INSTALLED quantity) ────────────────

  async createInstallation(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    boqItemId: string;
    cbsNodeId?: string | null;
    date: string;
    description: string;
    quantity: number;
    unit?: string | null;
    notes?: string;
    createdBy?: string;
  }): Promise<InstallationRecord> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'site.labour.log', orgPath });
    }
    const record = makeInstallationRecord(input);
    // Carry the installed quantity + BOQ coding so the Quantity Ledger posts +installed on this line.
    const event = makeEvent({
      type: SITE_EVENT.installationRecorded,
      tenantId: record.tenantId,
      companyId: record.companyId,
      actorId: record.createdBy,
      aggregateType: 'site.installation',
      aggregateId: record.id,
      payload: {
        projectId: record.projectId,
        boqItemId: record.boqItemId,
        cbsNodeId: record.cbsNodeId,
        quantity: record.quantity,
        unit: record.unit,
        description: record.description,
      },
    });
    await this.tx.run(async (handle) => {
      await this.installationStore.save(record, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Installed: ${record.quantity} ${record.unit} of "${record.description}" (BOQ ${record.boqItemId}) on ${record.projectId}`);
    return record;
  }

  listInstallations(tenantId: Id): Promise<InstallationRecord[]> {
    return this.installationStore.findAll(tenantId);
  }

  // ── Site Surveys (Field survey intake → auto Opportunity creation) ─────────

  async createSurvey(input: NewSiteSurvey): Promise<SiteSurvey> {
    const survey = makeSiteSurvey(input);
    const event = makeEvent({
      type: SITE_EVENT.surveyCompleted,
      tenantId: survey.tenantId,
      companyId: survey.companyId,
      actorId: survey.createdBy,
      aggregateType: 'site.survey',
      aggregateId: survey.id,
      payload: {
        reference: survey.reference,
        clientEntityId: survey.clientEntityId,
        operationId: survey.operationId,
        accountId: survey.accountId,
        accountName: survey.accountName,
        siteAddress: survey.siteAddress,
        scopeNotes: survey.scopeNotes,
        estimatedValue: survey.estimatedValue,
        surveyDate: survey.surveyDate,
      },
    });

    await this.events.append([event]);
    this.logger.log(`Site Survey completed: ${survey.reference} (${survey.id}) for ${survey.accountName || survey.siteAddress}`);
    return survey;
  }
}
