import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, assertSameTenant, type Id, makeEvent, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  VARIATION_EVENT,
  type VariationOrder,
  type VariationStatus,
  type NewVariationOrder,
  type VariationImpact,
  makeVariationOrder,
  variationImpact,
} from './domain/variation';
import { VARIATION_STORE, type VariationFilter, type VariationStore } from './variation-store';
import { ProjectService } from './project.service';

/**
 * Variation Orders service — contractual change orders against a project. Owns
 * `aura_projects_variations`, goes through the access seam, and emits `projects.variation.*`
 * on the spine. Approved variations roll up into the project's revised contract value.
 */
@Injectable()
export class VariationService {
  private readonly logger = new Logger('Variations');

  constructor(
    @Inject(VARIATION_STORE) private readonly store: VariationStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly projects: ProjectService,
    private readonly access: AccessService,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewVariationOrder): Promise<VariationOrder> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'projects.variation.create', orgPath };
      this.access.assert(input.createdBy, target);
    }
    const vo = makeVariationOrder(input);
    await this.store.create(vo);
    await this.events.append([
      makeEvent({
        type: VARIATION_EVENT.created,
        tenantId: vo.tenantId,
        companyId: vo.companyId,
        actorId: vo.createdBy,
        aggregateType: 'projects.variation',
        aggregateId: vo.id,
        payload: { projectId: vo.projectId, title: vo.title, type: vo.type, amount: vo.amount },
      }),
    ]);
    this.logger.log(`Variation created: ${vo.title} (${vo.type} ${vo.amount}) on project ${vo.projectId}`);
    return vo;
  }

  async changeStatus(id: Id, status: VariationStatus, actorId?: Id): Promise<VariationOrder> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'variation', id);
    const decided = status === 'approved' || status === 'rejected';
    const updated: VariationOrder = {
      ...existing,
      status,
      decidedBy: decided ? (actorId ?? existing.decidedBy) : existing.decidedBy,
      decidedAt: decided ? new Date().toISOString() : existing.decidedAt,
    };
    await this.store.update(updated);

    const eventType =
      status === 'submitted' ? VARIATION_EVENT.submitted
      : status === 'approved' ? VARIATION_EVENT.approved
      : status === 'rejected' ? VARIATION_EVENT.rejected
      : VARIATION_EVENT.created;

    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: actorId ?? null,
        aggregateType: 'projects.variation',
        aggregateId: updated.id,
        // cbsNodeId + signedAmount let the cost engine post a BUDGET change to the cost line on approval.
        payload: { projectId: updated.projectId, cbsNodeId: updated.cbsNodeId, title: updated.title, status, signedAmount: updated.signedAmount },
      }),
    ]);
    this.logger.log(`Variation ${updated.title} (${updated.id}) → ${status}`);
    return updated;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<VariationOrder | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: VariationFilter): Promise<VariationOrder[]> {
    return this.store.list(filter);
  }

  listPaged(filter: VariationFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }

  /** Project variation register + revised contract value (original + approved variations). */
  async getProjectSummary(
    tenantId: Id,
    projectId: Id,
  ): Promise<{ project: { id: Id; title: string; value: number } | null; variations: VariationOrder[]; impact: VariationImpact }> {
    const [project, variations] = await Promise.all([
      this.projects.get(projectId),
      this.store.list({ tenantId, projectId }),
    ]);
    const originalValue = project?.value ?? 0;
    return {
      project: project ? { id: project.id, title: project.title, value: project.value } : null,
      variations,
      impact: variationImpact(originalValue, variations),
    };
  }
}
