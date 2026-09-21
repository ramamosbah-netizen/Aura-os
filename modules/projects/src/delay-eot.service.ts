import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull, type AccessTarget, type OrgLevel } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  type DelayEvent, type NewDelayEvent, makeDelayEvent, assessDelay, type DelayStatus,
  type EotClaim, type NewEotClaim, makeEotClaim,
  submitEotClaim as submitEotClaimDomain,
  decideEotClaim as decideEotClaimDomain, type EotStatus,
  calculateDelayAnalysis, type DelayAnalysisSummary,
} from './domain/delay-eot';
import { DELAY_STORE, EOT_STORE, type DelayFilter, type DelayStore, type EotFilter, type EotStore } from './delay-eot-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';

@Injectable()
export class DelayEotService {
  private readonly logger = new Logger('DelayEotService');

  constructor(
    @Inject(DELAY_STORE) private readonly delays: DelayStore,
    @Inject(EOT_STORE) private readonly eotClaims: EotStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  // ── DELAY EVENTS ─────────────────────────────────────────────────────

  async createDelay(input: NewDelayEvent & { actorId?: Id | null }): Promise<DelayEvent> {
    await this.assertProjectAccess(input.projectId, input.tenantId, input.actorId, 'projects.delay.create');
    const event = makeDelayEvent(input);
    await this.delays.create(event);
    this.logger.log(`Delay event created: ${event.title} (${event.causeCategory}, ${event.delayDays}d)`);

    await this.events.append([
      makeEvent({
        type: 'projects.delay.created',
        tenantId: event.tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'projects.delay',
        aggregateId: event.id,
        payload: { title: event.title, causeCategory: event.causeCategory, delayDays: event.delayDays },
      }),
    ]);

    return event;
  }

  async updateDelayStatus(id: Id, status: DelayStatus): Promise<DelayEvent> {
    const existing = assertSameTenant(await this.delays.get(id), this.tenant?.boundTenantId(), 'Delay event', id);
    await this.assertProjectOwnership(existing.projectId, existing.tenantId);
    const updated: DelayEvent = { ...existing, status };
    await this.delays.update(updated);
    this.logger.log(`Delay event ${id} status → ${status}`);
    return updated;
  }

  /**
   * Record what a named person concluded about a delay's impact.
   *
   * The figure is the ASSESSOR'S, not the system's. The derived impact is offered beside it on
   * every read and the two are allowed to disagree — a claim was submitted against the plan as it
   * then stood, and the plan moves. Rewriting the submitted figure whenever somebody edited an
   * activity would quietly rewrite history; hiding that the plan had moved would be worse.
   */
  async assessDelay(input: {
    tenantId: Id; delayId: Id; impactWorkingDays: number; note?: string | null; actorId?: Id | null;
  }): Promise<DelayEvent> {
    const delay = await this.delays.get(input.delayId);
    if (!delay || delay.tenantId !== input.tenantId) throw new Error(`delay ${input.delayId} not found`);
    await this.assertProjectAccess(delay.projectId, delay.tenantId, input.actorId, 'projects.delay.assess');

    const assessed = assessDelay(delay, {
      impactWorkingDays: input.impactWorkingDays, note: input.note, actorId: input.actorId,
    });
    await this.delays.update(assessed);
    await this.events.append([
      makeEvent({
        type: 'projects.delay.assessed',
        tenantId: assessed.tenantId, companyId: null, actorId: input.actorId ?? null,
        aggregateType: 'projects.delay', aggregateId: assessed.id,
        payload: { projectId: assessed.projectId, impactWorkingDays: assessed.assessedImpactWorkingDays },
      }),
    ]);
    this.logger.log(`Delay ${assessed.id} assessed at ${assessed.assessedImpactWorkingDays} working day(s) of impact`);
    return assessed;
  }

  /**
   * Name the activities a delay hit — canonically, replacing whatever was named before.
   *
   * Wholesale, because which activities an event hit is one fact about it: half-written it is a
   * different claim. An activity from another project is refused rather than recorded.
   */
  async setDelayActivities(input: { tenantId: Id; delayId: Id; taskIds: Id[]; actorId?: Id | null }): Promise<DelayEvent> {
    const delay = await this.delays.get(input.delayId);
    if (!delay || delay.tenantId !== input.tenantId) throw new Error(`delay ${input.delayId} not found`);
    await this.assertProjectAccess(delay.projectId, delay.tenantId, input.actorId, 'projects.delay.assess');
    const updated = { ...delay, affectedTaskIds: [...new Set(input.taskIds)] };
    await this.delays.update(updated);
    return updated;
  }

  async listDelays(filter?: DelayFilter): Promise<DelayEvent[]> {
    return this.delays.list(filter);
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async getDelay(id: Id): Promise<DelayEvent | null> {
    return sameTenantOrNull(await this.delays.get(id), this.tenant?.boundTenantId());
  }

  // ── EOT CLAIMS ───────────────────────────────────────────────────────

  async createEotClaim(input: NewEotClaim & { actorId?: Id | null }): Promise<EotClaim> {
    await this.assertProjectAccess(input.projectId, input.tenantId, input.actorId, 'projects.eot-claim.create');
    // The claim now carries its author. It had no `created_by` column at all.
    const claim = makeEotClaim({ ...input, createdBy: input.createdBy ?? input.actorId ?? null });
    await this.eotClaims.create(claim);
    this.logger.log(`EOT Claim #${claim.claimNumber} created: ${claim.title} (${claim.submittedDays}d)`);

    await this.events.append([
      makeEvent({
        type: 'projects.eot.created',
        tenantId: claim.tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'projects.eot',
        aggregateId: claim.id,
        payload: { claimNumber: claim.claimNumber, submittedDays: claim.submittedDays },
      }),
    ]);

    return claim;
  }

  async submitEotClaim(id: Id, actorId?: Id | null): Promise<EotClaim> {
    const existing = assertSameTenant(await this.eotClaims.get(id), this.tenant?.boundTenantId(), 'EOT Claim', id);
    await this.assertProjectAccess(existing.projectId, existing.tenantId, actorId, 'projects.eot-claim.submit');
    // The transition and its rules live in the domain now; this recorded only a timestamp.
    const updated = submitEotClaimDomain(existing, actorId ?? null);
    await this.eotClaims.update(updated);
    this.logger.log(`EOT Claim #${existing.claimNumber} submitted`);
    return updated;
  }

  /**
   * Record the client's determination.
   *
   * `decidedBy` IS NULLABLE NOW, and that is the point. The controller passed
   * `ctx.actorId ?? 'system'`, so an unauthenticated determination was attributed to a principal
   * named "system" that exists in no roster — the same fabrication wave C removed when an approval
   * was allowed to stand in for a review that never happened. An unsigned determination is recorded
   * as unsigned; `eotSeparation` then reports `unverifiable` rather than a clean bill of health.
   */
  async decideEotClaim(id: Id, decision: {
    status: 'approved' | 'partially_approved' | 'rejected';
    approvedDays: number;
    decidedBy: string | null;
    revisedCompletionDate?: string | null;
  }): Promise<EotClaim> {
    const existing = assertSameTenant(await this.eotClaims.get(id), this.tenant?.boundTenantId(), 'EOT Claim', id);
    await this.assertProjectAccess(existing.projectId, existing.tenantId, decision.decidedBy, 'projects.eot-claim.decide');
    const updated = decideEotClaimDomain(existing, decision, decision.decidedBy);
    await this.eotClaims.update(updated);
    this.logger.log(`EOT Claim #${existing.claimNumber} decided: ${decision.status} (${decision.approvedDays}d approved)`);

    await this.events.append([
      makeEvent({
        type: 'projects.eot.decided',
        tenantId: updated.tenantId,
        companyId: null,
        actorId: decision.decidedBy,
        aggregateType: 'projects.eot',
        aggregateId: updated.id,
        payload: { status: decision.status, approvedDays: decision.approvedDays },
      }),
    ]);

    return updated;
  }

  async listEotClaims(filter?: EotFilter): Promise<EotClaim[]> {
    return this.eotClaims.list(filter);
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async getEotClaim(id: Id): Promise<EotClaim | null> {
    return sameTenantOrNull(await this.eotClaims.get(id), this.tenant?.boundTenantId());
  }

  // ── ANALYSIS ─────────────────────────────────────────────────────────

  async getDelayAnalysis(projectId: Id): Promise<DelayAnalysisSummary> {
    const [delays, eots] = await Promise.all([
      this.delays.list({ projectId }),
      this.eotClaims.list({ projectId }),
    ]);
    return calculateDelayAnalysis(delays, eots);
  }

  private async assertProjectOwnership(projectId: Id, tenantId: Id): Promise<void> {
    if (!this.projects) return;
    const project = await this.projects.get(projectId);
    if (!project || project.tenantId !== tenantId) throw new Error(`project ${projectId} not found`);
  }

  /**
   * ONE PERMISSION FOR EVERY ACT IN THIS SERVICE, AND IT WAS THE WRONG ONE.
   *
   * This asserted `projects.project.update` — "edit the project" — for creating a delay event,
   * assessing it, raising an EOT claim, submitting that claim and DETERMINING it. Measured against
   * the shipped catalogue:
   *
   *   r-commercial-manager  NAMES projects.eot-claim.*  holds projects.project.update? NO
   *   r-planning-engineer   NAMES projects.delay.*      holds projects.project.update? NO
   *   r-pm                  holds projects.*            so it did all of them
   *
   * The role whose job an EOT claim IS could not touch one (403 against the running API), the
   * Planning Engineer could not assess the delay behind it, and the only role that could do either
   * submitted a claim and determined it. That is the shape wave B removed from the permit to work,
   * where ASKING for a permit required the authority to GRANT one.
   *
   * The permission is now the act's own, passed in by each caller.
   */
  private async assertProjectAccess(projectId: Id, tenantId: Id, actorId: Id | null | undefined, permission: string): Promise<void> {
    await this.assertProjectOwnership(projectId, tenantId);
    if (actorId && this.access) {
      const target: AccessTarget = { permission, orgPath: [{ level: 'tenant' as OrgLevel, id: tenantId }], resource: { type: 'project', id: projectId } };
      this.access.assert(actorId, target);
    }
  }
}
