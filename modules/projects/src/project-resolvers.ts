import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ProjectResolverRegistry } from '@aura/core';
import { WBS_STORE, type WbsStore } from './wbs-store';
import { CBS_STORE, type CbsStore } from './cbs-store';
import { VARIATION_STORE, type VariationStore } from './variation-store';
import { PROJECT_RISK_STORE, type ProjectRiskStore } from './project-risk-store';
import { PROJECT_ISSUE_STORE, type ProjectIssueStore } from './project-issue-store';
import { DELAY_STORE, EOT_STORE, type DelayStore, type EotStore } from './delay-eot-store';
import { CLOSEOUT_STORE, type CloseoutStore } from './closeout-store';
import { PLANNING_RUN_STORE, type PlanningRunStore } from './planning-run-store';
import { DELIVERY_ITEM_MAP_STORE, type DeliveryItemMapStore } from './delivery-item-map-store';

/**
 * Project Delivery tells the permission guard which project each of its records belongs to.
 *
 * This module is where the pattern matters most and is easiest to overlook: a WBS node, a
 * variation, a risk, an EOT claim and a closeout all belong to exactly one project, and every route
 * that acts on one names it by its own id. See `core/src/identity/project-resolver.ts`.
 *
 * `project` itself is not registered — a project IS the scope, and resolving it to itself adds
 * nothing the guard does not already have from the route's `:projectId`.
 */
@Injectable()
export class ProjectsProjectResolvers implements OnModuleInit {
  constructor(
    private readonly registry: ProjectResolverRegistry,
    @Inject(WBS_STORE) private readonly wbs: WbsStore,
    @Inject(CBS_STORE) private readonly cbs: CbsStore,
    @Inject(VARIATION_STORE) private readonly variations: VariationStore,
    @Inject(PROJECT_RISK_STORE) private readonly risks: ProjectRiskStore,
    @Inject(PROJECT_ISSUE_STORE) private readonly issues: ProjectIssueStore,
    @Inject(DELAY_STORE) private readonly delays: DelayStore,
    @Inject(EOT_STORE) private readonly eots: EotStore,
    @Inject(CLOSEOUT_STORE) private readonly closeouts: CloseoutStore,
    @Inject(PLANNING_RUN_STORE) private readonly runs: PlanningRunStore,
    @Inject(DELIVERY_ITEM_MAP_STORE) private readonly maps: DeliveryItemMapStore,
  ) {}

  onModuleInit(): void {
    // The entity names are the singular forms the guard derives from the route, so `wbs` → `wb`
    // and `cbs` → `cb`. Ugly, and deliberately not prettified: matching the guard is what makes a
    // registration reach the route it is for.
    this.registry.register('projects', 'wb', async (id) => (await this.wbs.get(id))?.projectId ?? null);
    this.registry.register('projects', 'cb', async (id) => (await this.cbs.get(id))?.projectId ?? null);
    this.registry.register('projects', 'variation', async (id) => (await this.variations.get(id))?.projectId ?? null);
    this.registry.register('projects', 'risk', async (id) => (await this.risks.get(id))?.projectId ?? null);
    this.registry.register('projects', 'issue', async (id) => (await this.issues.get(id))?.projectId ?? null);
    this.registry.register('projects', 'delay', async (id) => (await this.delays.get(id))?.projectId ?? null);
    this.registry.register('projects', 'eot-claim', async (id) => (await this.eots.get(id))?.projectId ?? null);
    this.registry.register('projects', 'closeout', async (id) => (await this.closeouts.get(id))?.projectId ?? null);
    this.registry.register('projects', 'planning-run', async (id) => (await this.runs.get(id))?.projectId ?? null);
    this.registry.register('projects', 'delivery-item-map', async (id) => (await this.maps.get(id))?.projectId ?? null);
  }
}
