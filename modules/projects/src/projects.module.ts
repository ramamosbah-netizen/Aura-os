import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { CoreModule, PG_POOL } from '@aura/core';
import { PROJECT_STORE } from './project-store';
import { InMemoryProjectStore } from './in-memory-project-store';
import { PostgresProjectStore } from './postgres-project-store';
import { ProjectService } from './project.service';

import { WBS_STORE } from './wbs-store';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { PostgresWbsStore } from './postgres-wbs-store';
import { WbsService } from './wbs.service';

import { CBS_STORE } from './cbs-store';
import { InMemoryCbsStore } from './in-memory-cbs-store';
import { PostgresCbsStore } from './postgres-cbs-store';
import { CbsService } from './cbs.service';
import { COST_LEDGER_STORE } from './cost-ledger-store';
import { InMemoryCostLedgerStore } from './in-memory-cost-ledger-store';
import { PostgresCostLedgerStore } from './postgres-cost-ledger-store';
import { CostLedgerService } from './cost-ledger.service';
import { QUANTITY_LEDGER_STORE } from './quantity-ledger-store';
import { InMemoryQuantityLedgerStore } from './in-memory-quantity-ledger-store';
import { PostgresQuantityLedgerStore } from './postgres-quantity-ledger-store';
import { QuantityLedgerService } from './quantity-ledger.service';

import { DELAY_STORE, EOT_STORE } from './delay-eot-store';
import { InMemoryDelayStore, InMemoryEotStore } from './in-memory-delay-eot-store';
import { PostgresDelayStore, PostgresEotStore } from './postgres-delay-eot-store';
import { DelayEotService } from './delay-eot.service';

import { VARIATION_STORE } from './variation-store';
import { InMemoryVariationStore } from './in-memory-variation-store';
import { PostgresVariationStore } from './postgres-variation-store';
import { VariationService } from './variation.service';

import { CLOSEOUT_STORE } from './closeout-store';
import { CloseoutReadinessService } from './closeout-readiness.service';
import { CLOSEOUT_READINESS_GATE } from './closeout.service';
import { CLOSEOUT_LIFECYCLE } from './project.service';
import { ProjectHealthService } from './project-health.service';
import { InMemoryCloseoutStore } from './in-memory-closeout-store';
import { PostgresCloseoutStore } from './postgres-closeout-store';
import { CloseoutService } from './closeout.service';

import { CASHFLOW_FORECAST_STORE } from './cashflow-forecast-store';
import { InMemoryCashflowForecastStore } from './in-memory-cashflow-forecast-store';
import { PostgresCashflowForecastStore } from './postgres-cashflow-forecast-store';
import { CashflowForecastService } from './cashflow-forecast.service';

import { SCHEDULE_STORE } from './schedule-store';
import { InMemoryScheduleStore } from './in-memory-schedule-store';
import { PostgresScheduleStore } from './postgres-schedule-store';
import { ScheduleService } from './schedule.service';
// §22 Step 7/9 — the cross-project capacity resolver's store, and planning-run persistence.
import { RESOURCE_FACTS_STORE } from './resource-facts-store';
import { InMemoryResourceFactsStore } from './in-memory-resource-facts-store';
import { PostgresResourceFactsStore } from './postgres-resource-facts-store';
import { PLANNING_RUN_STORE } from './planning-run-store';
import { InMemoryPlanningRunStore } from './in-memory-planning-run-store';
import { PostgresPlanningRunStore } from './postgres-planning-run-store';
// §21 — two registers, two ports, two services, plus the one command that spans them.
import { PROJECT_RISK_STORE } from './project-risk-store';
import { PROJECT_ISSUE_STORE } from './project-issue-store';
import { InMemoryProjectRiskStore } from './in-memory-project-risk-store';
import { InMemoryProjectIssueStore } from './in-memory-project-issue-store';
import { PostgresProjectRiskStore } from './postgres-project-risk-store';
import { PostgresProjectIssueStore } from './postgres-project-issue-store';
import { ProjectRiskService } from './project-risk.service';
import { ProjectIssueService } from './project-issue.service';
import { ProjectRiskMaterialisationService } from './project-risk-materialisation.service';

