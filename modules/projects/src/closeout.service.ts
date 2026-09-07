import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, type Id, makeEvent, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  CLOSEOUT_EVENT,
  type ProjectCloseout,
  type NewProjectCloseout,
  makeProjectCloseout,
  setCloseoutItem,
  finalizeCloseout,
} from './domain/closeout';
import { CLOSEOUT_STORE, type CloseoutFilter, type CloseoutStore } from './closeout-store';
import type { CloseoutReadiness } from './domain/closeout-readiness';

/**
 * Project Closeout service — the end-of-lifecycle handover workflow. Owns
 * `aura_projects_closeouts`, one per project, and emits `projects.closeout.*` on the spine.
 */
/**
 * The port through which finalization consults readiness.
 *
 * Declared here rather than imported so this service does not depend on the assembling service,
 * which depends on ports of its own. Optional at construction, authoritative when present.
 */
export interface CloseoutReadinessGate {
  assess(tenantId: string, projectId: string): Promise<CloseoutReadiness>;
}
export const CLOSEOUT_READINESS_GATE = Symbol('CLOSEOUT_READINESS_GATE');

@Injectable()
export class CloseoutService {
  private readonly logger = new Logger('Closeout');

  constructor(
    @Inject(CLOSEOUT_STORE) private readonly store: CloseoutStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(CLOSEOUT_READINESS_GATE) private readonly readiness: CloseoutReadinessGate | null = null,
  ) {}

  async start(input: NewProjectCloseout): Promise<ProjectCloseout> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'projects.closeout.create', orgPath };
      this.access.assert(input.createdBy, target);
    }
    const existing = await this.store.getByProject(input.tenantId, input.projectId);
    if (existing) throw new Error(`project ${input.projectId} already has a closeout`);

    const c = makeProjectCloseout(input);
    await this.store.create(c);
    await this.events.append([
      makeEvent({
        type: CLOSEOUT_EVENT.started,
        tenantId: c.tenantId, companyId: c.companyId, actorId: c.createdBy,
        aggregateType: 'projects.closeout', aggregateId: c.id,
        payload: { projectId: c.projectId, items: c.items.length },
      }),
    ]);
    this.logger.log(`Closeout started for project ${c.projectId} (${c.items.length} items)`);
    return c;
  }

  async setItem(tenantId: Id, id: Id, index: number, done: boolean): Promise<ProjectCloseout> {
    const c = await this.store.get(id);
    if (!c || c.tenantId !== tenantId) throw new Error(`closeout ${id} not found`);
    const updated = setCloseoutItem(c, index, done);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: CLOSEOUT_EVENT.itemUpdated,
        tenantId, companyId: c.companyId, actorId: null,
        aggregateType: 'projects.closeout', aggregateId: id,
        payload: { projectId: c.projectId, index, done },
      }),
    ]);
    return updated;
  }

  /**
   * Finalize — the write that ends a project, and the only place the readiness gate can actually
   * bind.
   *
   * Showing readiness on a screen is not a gate. Until this refused, the checklist was still the
   * whole rule: every box ticked closed a project with open critical NCRs and an incomplete SAT,
   * and the screen's warning was advice a caller could route around by calling the endpoint.
   *
   * BLOCKED and UNKNOWN are both refusals, and deliberately so. An unreadable domain is not a
   * lenient case — it is the one where nobody can say what is being closed. Treating it as a pass
   * would authorise exactly the close nobody verified.
   *
   * The permitting assessment is stamped into the completion event. The question this answers is
   * asked months later, in a dispute: "why was this project allowed to close that day?" A verdict
   * that lives only in the request that produced it cannot answer it.
   */
  async finalize(tenantId: Id, id: Id, handoverDate: string, dlpMonths?: number): Promise<ProjectCloseout> {
    const c = await this.store.get(id);
    if (!c || c.tenantId !== tenantId) throw new Error(`closeout ${id} not found`);

    let verdict: CloseoutReadiness | null = null;
    if (this.readiness) {
      verdict = await this.readiness.assess(tenantId, c.projectId);
      if (!verdict.ready) {
        const say = (label: string, items: { domain: string; detail?: string }[]): string[] =>
          items.map((i) => `${label} — ${i.domain}: ${i.detail ?? 'no detail'}`);
        throw new Error(
          `closeout is not ready: ${[...say('blocked', verdict.blocked), ...say('unverified', verdict.unknown)].join('; ')}`,
        );
      }
    }

    const updated = finalizeCloseout(c, handoverDate, dlpMonths);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: CLOSEOUT_EVENT.completed,
        tenantId, companyId: c.companyId, actorId: null,
        aggregateType: 'projects.closeout', aggregateId: id,
        payload: {
          projectId: c.projectId,
          handoverDate: updated.handoverDate,
          dlpEndDate: updated.dlpEndDate,
          // The evidence that permitted this close, as it stood at the moment it was permitted.
          readiness: verdict
            ? { ready: verdict.ready, checks: verdict.checks.map((k) => ({ id: k.id, domain: k.domain, state: k.state, detail: k.detail })) }
            : { ready: null, checks: [], note: 'no readiness gate was configured for this deployment' },
        },
      }),
    ]);
    this.logger.log(`Closeout completed for project ${c.projectId} — handover ${updated.handoverDate}, DLP ends ${updated.dlpEndDate}`);
    return updated;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<ProjectCloseout | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: CloseoutFilter): Promise<ProjectCloseout[]> {
    return this.store.list(filter);
  }

  listPaged(filter: CloseoutFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
