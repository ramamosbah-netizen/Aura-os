import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent, type Page, type PageParams, paginate } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type DailyReport, makeDailyReport } from './domain/daily-report';
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

import {
  type DailyReportStore,
  type DelayLogStore,
  type MaterialConsumptionStore,
  type SiteInstructionStore,
  type LabourAllocationStore,
  type PlantUsageStore,
  type InstallationStore,
  type DailyReportFilter,
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
    date: string;
    workDescription: string;
    manpowerCount?: number;
    equipmentCount?: number;
    createdBy?: string;
  }): Promise<DailyReport> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'site.daily_report.create', orgPath });
    }

    const report = makeDailyReport(input);

    await this.tx.run(async (handle) => {
      await this.dailyReportStore.save(report, handle);
    });

    this.logger.log(`Daily Report drafted: ${report.date} for project ${report.projectId}`);
    return report;
  }

  async submitDailyReport(tenantId: Id, actorId: Id | null, id: Id): Promise<DailyReport> {
    const report = await this.dailyReportStore.findById(id, tenantId);
    if (!report) throw new Error(`Daily report with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (report.companyId) orgPath.push({ level: 'company', id: report.companyId });
      this.access.assert(actorId, { permission: 'site.daily_report.submit', orgPath });
    }

    report.status = 'submitted';
    report.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: SITE_EVENT.dailyReportSubmitted,
      tenantId: report.tenantId,
      companyId: report.companyId,
      actorId,
      aggregateType: 'site.daily_report',
      aggregateId: report.id,
      payload: { date: report.date, projectId: report.projectId, manpowerCount: report.manpowerCount },
    });

    await this.tx.run(async (handle) => {
      await this.dailyReportStore.save(report, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Daily Report submitted: ${report.date} (${report.id})`);
    return report;
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
