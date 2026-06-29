import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type DailyReport, makeDailyReport } from './domain/daily-report';
import { type DelayLog, makeDelayLog } from './domain/delay-log';
import { type MaterialConsumption, makeMaterialConsumption } from './domain/material-consumption';

export const DAILY_REPORT_STORE = Symbol('DAILY_REPORT_STORE');
export const DELAY_LOG_STORE = Symbol('DELAY_LOG_STORE');
export const MATERIAL_CONSUMPTION_STORE = Symbol('MATERIAL_CONSUMPTION_STORE');

import {
  type DailyReportStore,
  type DelayLogStore,
  type MaterialConsumptionStore,
} from './store.interface';

export const SITE_EVENT = {
  dailyReportSubmitted: 'site.daily_report.submitted',
  materialConsumed: 'site.material.consumed',
  delayLogged: 'site.delay.logged',
};

@Injectable()
export class SiteService {
  private readonly logger = new Logger('SiteControl');

  constructor(
    @Inject(DAILY_REPORT_STORE) private readonly dailyReportStore: DailyReportStore,
    @Inject(DELAY_LOG_STORE) private readonly delayLogStore: DelayLogStore,
    @Inject(MATERIAL_CONSUMPTION_STORE) private readonly materialConsumptionStore: MaterialConsumptionStore,
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
}
