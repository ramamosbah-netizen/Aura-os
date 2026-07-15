import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import {
  CRM_EVENT, type Lead, type NewLead, makeLead,
  LEAD_QUALIFICATION_EVENT, assessLeadQualification, normalizeLeadQualification,
  type LeadQualificationAssessment, type LeadQualificationDimensions,
} from '@aura/shared';
import { CRM_LEAD_STORE, type LeadFilter, type LeadStore } from './lead-store';

@Injectable()
export class LeadService {
  private readonly logger = new Logger('CRM-Leads');

  constructor(
    @Inject(CRM_LEAD_STORE) private readonly store: LeadStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
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
    updates: Partial<
      Pick<
        Lead,
        | 'name' | 'companyName' | 'email' | 'phone' | 'status' | 'source' | 'assignedTo' | 'assignedAt'
        | 'firstRespondedAt' | 'slaFirstResponseHours' | 'nextActivityDue'
        // G4 — the ELV commercial context, captured whenever it is learned.
        | 'requirement' | 'systems' | 'sector' | 'projectName' | 'projectLocation' | 'consultant'
        | 'mainContractor' | 'estimatedValue' | 'projectStage' | 'expectedTimeline'
      >
    >,
    actorId?: Id | null,
  ): Promise<Lead> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Lead ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(actorId, target);
    }

    const updated: Lead = {
      ...existing,
      ...updates,
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
      await this.store.update(updated); // Note: update does not support tx handle, so it runs directly (or we can add handle support)
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Lead updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  /** Assign a lead to an owner — stamps the SLA clock (assignedAt) and emits crm.lead.assigned. */
  async assign(id: Id, assignedTo: Id, actorId?: Id | null): Promise<Lead> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Lead ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(actorId, target);
    }

    const now = new Date().toISOString();
    // (Re)assigning resets the first-response clock; a fresh owner owns a fresh SLA.
    const updated: Lead = { ...existing, assignedTo, assignedAt: now, updatedAt: now };

    const event = makeEvent({
      type: CRM_EVENT.leadAssigned,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: actorId ?? null,
      aggregateType: 'crm.lead',
      aggregateId: updated.id,
      payload: { assignedTo, assignedAt: now },
    });

    await this.tx.run(async (handle) => {
      await this.store.update(updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Lead assigned: ${updated.name} (${updated.id}) → ${assignedTo}`);
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
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Lead ${id} not found`);

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

  get(id: Id): Promise<Lead | null> {
    return this.store.get(id);
  }

  list(filter?: LeadFilter): Promise<Lead[]> {
    return this.store.list(filter);
  }

  listPaged(filter: LeadFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
