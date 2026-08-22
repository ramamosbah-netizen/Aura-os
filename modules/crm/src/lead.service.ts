import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, AccessDeniedError, assertSameTenant, type DomainEvent, type Id, makeEvent, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext, TX_RUNNER, type TxRunner, UsersService } from '@aura/core';
import {
  CRM_EVENT, type Lead, type NewLead, makeLead,
  LEAD_QUALIFICATION_EVENT, assessLeadQualification, normalizeLeadQualification,
  type LeadQualificationAssessment, type LeadQualificationDimensions,
} from '@aura/shared';
import { CRM_LEAD_STORE, type LeadFilter, type LeadStore } from './lead-store';
import { CRM_QUALIFICATION_DECISION_STORE, type QualificationDecisionStore } from './qualification-decision-store';
import { makeQualificationDecision, QUALIFICATION_DECISION_EVENT } from './domain/qualification-decision';

/**
 * Capability to (re)assign a lead to ANOTHER user. Deliberately OUTSIDE the `crm.lead.*` namespace:
 * `permissionMatches('crm.lead.*', 'crm.lead.assign.others')` is TRUE (a trailing `*` swallows all
 * remaining segments), so a permission under `crm.lead.` would be inherited by the sales-rep role
 * (`crm.lead.*`). A distinct top segment means only `crm.*` (sales manager) and `*` (admin) match it,
 * giving the manager/admin-only split WITHOUT editing the role catalog or tying authz to a role name.
 */
const PERM_ASSIGN_OTHERS = 'crm.lead-assignment.others';
/** The "works leads at all" capability — a self-claim requires it, and any assignee must hold it. */
const PERM_LEAD_WORK = 'crm.lead.read';

/** A user the acting caller is allowed to assign the lead to (already scoped by the backend policy). */
export interface AssignableUser {
  id: Id;
  displayName: string;
  email: string | null;
  /** True for the caller's own entry (self-assign / claim). */
  self: boolean;
}

@Injectable()
export class LeadService {
  private readonly logger = new Logger('CRM-Leads');

  constructor(
    @Inject(CRM_LEAD_STORE) private readonly store: LeadStore,
    @Inject(CRM_QUALIFICATION_DECISION_STORE) private readonly decisions: QualificationDecisionStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    // The identity user registry — used to validate an assignee (exists · same tenant · active) and
    // to build the assignable-users list. @Optional so no-DB/unit boots (empty registry) degrade
    // gracefully: an unpopulated registry treats unknown ids as active (incremental adoption).
    @Optional() @Inject(UsersService) private readonly users: UsersService | null = null,
  ) {}