import { DELIVERY_ITEM_MAP_STORE } from './delivery-item-map-store';
import { InMemoryDeliveryItemMapStore } from './in-memory-delivery-item-map-store';
import { PostgresDeliveryItemMapStore } from './postgres-delivery-item-map-store';
import { DeliveryItemMapService } from './delivery-item-map.service';
import { ProjectsProjectResolvers } from './project-resolvers';

/** The Projects business module — same shape as the rest of the deal chain (the template). */
@Module({
  imports: [CoreModule],
  providers: [
    // Tells the permission guard which project each record belongs to, so entity-addressed
    // routes can be authorised by a project-scoped grant. See project-resolvers.ts.
    ProjectsProjectResolvers,
    {
      provide: PROJECT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresProjectStore(pool) : new InMemoryProjectStore(),
    },
    {
      provide: WBS_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresWbsStore(pool) : new InMemoryWbsStore(),
    },
    {
      provide: CBS_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCbsStore(pool) : new InMemoryCbsStore(),
    },
    {
      provide: DELAY_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDelayStore(pool) : new InMemoryDelayStore(),
    },
    {
      provide: EOT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresEotStore(pool) : new InMemoryEotStore(),
    },
    {
      provide: VARIATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresVariationStore(pool) : new InMemoryVariationStore(),
    },
    {
      provide: CLOSEOUT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCloseoutStore(pool) : new InMemoryCloseoutStore(),
    },
    {
      provide: CASHFLOW_FORECAST_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCashflowForecastStore(pool) : new InMemoryCashflowForecastStore(),
    },
    {
      provide: SCHEDULE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresScheduleStore(pool) : new InMemoryScheduleStore(),
    },
    {
      provide: RESOURCE_FACTS_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresResourceFactsStore(pool) : new InMemoryResourceFactsStore(),
    },
    {
      provide: PLANNING_RUN_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresPlanningRunStore(pool) : new InMemoryPlanningRunStore(),
    },
    {
      provide: DELIVERY_ITEM_MAP_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDeliveryItemMapStore(pool) : new InMemoryDeliveryItemMapStore(),
    },
    {
      provide: PROJECT_RISK_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresProjectRiskStore(pool) : new InMemoryProjectRiskStore(),
    },
    {
      provide: PROJECT_ISSUE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresProjectIssueStore(pool) : new InMemoryProjectIssueStore(),
    },
    {
      provide: COST_LEDGER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresCostLedgerStore(pool) : new InMemoryCostLedgerStore(),
    },
    {
      provide: QUANTITY_LEDGER_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresQuantityLedgerStore(pool) : new InMemoryQuantityLedgerStore(),
    },
    ProjectService,
    WbsService,
    CbsService,
    CostLedgerService,
    QuantityLedgerService,
    DelayEotService,
    VariationService,
    ProjectRiskService,
    ProjectIssueService,
    ProjectRiskMaterialisationService,
    CloseoutService,
    CloseoutReadinessService,
    ProjectHealthService,
    // Bound HERE rather than at the composition root, because the port and its implementation are
    // both inside this module — the gate is Projects governing itself. The cross-module readings it
    // assembles still arrive through ports bound in GatesModule, so the ADR-0004 boundary holds.
    { provide: CLOSEOUT_READINESS_GATE, useExisting: CloseoutReadinessService },
    // The same verdict, feeding the lifecycle rather than the close itself. `closeout → completed`
    // and the legacy `active → completed` both defer to §27 instead of restating its rules, and an
    // unbound port reads as UNKNOWN — which refuses completion. That is the safe direction, but it
    // is not a working system, so this wire is what makes a project completable at all.
    { provide: CLOSEOUT_LIFECYCLE, useExisting: CloseoutReadinessService },
    CashflowForecastService,
    ScheduleService,
    DeliveryItemMapService,
  ],
  exports: [ProjectService, WbsService, CbsService, CostLedgerService, QuantityLedgerService, DelayEotService, VariationService, ProjectRiskService, ProjectIssueService, ProjectRiskMaterialisationService, CloseoutService, CashflowForecastService, ScheduleService, DeliveryItemMapService, CloseoutReadinessService, ProjectHealthService],
})
export class ProjectsModule {}
