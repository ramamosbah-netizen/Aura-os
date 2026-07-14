import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  type Requirement, type NewRequirement, makeRequirement,
  type SolutionScope, type NewScopeLine, makeSolutionScope, makeScopeLine,
  computeScopeTotal, approveScope, scopeLinesToQuotationLines, PREAWARD_EVENT,
} from './domain/solution-scope';
import { CRM_PRE_AWARD_STORE, type PreAwardStore } from './pre-award-store';
import { QuotationService } from './quotation.service';
import type { Quotation } from './domain/quotation';

/**
 * Pre-award discovery (R4) — requirements + solution scopes on an opportunity, and the direct-sale
 * bridge that turns an APPROVED scope into a governed Quotation (R3). The reason the front-half is no
 * longer spreadsheets: a quote now derives from a signed-off, structured scope.
 */
@Injectable()
export class PreAwardService {
  private readonly logger = new Logger('CRM-PreAward');

  constructor(
    @Inject(CRM_PRE_AWARD_STORE) private readonly store: PreAwardStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly quotations: QuotationService,
  ) {}

  // ── Requirements ──
  async addRequirement(input: NewRequirement & { actorId?: Id | null }): Promise<Requirement> {
    const r = makeRequirement(input);
    await this.store.saveRequirement(r);
    await this.events.append([makeEvent({
      type: PREAWARD_EVENT.requirementAdded, tenantId: r.tenantId, companyId: null,
      actorId: input.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: r.opportunityId,
      payload: { requirementId: r.id, title: r.title, priority: r.priority },
    })]);
    return r;
  }
  listRequirements(tenantId: Id, opportunityId: Id): Promise<Requirement[]> {
    return this.store.listRequirements(tenantId, opportunityId);
  }

  // ── Solution scopes ──
  async createScope(input: { tenantId: Id; opportunityId: Id; title: string; lines?: NewScopeLine[]; actorId?: Id | null }): Promise<SolutionScope> {
    const s = makeSolutionScope(input);
    await this.store.saveScope(s);
    await this.events.append([makeEvent({
      type: PREAWARD_EVENT.scopeCreated, tenantId: s.tenantId, companyId: null,
      actorId: input.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: s.opportunityId,
      payload: { scopeId: s.id, title: s.title, total: s.total },
    })]);
    return s;
  }

  /** Replace a draft scope's lines (edit before approval). Approved scopes are frozen. */
  async setScopeLines(id: Id, lines: NewScopeLine[]): Promise<SolutionScope> {
    const s = await this.store.getScope(id);
    if (!s) throw new Error(`scope ${id} not found`);
    if (s.status === 'approved') throw new Error('cannot edit an approved scope');
    const built = lines.map(makeScopeLine);
    const updated: SolutionScope = { ...s, lines: built, total: computeScopeTotal(built), updatedAt: new Date().toISOString() };
    await this.store.saveScope(updated);
    return updated;
  }

  async approveScope(id: Id, actorId: Id | null = null): Promise<SolutionScope> {
    const s = await this.store.getScope(id);
    if (!s) throw new Error(`scope ${id} not found`);
    const approved = approveScope(s, actorId);
    await this.store.saveScope(approved);
    await this.events.append([makeEvent({
      type: PREAWARD_EVENT.scopeApproved, tenantId: approved.tenantId, companyId: null,
      actorId, aggregateType: 'crm.opportunity', aggregateId: approved.opportunityId,
      payload: { scopeId: approved.id, total: approved.total },
    })]);
    this.logger.log(`Solution scope approved: ${approved.title} (${approved.id}) total ${approved.total}`);
    return approved;
  }

  /**
   * Generate a Quotation from an APPROVED scope (the direct-sale path). The quote starts in draft and
   * carries the opportunity provenance, so it runs the R3 governance gate (approve → baseline) like any
   * other quote — but now derived from a signed-off structured scope, not free-form.
   */
  async generateQuotation(id: Id, opts: { customerName: string; accountId?: Id | null; actorId?: Id | null }): Promise<Quotation> {
    const s = await this.store.getScope(id);
    if (!s) throw new Error(`scope ${id} not found`);
    if (s.status !== 'approved') throw new Error(`scope must be approved to generate a quotation (is '${s.status}')`);
    if (s.generatedQuotationId) {
      const existing = await this.quotations.get(s.generatedQuotationId);
      if (existing) return existing; // idempotent — one quote per scope
    }

    const quotation = await this.quotations.create({
      tenantId: s.tenantId,
      customerName: opts.customerName,
      accountId: opts.accountId ?? null,
      sourceOpportunityId: s.opportunityId,
      quoteNumber: `QT-S-${s.id.slice(0, 8)}`,
      issueDate: new Date().toISOString().slice(0, 10),
      lines: scopeLinesToQuotationLines(s),
      createdBy: opts.actorId ?? null,
    });

    const linked: SolutionScope = { ...s, generatedQuotationId: quotation.id, updatedAt: new Date().toISOString() };
    await this.store.saveScope(linked);
    await this.events.append([makeEvent({
      type: PREAWARD_EVENT.scopeQuoted, tenantId: s.tenantId, companyId: null,
      actorId: opts.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: s.opportunityId,
      payload: { scopeId: s.id, quotationId: quotation.id, total: quotation.total },
    })]);
    this.logger.log(`Quotation ${quotation.quoteNumber} generated from scope ${s.id} (total ${quotation.total})`);
    return quotation;
  }

  getScope(id: Id): Promise<SolutionScope | null> {
    return this.store.getScope(id);
  }
  listScopes(tenantId: Id, opportunityId: Id): Promise<SolutionScope[]> {
    return this.store.listScopes(tenantId, opportunityId);
  }
}