  async create(input: NewLead & { actorId?: Id | null }): Promise<Lead> {
    if (input.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(input.actorId, target);
    }

    const lead = makeLead(input);
    const event = makeEvent({
      type: CRM_EVENT.leadCreated,
      tenantId: lead.tenantId,
      companyId: lead.companyId,
      actorId: input.actorId ?? null,
      aggregateType: 'crm.lead',
      aggregateId: lead.id,
      payload: { name: lead.name, companyName: lead.companyName, status: lead.status },
    });

    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, lead);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Lead created: ${lead.name} (${lead.id})`);
    return lead;
  }

  async update(
    id: Id,
    // NOTE: ownership fields (`assignedTo`/`assignedAt`) are deliberately NOT updatable here. Changing
    // an owner is an authorization boundary — it goes exclusively through `assign` (public, actor +
    // capability checked) or `autoAssign` (system routing). Allowing it as a plain field on the
    // generic PATCH would be a silent bypass of that boundary.
    updates: Partial<
      Pick<
        Lead,
        | 'name' | 'companyName' | 'email' | 'phone' | 'status' | 'source'
        | 'firstRespondedAt' | 'slaFirstResponseHours' | 'nextActivityDue'
        // G4 — the ELV commercial context, captured whenever it is learned.
        | 'requirement' | 'systems' | 'sector' | 'projectName' | 'projectLocation' | 'consultant'
        | 'mainContractor' | 'estimatedValue' | 'projectStage' | 'expectedTimeline'
      >
    >,
    actorId?: Id | null,
  ): Promise<Lead> {
    // The lead lifecycle keeps ONE public contract: PATCH :id { status }. A request that moves the
    // lead to `qualified` is a HUMAN qualification decision with a multi-table invariant (lead +
    // immutable decision + event), so it is routed to a private, DB-serialized transition rather
    // than an ordinary field update. Everything else is an ordinary update, unchanged.
    if (updates.status === 'qualified') return this.qualifyTransition(id, updates, actorId);
    return this.ordinaryUpdate(id, updates, actorId);
  }

  private async ordinaryUpdate(
    id: Id,
    updates: Partial<Lead>,
    actorId?: Id | null,
  ): Promise<Lead> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Lead', id);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(actorId, target);
    }

    // Defense in depth: even if a caller casts past the type, the generic update can NEVER change
    // ownership — that is the assign() boundary. Strip the fields before they can be spread on.
    const { assignedTo: _ignoredOwner, assignedAt: _ignoredOwnerAt, ...safeUpdates } = updates as Partial<Lead>;
    void _ignoredOwner; void _ignoredOwnerAt;

    const updated: Lead = {
      ...existing,
      ...safeUpdates,
      updatedAt: new Date().toISOString(),
    };

    const event = makeEvent({
      type: CRM_EVENT.leadUpdated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: actorId ?? null,
      aggregateType: 'crm.lead',
      aggregateId: updated.id,
      payload: { status: updated.status, changes: updates },
    });

    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Lead updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  /**
   * The human qualification decision, as ONE atomic, serialized transaction:
   *
   *   BEGIN
   *     SELECT lead … FOR UPDATE           -- lock the row: authoritative status + evidence
   *     authorize the real actor           -- a lock is not a permission
   *     fromStatus := lead.status          -- the state the human actually decided on
   *     if already qualified → no-op        -- qualified → qualified is not a new decision
   *     update lead → qualified
   *     append QualificationDecision         -- immutable snapshot of the LOCKED evidence
   *     append lifecycle event
   *   COMMIT                                -- any failure rolls back ALL of the above
   *
   * Invariant: a successful non-qualified → qualified transition produces EXACTLY one immutable
   * decision and one qualification event. A concurrent duplicate blocks on the row lock, then sees
   * the already-qualified row and records nothing — so the database, not an in-process check, is
   * the last line of defence against duplicates.
   */
  private async qualifyTransition(
    id: Id,
    updates: Partial<Lead>,
    actorId?: Id | null,
  ): Promise<Lead> {
    return this.tx.run(async (handle) => {
      // Lock + read authoritative pre-transition state INSIDE the transaction. Evidence
      // (qualificationDimensions) lives on this same row, so the lock also freezes the evidence
      // the decision is made on against concurrent edits.
      const existing = assertSameTenant(
        await this.store.getForUpdateWithClient(handle, id),
        this.tenant?.boundTenantId(), 'Lead', id,
      );

      // Authorization AFTER the lock — holding a row lock is not a permission. The actor is the
      // real request-context actor, never a client-supplied field, so a caller cannot record
      // someone else (or themselves) as `qualifiedBy` just by knowing a lead id.
      if (actorId) {
        const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
        if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
        const target: AccessTarget = { permission: 'crm.account.create', orgPath };
        this.access.assert(actorId, target);
      }

      const fromStatus = existing.status;
      const now = new Date().toISOString();
      const updated: Lead = { ...existing, ...updates, status: 'qualified', updatedAt: now };

      await this.store.updateWithClient(handle, updated);

      const events: DomainEvent[] = [
        makeEvent({
          type: CRM_EVENT.leadUpdated,
          tenantId: updated.tenantId,
          companyId: updated.companyId,
          actorId: actorId ?? null,
          aggregateType: 'crm.lead',
          aggregateId: updated.id,
          payload: { status: 'qualified', changes: updates },
        }),
      ];

      // qualified → qualified is NOT a new human decision: no snapshot, no qualification event.
      // Only a real transition into qualified records the immutable decision.
      if (fromStatus !== 'qualified') {
        // Assessment computed from the LOCKED evidence — the exact evidence at the human decision.
        const assessment = assessLeadQualification(existing.qualificationDimensions ?? {});
        const decision = makeQualificationDecision({
          tenantId: existing.tenantId,
          companyId: existing.companyId,
          leadId: existing.id,
          fromStatus,
          qualifiedBy: actorId ?? null,
          dimensions: existing.qualificationDimensions ?? {},
          assessment,
          reason: null,
        });
        await this.decisions.appendWithClient(handle, decision);
        events.push(makeEvent({
          type: QUALIFICATION_DECISION_EVENT.recorded,
          tenantId: existing.tenantId,
          companyId: existing.companyId,
          actorId: actorId ?? null,
          aggregateType: 'crm.lead',
          aggregateId: existing.id,
          payload: {
            decisionId: decision.id,
            fromStatus,
            toStatus: 'qualified',
            verdict: assessment.recommendation,
            score: assessment.score,
            coverage: assessment.coverage,
          },
        }));
        this.logger.log(
          `Lead qualified: ${updated.name} (${updated.id}) ${fromStatus} → qualified ` +
            `[decision ${decision.id}, verdict ${assessment.recommendation} ${assessment.score}/100]`,
        );
      }

      await this.events.appendWithClient(handle, events);
      return updated;
    });
  }

  private orgPathOf(lead: Pick<Lead, 'tenantId' | 'companyId'>): Array<{ level: OrgLevel; id: Id }> {
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: lead.tenantId }];
    if (lead.companyId) orgPath.push({ level: 'company', id: lead.companyId });
    return orgPath;
  }

  /**
   * Assign a lead to an owner — the PUBLIC authorization boundary, re-checked on the WRITE (the UI
   * list is never trusted). Phase-1 policy (tightenable to team/subtree when user→team membership
   * exists):
   *
   *   - The caller MUST be an authenticated actor. There is no null-actor bypass on this path: a
   *     missing actor is denied (403), because assignment identity comes from the auth context, not
   *     from a caller's choice. System routing uses `autoAssign` instead — a clearly separate door.
   *   - SELF-CLAIM of an UNASSIGNED lead → requires only the lead-work capability (a sales rep can
   *     pick up an unowned lead for themselves).
   *   - ASSIGN-TO-ANOTHER, or taking over an already-owned lead → requires the explicit
   *     `crm.lead-assignment.others` capability (sales manager / admin only; `crm.lead.*` does not
   *     grant it).
   *   - The ASSIGNEE is validated strictly: must exist in this tenant, be active, and be lead-capable
   *     — never an arbitrary string, never a cross-tenant id.
   *   - A REASSIGNMENT (moving off an existing owner A → B) requires a `reason`; a first assignment
   *     does not.
   *
   * SLA (proven from automation.ts): the first-response AND acceptance clocks both run from
   * `assignedAt`, so a genuine handover to a NEW owner correctly resets both. Re-assigning to the
   * SAME owner is an idempotent no-op — it must not restart the clock.
   */
  async assign(id: Id, assignedTo: Id, actorId?: Id | null, reason?: string | null): Promise<Lead> {
    if (!actorId) throw new AccessDeniedError('assigning a lead requires an authenticated actor');
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Lead', id);
    return this.applyAssignment(existing, assignedTo, actorId, reason, { enforceActorAuthz: true });
  }

  /**
   * Trusted INTERNAL routing (automation / SLA escalation). No human actor — the routing rule is the
   * authority, so actor-authorization is not applied; but the assignee is still validated (exists ·
   * same tenant · active) and the same audited `crm.lead.assigned` event + clock reset happen. This
   * is the ONLY sanctioned way to assign without an actor, and it is explicitly named so the public
   * path can stay strict.
   */
  async autoAssign(id: Id, assignedTo: Id, reason?: string | null): Promise<Lead> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Lead', id);
    return this.applyAssignment(existing, assignedTo, null, reason, { enforceActorAuthz: false });
  }

  private async applyAssignment(
    existing: Lead,
    assignedTo: Id,
    actorId: Id | null,
    reason: string | null | undefined,
    opts: { enforceActorAuthz: boolean },
  ): Promise<Lead> {
    const target = String(assignedTo ?? '').trim();
    if (!target) throw new Error('assignedTo is required'); // 400

    // Idempotent: assigning to the current owner changes nothing — no clock reset, no event.
    if (existing.assignedTo === target) return existing;

    const orgPath = this.orgPathOf(existing);
    const isReassignment = existing.assignedTo !== null; // there was a prior owner (A → B)

    if (opts.enforceActorAuthz) {
      // Self-claim of an unassigned lead needs only lead-work capability; anything else (assigning to
      // another user, or taking over an owned lead) needs the explicit reassign-others capability.
      const isSelfClaim = target === actorId && existing.assignedTo === null;
      const permission = isSelfClaim ? PERM_LEAD_WORK : PERM_ASSIGN_OTHERS;
      this.access.assert(actorId as Id, { permission, orgPath } satisfies AccessTarget);
    }

    // A reason is mandatory to move a lead off an existing owner — never on first assignment.
    if (isReassignment && !String(reason ?? '').trim()) {
      throw new Error('a reason is required to reassign a lead to a different owner'); // 400 (required)
    }

    this.assertAssignable(existing.tenantId, target, orgPath, { enforceCapability: opts.enforceActorAuthz });

    const now = new Date().toISOString();
    const updated: Lead = { ...existing, assignedTo: target, assignedAt: now, acceptedAt: null, updatedAt: now };

    const event = makeEvent({
      type: CRM_EVENT.leadAssigned,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: actorId ?? null,
      aggregateType: 'crm.lead',
      aggregateId: updated.id,
      // The full handover fact — the event stream IS the assignment history (append-only,
      // tenant-scoped), so no separate history table is introduced.
      payload: {
        fromAssignedTo: existing.assignedTo,
        toAssignedTo: target,
        assignedBy: actorId ?? null,
        assignedAt: now,
        reason: String(reason ?? '').trim() || null,
      },
    });

    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(
      `Lead assigned: ${updated.name} (${updated.id}) ${existing.assignedTo ?? '∅'} → ${target}` +
        (isReassignment ? ` (reassigned by ${actorId ?? 'system'})` : ''),
    );
    return updated;
  }

  /** True when this user may be handed a lead: existence/active (when the registry is populated) and
   *  lead-capability (only in an auth-on context — with grants unpopulated it would reject everyone). */
  private isLeadCapable(tenantId: Id, userId: Id, orgPath: Array<{ level: OrgLevel; id: Id }>, actorPresent: boolean): boolean {
    if (this.users) {
      if (!this.users.isActive(tenantId, userId)) return false;
      const roster = this.users.list(tenantId);
      if (roster.length > 0 && !this.users.get(tenantId, userId)) return false; // unknown in a populated registry
    }
    if (actorPresent && !this.access.can(userId, { permission: PERM_LEAD_WORK, orgPath }).allowed) return false;
    return true;
  }

  /**
   * Strict assignee validation on the write path — throws (400) rather than persist a bad owner.
   * Existence + active are checked whenever the registry is populated (which also rejects a
   * cross-tenant id: it is simply not a user in THIS tenant's registry). The lead-capability check
   * is applied when `enforceCapability` is set (the auth-on public path) — with grants unpopulated it
   * would reject everyone, so the trusted internal routing path skips it.
   */
  private assertAssignable(
    tenantId: Id,
    userId: Id,
    orgPath: Array<{ level: OrgLevel; id: Id }>,
    opts: { enforceCapability: boolean },
  ): void {
    if (this.users) {
      if (!this.users.isActive(tenantId, userId)) {
        throw new Error('the assignee must be an active user in this workspace'); // 400 (must)
      }
      const roster = this.users.list(tenantId);
      if (roster.length > 0 && !this.users.get(tenantId, userId)) {
        // Not in THIS tenant's registry — covers unknown ids AND cross-tenant ids alike.
        throw new Error('the assignee must be a user in this workspace'); // 400 (must)
      }
    }
    if (opts.enforceCapability && !this.access.can(userId, { permission: PERM_LEAD_WORK, orgPath }).allowed) {
      throw new Error('this user cannot be assigned leads — they are not a member of the sales team'); // 400 (cannot)
    }
  }

  /**
   * The users the CALLER may assign this lead to — computed by the backend, so the UI shows only what
   * is actually allowed (and the assign write re-checks anyway). A caller with the reassign-others
   * capability sees every lead-capable member of the tenant; otherwise they see only themselves
   * (self-claim). NOTE: this is tenant-scoped, NOT team-scoped — team/subtree narrowing is added when
   * a real user→team membership exists, without changing this contract.
   */
  async assignableUsers(id: Id, actorId?: Id | null): Promise<AssignableUser[]> {
    const existing = sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
    if (!existing) return [];
    const orgPath = this.orgPathOf(existing);
    const actorPresent = !!actorId;
    const canOthers = actorId ? this.access.can(actorId, { permission: PERM_ASSIGN_OTHERS, orgPath }).allowed : true;

    const roster = this.users ? this.users.list(existing.tenantId) : [];
    const capable = roster.filter((u) => this.isLeadCapable(existing.tenantId, u.userId, orgPath, actorPresent));

    if (canOthers) {
      const list: AssignableUser[] = capable.map((u) => ({
        id: u.userId, displayName: u.displayName, email: u.email, self: u.userId === actorId,
      }));
      // Guarantee the caller can at least self-assign even when the registry isn't populated.
      if (actorId && !list.some((x) => x.id === actorId) && this.isLeadCapable(existing.tenantId, actorId, orgPath, actorPresent)) {
        list.unshift({ id: actorId, displayName: 'You', email: null, self: true });
      }
      return list;
    }

    // Self-claim only.
    if (actorId && this.isLeadCapable(existing.tenantId, actorId, orgPath, actorPresent)) {
      const me = capable.find((u) => u.userId === actorId);
      return [me
        ? { id: me.userId, displayName: me.displayName, email: me.email, self: true }
        : { id: actorId, displayName: 'You', email: null, self: true }];
    }
    return [];
  }

  /**
   * G9 — the assignee ACKNOWLEDGES the assignment. Routing isn't ownership until someone says
   * "I have it"; this fact is what retires the ASSIGNMENT_NOT_ACCEPTED attention reason.
   * Idempotent: accepting an already-accepted lead keeps the original timestamp.
   */
  async accept(id: Id): Promise<Lead> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Lead', id);
    if (!existing.assignedTo) throw new Error('cannot accept an unassigned lead'); // "cannot" → 400 in the taxonomy
    if (existing.acceptedAt) return existing;
    const updated: Lead = { ...existing, acceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.store.update(updated);
    this.logger.log(`Lead accepted: ${updated.name} (${updated.id}) by ${updated.assignedTo}`);
    return updated;
  }

  /**
   * G3 — record the qualification assessment: the eight 0–100 dimensions + the qualifier's
   * reasoning. Returns the lead with the derived verdict alongside it.
   *
   * Dimensions MERGE rather than replace, because qualification is learned a piece at a time — a
   * call that establishes budget must not wipe the technical fit someone else rated yesterday.
   * Send an explicit null for a dimension to clear it back to unrated.
   *
   * The engine never changes `status`: it recommends, a human qualifies. That separation is the
   * whole point — an assessment is evidence, not a decision.
   */
  async assess(
    id: Id,
    input: { dimensions?: unknown; notes?: string | null },
    actorId?: Id | null,
  ): Promise<{ lead: Lead; assessment: LeadQualificationAssessment }> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Lead', id);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(actorId, target);
    }

    const incoming = normalizeLeadQualification(input.dimensions);
    const merged: LeadQualificationDimensions = { ...(existing.qualificationDimensions ?? {}), ...incoming };
    // An explicit null clears a dimension back to unrated — otherwise a wrong rating could never
    // be withdrawn, only overwritten with another number.
    if (input.dimensions && typeof input.dimensions === 'object') {
      for (const [k, v] of Object.entries(input.dimensions as Record<string, unknown>)) {
        if (v === null) delete merged[k as keyof LeadQualificationDimensions];
      }
    }

    const now = new Date().toISOString();
    const updated: Lead = {
      ...existing,
      qualificationDimensions: Object.keys(merged).length > 0 ? merged : null,
      qualificationNotes: input.notes === undefined ? existing.qualificationNotes : input.notes,
      qualificationAssessedAt: now,
      qualificationAssessedBy: actorId ?? null,
      updatedAt: now,
    };

    const assessment = assessLeadQualification(updated.qualificationDimensions ?? {});

    const event = makeEvent({
      type: LEAD_QUALIFICATION_EVENT.assessed,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: actorId ?? null,
      aggregateType: 'crm.lead',
      aggregateId: updated.id,
      // The verdict rides on the event so the timeline can show WHY, not just that it changed.
      payload: { score: assessment.score, confidence: assessment.confidence, recommendation: assessment.recommendation },
    });

    await this.tx.run(async (handle) => {
      await this.store.update(updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(
      `Lead assessed: ${updated.name} (${updated.id}) → ${assessment.score}/100 ` +
        `${assessment.confidence} confidence → ${assessment.recommendation}`,
    );
    return { lead: updated, assessment };
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Lead | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  /**
   * The immutable qualification decision history for a lead, newest first. Tenant-scoped: a lead the
   * caller's tenant cannot see yields an empty history, never another tenant's audit trail.
   */
  async qualificationDecisions(id: Id): Promise<import('./domain/qualification-decision').QualificationDecision[]> {
    const lead = sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
    if (!lead) return [];
    return this.decisions.listForLead(lead.tenantId, id);
  }

  list(filter?: LeadFilter): Promise<Lead[]> {
    return this.store.list(filter);
  }

  listPaged(filter: LeadFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
