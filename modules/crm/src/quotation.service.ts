import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { QuotationApprovalPolicyService } from './quotation-approval-policy.service';
import { CRM_QUOTATION_APPROVAL_RUN_STORE, type QuotationApprovalRun, type QuotationApprovalRunStore, type StepApprovalRecord } from './company-policy-store';
import { type OfferFacts, QUOTATION_APPROVAL_POLICY_KEY, QUOTATION_APPROVE_PERMISSION, approvalProgress, planQuotationApproval } from './domain/quotation-approval-policy';
import { assertSameTenant, decisionReadiness, diffFields, estimateLine, type DocumentRequirement, type DomainEvent, type EstimationLineInput, type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { DOCUMENT_REQUIREMENT_STORE, DerivedEvidenceRegistry, EVENT_STORE, TX_RUNNER, type DocumentRequirementStore, type EventStore, type TxHandle, type TxRunner, AccessService, TenantContext } from '@aura/core';
import {
  QUOTATION_EVENT,
  QUOTATION_ACTIONS,
  type Quotation,
  type NewQuotation,
  type NewQuotationLine,
  type QuotationAction,
  applyQuotationAction,
  isPricingLocked,
  makeQuotation,
  normaliseExclusions,
  reviseQuotation,
  refreshQuotationDraft,
  assertSourcedQuantitiesHeld,
  buildQuotationLine,
  computeQuotationTotals,
} from './domain/quotation';
import { type QuotationPricingView, computeQuotationPricing, computeEstimationPricing } from './domain/quotation-pricing';
import { CRM_QUOTATION_STORE, type QuotationFilter, type QuotationStore } from './quotation-store';
import { CRM_COMMERCIAL_BASELINE_STORE, type CommercialBaselineStore } from './commercial-baseline-store';
import { CRM_QUOTATION_REVIEW_STORE, type QuotationReviewStore } from './quotation-review-store';
import { makeQuotationReviewDecision, type QuotationReviewDecision } from './domain/quotation-review';
import { type CommercialBaseline, makeCommercialBaseline, COMMERCIAL_BASELINE_EVENT } from './domain/commercial-baseline';
import type { QuotationSummary } from './quotation-store';
import { compareQuotationRevisions } from './domain/quotation-compare';

export { QUOTATION_ACTIONS, type QuotationAction };

export interface CommercialPricingSummaryRow {
  quotationId: Id;
  quoteNumber: string;
  revision: number;
  status: Quotation['status'];
  total: number;
  totalCost: number | null;
  profit: number | null;
  marginPercent: number | null;
  pricingKnown: boolean;
}

/**
 * Quotation service — owns `aura_crm_quotations`, emits `crm.quotation.*` on the spine.
 * The pre-sales quote that precedes a Contract / Customer Invoice.
 */
/** How an offer reached the customer (EST-18). Optional on the API so older callers still send. */
export interface QuotationIssueInput {
  recipient?: string | null;
  channel?: QuotationIssueChannel | null;
}
export const QUOTATION_ISSUE_CHANNELS = ['email', 'portal', 'hand_delivery', 'courier'] as const;
export type QuotationIssueChannel = typeof QUOTATION_ISSUE_CHANNELS[number];

export interface ProposalLineage {
  supersedes: { quoteNumber: string; revision: number; reason: string | null } | null;
  supersededBy: { quoteNumber: string; revision: number; status: string } | null;
  issues: Array<{ at: string; by: string | null; recipient: string | null; channel: string | null }>;
}

@Injectable()
export class QuotationService {
  private readonly logger = new Logger('CrmQuotation');

  constructor(
    @Inject(CRM_QUOTATION_STORE) private readonly store: QuotationStore,
    @Inject(CRM_COMMERCIAL_BASELINE_STORE) private readonly baselines: CommercialBaselineStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(TX_RUNNER) private readonly tx: TxRunner | null = null,
    // Optional to keep the in-memory/domain harness usable. In the application this is wired by
    // CoreModule; governed quotations require a persisted commercial checklist at approval.
    @Optional() @Inject(DOCUMENT_REQUIREMENT_STORE) private readonly requirements: DocumentRequirementStore | null = null,
    // Optional for the same reason as the checklist above: the no-DB harness boots without it.
    @Optional() @Inject(CRM_QUOTATION_REVIEW_STORE) private readonly reviews: QuotationReviewStore | null = null,
    // Evidence that is COMPUTED rather than attached — for a tender offer, its supplier quotations.
    // Explicit token: an @Optional() union without one reflects as Object and arrives as null.
    @Optional() @Inject(DerivedEvidenceRegistry) private readonly derivedEvidence: DerivedEvidenceRegistry | null = null,
    // EST-17 — the tenant's quotation approval policy and the approval runs it produces. Optional so
    // the no-DB harness boots; with no active policy an offer is approved as before, in one step.
    @Optional() @Inject(QuotationApprovalPolicyService) private readonly policies: QuotationApprovalPolicyService | null = null,
    @Optional() @Inject(CRM_QUOTATION_APPROVAL_RUN_STORE) private readonly runs: QuotationApprovalRunStore | null = null,
  ) {}

  /** Keep the no-DB test/dev path usable while making PostgreSQL writes atomic in production. */
  private runAtomic<T>(fn: (handle: TxHandle | null) => Promise<T>): Promise<T> {
    return this.tx ? this.tx.run(fn) : fn(null);
  }

  private appendEvents(handle: TxHandle | null, events: Parameters<EventStore['append']>[0]): Promise<void> {
    return handle === null ? this.events.append(events) : this.events.appendWithClient(handle, events);
  }

  /** The acting user for an audit record: the real request actor (ALS) when known, else the fallback. */
  private actor(fallback: Id | null): Id | null {
    return this.tenant?.get().actorId ?? fallback;
  }

  async create(input: NewQuotation): Promise<Quotation> {
    const q = makeQuotation(input);
    const event = makeEvent({
      type: QUOTATION_EVENT.created,
      tenantId: q.tenantId,
      companyId: q.companyId,
      actorId: q.createdBy,
      aggregateType: 'crm.quotation',
      aggregateId: q.id,
      payload: { quoteNumber: q.quoteNumber, customerName: q.customerName, total: q.total },
    });
    await this.runAtomic(async (handle) => {
      await this.store.saveWithClient(handle, q);
      await this.appendEvents(handle, [event]);
    });
    this.logger.log(`Quotation ${q.quoteNumber} created for ${q.customerName}: total ${q.total}`);
    return q;
  }

  /**
   * Edit the commercial terms (free-form notes, exclusions, payment and delivery conditions) on
   * a quotation still being worked up. Only draft / internal-review — the same commitment
   * boundary as the pricing sheet: once approved or sent, the customer and the locked baseline
   * hold these terms, so changing them means raising a revision, not a quiet in-place edit.
   *
   * The guard is phrased "only … can" on purpose: the error taxonomy maps that to 409, whereas
   * "cannot …" would map to 400 — a locked quote is a state conflict, not bad input.
   */
  async updateCommercialTerms(
    id: Id,
    input: { terms?: string | null; exclusions?: string[]; paymentConditions?: string | null; deliveryTerms?: string | null },
  ): Promise<Quotation> {
    const q = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'quotation', id);
    if (isPricingLocked(q)) {
      throw new Error(`only a draft or in-review quotation can have its commercial terms edited — raise a revision to change them after that`);
    }
    const updated: Quotation = {
      ...q,
      terms: input.terms !== undefined ? (input.terms?.trim() || null) : q.terms,
      exclusions: input.exclusions !== undefined ? normaliseExclusions(input.exclusions) : q.exclusions,
      paymentConditions: input.paymentConditions !== undefined ? (input.paymentConditions?.trim() || null) : q.paymentConditions,
      deliveryTerms: input.deliveryTerms !== undefined ? (input.deliveryTerms?.trim() || null) : q.deliveryTerms,
    };
    // Audit trail (P1-2): capture the field-level before→after so the timeline can answer
    // "who changed which term, from what, to what". Real actor from the request context (ALS).
    const changes = diffFields(q, updated, ['terms', 'exclusions', 'paymentConditions', 'deliveryTerms']);
    const event = makeEvent({
        type: QUOTATION_EVENT.updated,
        tenantId: q.tenantId, companyId: q.companyId, actorId: this.actor(q.createdBy),
        aggregateType: 'crm.quotation', aggregateId: id,
        payload: { quoteNumber: q.quoteNumber, field: 'commercial_terms', changes },
    });
    await this.runAtomic(async (handle) => {
      await this.store.saveWithClient(handle, updated);
      await this.appendEvents(handle, [event]);
    });
    return updated;
  }

  async changeStatus(id: Id, action: QuotationAction, actorId: Id | null = null, reason?: string, issue?: QuotationIssueInput): Promise<Quotation> {
    let baselineInserted = false;
    let baseline: CommercialBaseline | null = null;
    let source!: Quotation;
    let updated!: Quotation;
    let stepOnly = false;
    const actor = this.actor(actorId);
    await this.runAtomic(async (handle) => {
      const boundTenant = this.tenant?.boundTenantId();
      const locked = handle !== null && boundTenant && this.store.getForTenantForUpdate
        ? await this.store.getForTenantForUpdate(handle, boundTenant, id)
        : await this.store.get(id);
      const q = assertSameTenant(locked, boundTenant, 'quotation', id);
      source = q;

      // EST-17 — an approval started under a company policy follows THAT version's plan.
      const run = this.runs ? await this.runs.openRunFor(q.tenantId, q.id) : null;
      if (action === 'approve' && run) {
        const step = await this.approveStep(handle, q, run, actor);
        if (!step.complete) {
          stepOnly = true;
          updated = q;
          await this.appendEvents(handle, [makeEvent({
            type: QUOTATION_EVENT.stepApproved, tenantId: q.tenantId, companyId: q.companyId, actorId: actor,
            aggregateType: 'crm.quotation', aggregateId: q.id,
            payload: { quoteNumber: q.quoteNumber, revision: q.revision, policyVersion: run.policyVersion, stepId: step.stepId, next: step.next },
          })]);
          return;
        }
        await this.runs!.saveRun(handle, { ...run, status: 'completed', closedAt: new Date().toISOString() });
      } else if (action === 'approve' && this.policies) {
        const active = await this.policies.active(q.tenantId);
        if (active && q.status === 'draft') {
          throw new Error(`${q.quoteNumber} can only be approved after it is submitted for review — company policy (quotation approval version ${active.version}) approves offers in steps`);
        }
      }
      if (run && (action === 'return_for_revision' || action === 'cancel' || action === 'expire')) {
        await this.runs!.saveRun(handle, { ...run, status: action === 'return_for_revision' ? 'returned' : 'closed', closedAt: new Date().toISOString() });
      }

      // Segregation of duties: the preparer cannot approve their own quotation (a policy-governed
      // approval applied its own version's rule in approveStep).
      if (action === 'approve' && !run && actor && q.createdBy && actor === q.createdBy) {
        throw new Error(`access denied: the preparer of quotation ${q.quoteNumber} cannot approve their own quotation — segregation of duties requires a different approver`);
      }
      /**
       * …AND CANNOT RETURN IT EITHER. Sending an offer back is the OTHER outcome of the same
       * review, so it carries the same separation: letting the preparer return their own
       * submission would hand them a way to reopen a frozen costing whenever an approval looked
       * like going against them, which is the freeze undone by the person it constrains.
       */
      if (action === 'return_for_revision' && actor && q.createdBy && actor === q.createdBy) {
        throw new Error(`access denied: the preparer of quotation ${q.quoteNumber} cannot return their own quotation — returning it is a review decision, and the reviewer makes it`);
      }
      if (action === 'return_for_revision' && !reason?.trim()) {
        throw new Error('returning an offer for revision requires a reason — the estimator has to know what to change');
      }
      if (action === 'approve' && !run && actor) {
        this.access.assertApprovalAuthority(
          actor,
          { permission: 'crm.quotation.approve', orgPath: [{ level: 'tenant', id: q.tenantId }], amount: q.total },
          `quotation ${q.quoteNumber} approval`,
        );
      }
      const decidedOn = action === 'approve' ? await this.assertApprovalReadiness(q) : [];
      updated = applyQuotationAction(q, action);
      // Submitting for review STARTS the approval under the policy active now, pinned to its version.
      if (action === 'submit_review') await this.startApprovalRun(handle, q, actor);
      const eventType = action === 'send' ? QUOTATION_EVENT.sent : action === 'accept' ? QUOTATION_EVENT.accepted : QUOTATION_EVENT.statusChanged;
      const events: DomainEvent[] = [makeEvent({
        type: eventType,
        tenantId: q.tenantId, companyId: q.companyId, actorId: actor,
        aggregateType: 'crm.quotation', aggregateId: id,
        payload: {
          quoteNumber: q.quoteNumber, total: q.total, status: updated.status, action,
          // EST-18 — what reached the customer, and how: the issue record lives on the event that
          // sent it, as the lead's assignment history lives on its events.
          ...(action === 'send' ? { revision: q.revision, recipient: issue?.recipient?.trim() || null, channel: issue?.channel ?? null } : {}),
        },
      })];
      const existing = action === 'approve' ? await this.baselines.getByQuotation(updated.tenantId, updated.id) : null;
      baseline = action === 'approve' && !existing ? makeCommercialBaseline(updated, actor) : null;
      await this.store.saveWithClient(handle, updated);
      // The computed evidence the approval was decided on, written WITH the approval: from here the
      // provider answers frozen and this is what the checklist shows. Nothing if nothing was computed.
      const decidedAt = new Date().toISOString();
      for (const row of decidedOn) await this.requirements?.upsertWithClient(handle, { ...row, updatedAt: decidedAt });
      // The reason lands in the SAME transaction as the status change: an offer back in draft with
      // no recorded reason is exactly the state this action exists to prevent.
      if (action === 'return_for_revision') {
        const decision = makeQuotationReviewDecision({
          tenantId: q.tenantId, companyId: q.companyId, quotationId: q.id,
          quoteNumber: q.quoteNumber, revision: q.revision, decidedBy: actor, reason: reason ?? '',
        });
        if (this.reviews) await this.reviews.saveWithClient(handle, decision);
      }
      if (baseline) baselineInserted = await this.baselines.saveWithClient(handle, baseline);
      const committedEvents = baseline && baselineInserted
        ? [...events, makeEvent({
            type: COMMERCIAL_BASELINE_EVENT.locked,
            tenantId: updated.tenantId, companyId: updated.companyId, actorId: actor,
            aggregateType: 'crm.commercial_baseline', aggregateId: baseline.id,
            payload: { quotationId: updated.id, quoteNumber: updated.quoteNumber, total: baseline.total },
          })]
        : events;
      await this.appendEvents(handle, committedEvents);
    });
    if (stepOnly) {
      this.logger.log(`Quotation ${source.quoteNumber} (rev ${source.revision}) step approved by ${actor}`);
      return updated;
    }
    this.logger.log(`Quotation ${source.quoteNumber} (rev ${source.revision}) ${action} → ${updated.status}`);

    // Governance (R3): approval locks the immutable Commercial Baseline — the approved-price snapshot
    // the Contract will reference. Idempotent: only the first approval of this quotation locks one.
    if (baselineInserted) {
      const lockedBaseline = baseline as unknown as CommercialBaseline;
      this.logger.log(`Commercial baseline locked for ${updated.quoteNumber}: total ${lockedBaseline.total} (${lockedBaseline.id})`);
    }
    return updated;
  }

  /** The facts a policy plans on, read from the offer itself. */
  private offerFacts(q: Quotation): OfferFacts {
    const pricing = q.estimation && q.estimation.length > 0 ? computeEstimationPricing(q.lines, q.estimation) : computeQuotationPricing(q.lines, q.pricing);
    return {
      net: q.subtotal, gross: q.total,
      marginPercent: pricing.totalCost > 0 ? pricing.marginPercent : null,
      // An offer carries no discount of its own yet: a discount trigger has nothing to read.
      discountPercent: null,
      manual: !q.sourceTenderId && !(q.estimation && q.estimation.length > 0),
    };
  }

  private async startApprovalRun(handle: TxHandle | null, q: Quotation, actor: Id | null): Promise<void> {
    if (!this.policies || !this.runs) return;
    const active = await this.policies.active(q.tenantId);
    if (!active) return;
    const { amount, steps } = planQuotationApproval(active.policy, this.offerFacts(q));
    if (steps.length === 0) return; // nothing this policy asks of an offer this size: approved as before
    const stale = await this.runs.openRunFor(q.tenantId, q.id);
    if (stale) await this.runs.saveRun(handle, { ...stale, status: 'closed', closedAt: new Date().toISOString() });
    const run: QuotationApprovalRun = {
      id: newId(), tenantId: q.tenantId, quotationId: q.id, policyKey: QUOTATION_APPROVAL_POLICY_KEY, policyVersion: active.version,
      amount, amountBasis: active.policy.amountBasis, currency: active.policy.currency, plan: steps,
      status: 'open', startedBy: actor ?? 'system', startedAt: new Date().toISOString(), closedAt: null,
    };
    await this.runs.saveRun(handle, run);
    await this.appendEvents(handle, [makeEvent({
      type: QUOTATION_EVENT.approvalStarted, tenantId: q.tenantId, companyId: q.companyId, actorId: actor,
      aggregateType: 'crm.quotation', aggregateId: q.id,
      payload: { quoteNumber: q.quoteNumber, revision: q.revision, policyVersion: active.version, amount, amountBasis: active.policy.amountBasis, steps: steps.map((s) => s.id) },
    })]);
  }

  /**
   * One approver's decision on the step their ROLE is due for, under the run's own policy version.
   * Refused: a step out of sequence or for another role, the preparer (where the version requires
   * it), a second step by the same person (where it requires that), and anyone without the approve
   * permission or approval limit — a policy names roles, it never grants authority.
   */
  private async approveStep(handle: TxHandle | null, q: Quotation, run: QuotationApprovalRun, actor: Id | null) {
    if (!actor) throw new Error('access denied: a signed-in approver is required');
    if (q.status !== 'internal_review') throw new Error(`${q.quoteNumber} is ${q.status}; only an offer in review can be approved`);
    const policy = await this.policies!.pinned(q.tenantId, run.policyVersion);
    const decisions = await this.runs!.listDecisions(q.tenantId, run.id);
    const progress = approvalProgress(run.plan, decisions);
    if (policy.segregationOfDuties.preparerMayNotApprove && q.createdBy && actor === q.createdBy) {
      throw new Error(`access denied: the preparer of quotation ${q.quoteNumber} cannot approve their own quotation — segregation of duties (approval policy version ${run.policyVersion}) requires a different approver`);
    }
    if (policy.segregationOfDuties.oneStepPerApprover) {
      const earlier = decisions.find((d) => d.approverId === actor);
      if (earlier) {
        const label = run.plan.find((s) => s.id === earlier.stepId)?.label ?? earlier.stepId;
        throw new Error(`access denied: ${actor} has already approved the ${label} step of ${q.quoteNumber} — approval policy version ${run.policyVersion} requires a different approver for each step`);
      }
    }
    const step = progress.open.find((s) => this.policies!.holdsRole(q.tenantId, actor, s.role));
    if (!step) {
      throw new Error(`access denied: ${q.quoteNumber} is waiting on ${progress.open.map((s) => `${s.label} (${s.role})`).join(', ')} under approval policy version ${run.policyVersion}, and ${actor} does not hold that role`);
    }
    this.access.assertApprovalAuthority(
      actor,
      { permission: QUOTATION_APPROVE_PERMISSION, orgPath: [{ level: 'tenant', id: q.tenantId }], amount: run.amount },
      `quotation ${q.quoteNumber} ${step.label} approval`,
    );
    const record: StepApprovalRecord = { id: newId(), tenantId: q.tenantId, runId: run.id, stepId: step.id, approverId: actor, decidedAt: new Date().toISOString() };
    await this.runs!.appendDecision(handle, record);
    const after = approvalProgress(run.plan, [...decisions, record]);
    return { complete: after.complete, stepId: step.id, next: after.open.map((s) => s.label) };
  }

  /** Where this offer's approval stands under the policy version it started with (for the screen). */
  async approvalStatus(tenantId: Id, id: Id) {
    const q = assertSameTenant(await this.store.get(id), tenantId, 'quotation', id);
    if (!this.runs) return { quotationId: q.id, runs: [] };
    const runs = await this.runs.listRuns(tenantId, q.id);
    return {
      quotationId: q.id,
      runs: await Promise.all(runs.map(async (run) => {
        const decisions = await this.runs!.listDecisions(tenantId, run.id);
        const progress = approvalProgress(run.plan, decisions);
        return {
          id: run.id, policyVersion: run.policyVersion, status: run.status, amount: run.amount, amountBasis: run.amountBasis,
          currency: run.currency, startedAt: run.startedAt, startedBy: run.startedBy, closedAt: run.closedAt,
          waitingOn: run.status === 'open' ? progress.open.map((s) => ({ id: s.id, label: s.label, role: s.role })) : [],
          steps: progress.steps.map((s) => ({ ...s, decisions: decisions.filter((d) => d.stepId === s.id).map((d) => ({ approverId: d.approverId, decidedAt: d.decidedAt })) })),
        };
      })),
    };
  }

  /**
   * Evidence readiness is a domain rule for every governed quotation. Only rows explicitly marked
   * legacy by the migration marker retain the no-checklist compatibility path; a missing checklist
   * on a new quotation is a governance failure, not an exemption. Every caller (register,
   * Commercial queue, API or Quotation 360) receives the same server decision.
   * A UI warning is never sufficient to authorize an approval.
   */
  /** Refuses an unready approval; returns the COMPUTED rows it was decided on, for the record. */
  private async assertApprovalReadiness(q: Quotation): Promise<DocumentRequirement[]> {
    if (!this.requirements) return [];
    if (q.approvalReadinessMode === 'legacy') return [];
    const stored = await this.requirements.list({ tenantId: q.tenantId, entityType: 'crm.quotation', entityId: q.id });
    // The approval decides on the evidence AS IT IS NOW — a derived requirement is recomputed here,
    // at the moment of decision, not read from whatever was last saved.
    const rows = this.derivedEvidence ? await this.derivedEvidence.overlay(stored) : stored;
    if (rows.length === 0) {
      throw new Error(`quotation ${q.quoteNumber} approval blocked: readiness checklist is not configured`);
    }
    const readiness = decisionReadiness(rows);
    // `overlay` returns a row untouched when nothing is computed for it, so a new object is a derived one.
    if (readiness.verdict === 'READY') return rows.filter((row, i) => row !== stored[i]);
    const missing = readiness.missing.map((m) => `${m.type} (${m.have}/${m.need})`).join(', ');
    throw new Error(
      `quotation ${q.quoteNumber} approval blocked: decision readiness is ${readiness.verdict}` +
      (missing ? `; missing evidence: ${missing}` : ''),
    );
  }

  /** The locked approved-price baseline for a quotation (null until it has been approved). */
  /**
   * The exact baseline by id. `crm.commercial_baseline.locked` names the baseline as its aggregate,
   * so a subscriber can read the row that actually locked rather than "the latest for that
   * quotation", which may be a different row by the time the event is delivered.
   */
  getBaselineById(tenantId: Id, baselineId: Id): Promise<CommercialBaseline | null> {
    return this.baselines.get(baselineId).then((b) => (b && b.tenantId === tenantId ? b : null));
  }

  /** Every time this offer was sent back, and why. Empty when it never was. */
  /**
   * EST-18 — the revision lineage and the customer issues of one offer, for the documents that go to
   * the customer: which revision this one supersedes and why, what superseded it, and every time it
   * was issued (by whom, when, to whom, how).
   */
  async proposalLineage(tenantId: Id, id: Id): Promise<ProposalLineage> {
    const q = assertSameTenant(await this.store.get(id), tenantId, 'quotation', id);
    const chain = await this.store.list({ tenantId, quoteNumber: q.quoteNumber, limit: 100 });
    const parent = q.parentQuotationId ? chain.find((row) => row.id === q.parentQuotationId) ?? null : null;
    const child = chain.find((row) => row.parentQuotationId === q.id) ?? null;
    const reason = parent
      ? (await this.listReviewDecisions(tenantId, parent.id)).filter((d) => d.outcome === 'revised').at(-1)?.reason ?? null
      : null;
    const sent = await this.events.list({ tenantId, type: QUOTATION_EVENT.sent, aggregateId: q.id });
    return {
      supersedes: parent ? { quoteNumber: parent.quoteNumber, revision: parent.revision, reason } : null,
      supersededBy: child ? { quoteNumber: child.quoteNumber, revision: child.revision, status: child.status } : null,
      issues: sent.map((e) => {
        const p = (e.payload ?? {}) as Record<string, unknown>;
        return {
          at: e.occurredAt, by: e.actorId ?? null,
          recipient: typeof p.recipient === 'string' ? p.recipient : null,
          channel: typeof p.channel === 'string' ? p.channel : null,
        };
      }),
    };
  }

  listReviewDecisions(tenantId: Id, quotationId: Id): Promise<QuotationReviewDecision[]> {
    return this.reviews ? this.reviews.listByQuotation(tenantId, quotationId) : Promise.resolve([]);
  }

  getBaseline(tenantId: Id, quotationId: Id): Promise<CommercialBaseline | null> {
    return this.baselines.getByQuotation(tenantId, quotationId);
  }

  /** Every locked baseline for a tenant — one read for the source-to-margin funnel (C5), which
   * traces contracts back to their deals through the baseline they were priced from. */
  listBaselines(tenantId: Id, limit = 5000): Promise<CommercialBaseline[]> {
    return this.baselines.list(tenantId, limit);
  }

  /**
   * Supersede: the old record becomes 'revised', a new draft carries revision+1.
   *
   * By default the figures are COPIED (a direct or opportunity offer). EST-16 (the owner's decision of
   * 2026-09-25) adds, for a tender offer, figures REGENERATED from the governed estimate, a revision
   * from a RETURNED draft, and a REASON recorded against the revision it supersedes — append-only,
   * beside the review decisions, in the same transaction.
   */
  async revise(
    id: Id,
    actorId: Id | null = null,
    options: {
      reason?: string;
      regenerated?: { lines: NewQuotationLine[]; estimation: EstimationLineInput[] | null };
    } = {},
  ): Promise<Quotation> {
    const actor = this.actor(actorId);
    // Whether a draft was submitted and RETURNED is read from the record, never taken from the caller.
    const before = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'quotation', id);
    const fromReturnedDraft = before.status === 'draft' && (await this.everSubmitted(before.tenantId, before));
    let source!: Quotation;
    let next!: Quotation;
    await this.runAtomic(async (handle) => {
      const boundTenant = this.tenant?.boundTenantId();
      // Serialize revisions on the canonical current row. Without this lock two requests arriving
      // together can both observe `sent` and create two Rev n+1 children. The caller supplies only
      // the row being revised; parent identity and revision number are always derived here.
      const locked = handle !== null && boundTenant && this.store.getForTenantForUpdate
        ? await this.store.getForTenantForUpdate(handle, boundTenant, id)
        : await this.store.get(id);
      const q = assertSameTenant(locked, boundTenant, 'quotation', id);
      source = q;
      // ONE WRITER FOR A TENDER OFFER'S FIGURES (EST-16): its tender's governed estimate. A copy made
      // here would be a revision nobody priced, beside the one the estimate says it should be.
      if (q.sourceTenderId && !options.regenerated) {
        throw new Error(
          `${q.quoteNumber} is a tender offer and can only be revised from its tender — the next revision ` +
            `is priced from the tender's estimate, and the reviser records why`,
        );
      }
      const revision = reviseQuotation(q, { actorId: actor, regenerated: options.regenerated, fromReturnedDraft });
      next = revision.next;
      // The reason is refused before anything is written, and lands WITH the supersession. A tender
      // offer's revision always carries one — "Revising a submitted tender offer requires a permanent
      // reason" (the owner's decision of 2026-09-25).
      const reasoned = options.reason !== undefined || options.regenerated
        ? makeQuotationReviewDecision({
          tenantId: q.tenantId, companyId: q.companyId, quotationId: q.id, quoteNumber: q.quoteNumber,
          revision: q.revision, outcome: 'revised', decidedBy: actor, reason: options.reason ?? '',
        })
        : null;
      const event = makeEvent({
        type: QUOTATION_EVENT.revised,
        tenantId: q.tenantId, companyId: q.companyId, actorId: actor,
        aggregateType: 'crm.quotation', aggregateId: next.id,
        payload: { quoteNumber: q.quoteNumber, fromRevision: q.revision, toRevision: next.revision, supersededId: q.id },
      });
      await this.store.saveWithClient(handle, revision.superseded);
      await this.store.saveWithClient(handle, next);
      if (reasoned && this.reviews) await this.reviews.saveWithClient(handle, reasoned);
      await this.appendEvents(handle, [event]);
    });
    this.logger.log(`Quotation ${source.quoteNumber} revised: Rev ${source.revision} → Rev ${next.revision}`);
    return next;
  }

  /**
   * THE TENDER'S ONE OFFER (EST-16 (a)) — its live revision: the latest that has not been superseded.
   * Null when the tender has none yet. Legacy tenders that forked into several numbers resolve to the
   * most recent, so the fork is not extended.
   */
  async currentForTender(tenantId: Id, tenderId: Id): Promise<Quotation | null> {
    const live = (await this.listBySourceTender(tenantId, tenderId)).filter((q) => q.status !== 'revised');
    if (live.length === 0) return null;
    return live.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.revision - a.revision)[0];
  }

  /** Whether this revision has ever been submitted for a decision — a return is the trace it leaves. */
  async everSubmitted(tenantId: Id, q: Quotation): Promise<boolean> {
    const decisions = await this.listReviewDecisions(tenantId, q.id);
    return decisions.some((d) => d.revision === q.revision);
  }

  /** Refresh a never-submitted draft in place — same number and revision, the estimate's figures. */
  async refreshDraft(
    id: Id,
    actorId: Id | null,
    input: { lines: NewQuotationLine[]; estimation: EstimationLineInput[] | null },
  ): Promise<Quotation> {
    const actor = this.actor(actorId);
    const q = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'quotation', id);
    const refreshed = refreshQuotationDraft(q, input, await this.everSubmitted(q.tenantId, q));
    await this.runAtomic(async (handle) => {
      await this.store.saveWithClient(handle, refreshed);
      await this.appendEvents(handle, [makeEvent({
        type: QUOTATION_EVENT.refreshed,
        tenantId: q.tenantId, companyId: q.companyId, actorId: actor,
        aggregateType: 'crm.quotation', aggregateId: q.id,
        payload: { quoteNumber: q.quoteNumber, revision: q.revision, fromTotal: q.total, toTotal: refreshed.total },
      })]);
    });
    return refreshed;
  }

  /**
   * TWO REVISIONS OF ONE OFFER, side by side (EST-16 (d)): the figures per BOQ item from each
   * revision's frozen record, and the decisions each revision carries — who approved it (its locked
   * baseline), who returned it and why, and why it was revised.
   */
  async compare(tenantId: Id, fromId: Id, toId: Id) {
    const [from, to] = await Promise.all([this.store.get(fromId), this.store.get(toId)]);
    const a = assertSameTenant(from, tenantId, 'quotation', fromId);
    const b = assertSameTenant(to, tenantId, 'quotation', toId);
    const comparison = compareQuotationRevisions(a, b);
    const decisionsOf = async (q: Quotation) => {
      const [reviews, baseline] = await Promise.all([this.listReviewDecisions(tenantId, q.id), this.baselines.getByQuotation(tenantId, q.id)]);
      return {
        approvedBy: baseline?.lockedBy ?? null,
        approvedAt: baseline?.lockedAt ?? null,
        returned: reviews.filter((r) => r.outcome === 'returned').map((r) => ({ by: r.decidedBy, at: r.decidedAt, reason: r.reason })),
        revised: reviews.filter((r) => r.outcome === 'revised').map((r) => ({ by: r.decidedBy, at: r.decidedAt, reason: r.reason })),
      };
    };
    const [fromDecisions, toDecisions] = await Promise.all([decisionsOf(a), decisionsOf(b)]);
    return { ...comparison, from: { ...comparison.from, ...fromDecisions }, to: { ...comparison.to, ...toDecisions } };
  }

  /** Record the contract created from an accepted quotation (deal-chain link). */
  async linkContract(id: Id, contractId: Id): Promise<void> {
    const q = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'quotation', id);
    await this.store.save({ ...q, convertedContractId: contractId });
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Quotation | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  /**
   * All revisions of a quotation, oldest revision first.
   *
   * The quote number alone is NOT the chain. Numbers derived from a source record collide —
   * quoting the same opportunity twice produces two independent quotes sharing one number, both
   * at revision 0 — and returning those as a revision history invents a price change between
   * two unrelated quotes. `parentQuotationId` is the authoritative link, so the chain is the
   * connected component under it.
   *
   * The number-matched set is still used as a fallback, but only when its revision numbers are
   * distinct: that shape is a real chain whose links were never written, whereas a repeated
   * revision number proves the rows are separate quotes.
   */
  async listRevisions(tenantId: string, id: Id): Promise<Quotation[]> {
    // Resolve the root record through the tenant-scoped path before constructing the chain. A raw
    // store lookup here would let a quotation id from another tenant leak into the revision view
    // when the tenant has no matching quote number of its own.
    const q = await this.store.getForTenant(tenantId, id);
    if (!q) return [];
    const candidates = await this.store.list({ tenantId, quoteNumber: q.quoteNumber, limit: 100 });
    const byId = new Map(candidates.map((c) => [c.id, c]));

    // Up to the root, then down through the children — the component containing `q`.
    let root = q;
    const upward = new Set<Id>([q.id]);
    while (root.parentQuotationId) {
      const parent = byId.get(root.parentQuotationId);
      if (!parent || upward.has(parent.id)) break; // missing link, or a cycle in bad data
      upward.add(parent.id);
      root = parent;
    }
    const chain = [root];
    const visited = new Set<Id>([root.id]);
    for (;;) {
      const child = candidates.find((c) => c.parentQuotationId === chain[chain.length - 1].id && !visited.has(c.id));
      if (!child) break;
      visited.add(child.id);
      chain.push(child);
    }

    if (chain.length > 1) return chain.sort((a, b) => a.revision - b.revision);

    // Unlinked. Trust the number only when it cannot be hiding two separate quotes.
    const revisions = candidates.map((c) => c.revision);
    const distinct = new Set(revisions).size === revisions.length;
    return distinct ? [...candidates].sort((a, b) => a.revision - b.revision) : [q];
  }

  /**
   * The internal rate build-up for this revision, plus whether it's frozen. Sourced from the
   * CANONICAL Estimation Engine when the quote was authored through the pricing sheet (`estimation`
   * present) — the same engine the sheet computes with — so the view and the AI pricing advice read
   * real cost. Only a legacy quote with no estimation falls back to the old `pricing` build-up.
   */
  async getPricing(id: Id): Promise<QuotationPricingView> {
    const q = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'quotation', id);
    const sheet = q.estimation && q.estimation.length > 0
      ? computeEstimationPricing(q.lines, q.estimation)
      : computeQuotationPricing(q.lines, q.pricing);
    return {
      ...sheet,
      locked: isPricingLocked(q),
      status: q.status,
      quoteNumber: q.quoteNumber,
      revision: q.revision,
    };
  }

  /**
   * What we have quoted this item for before — the historic half of the pricing library. Aggregates
   * the line items of past quotes into distinct descriptions with how many times and at what price,
   * so an estimator sees "you quoted this 6 times, most recently at 780" instead of guessing afresh.
   *
   * Uses the SELL unit price actually put on the line, not a cost. It is history, so it is honest
   * about spread: min/max as well as the most recent.
   */
  async priceHistory(
    tenantId: string,
    q?: string,
    excludeQuotationId?: string,
  ): Promise<Array<{ description: string; count: number; lastPrice: number; minPrice: number; maxPrice: number; lastAt: string }>> {
    const quotes = await this.store.list({ tenantId, limit: 500 });
    const needle = q?.trim().toLowerCase();
    const map = new Map<string, { name: string; prices: number[]; last: { price: number; at: string } }>();
    for (const quote of quotes) {
      // For pricing advice, the quote being priced must not compare against itself.
      if (excludeQuotationId && quote.id === excludeQuotationId) continue;
      for (const l of quote.lines) {
        const desc = l.description?.trim();
        if (!desc || l.unitPrice <= 0) continue;
        if (needle && !desc.toLowerCase().includes(needle)) continue;
        const key = desc.toLowerCase();
        const e = map.get(key) ?? { name: desc, prices: [], last: { price: 0, at: '' } };
        e.prices.push(l.unitPrice);
        // Latest by the quote's createdAt — the price the market last bore.
        if (quote.createdAt > e.last.at) e.last = { price: l.unitPrice, at: quote.createdAt };
        map.set(key, e);
      }
    }
    return [...map.values()]
      .map((e) => ({
        description: e.name,
        count: e.prices.length,
        lastPrice: e.last.price,
        minPrice: Math.min(...e.prices),
        maxPrice: Math.max(...e.prices),
        lastAt: e.last.at,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  /**
   * Save the Pricing Workspace: each line's full Estimation Engine build-up is stored AND the quote
   * lines are regenerated from it — description + quantity + the engine's derived unit sell price.
   * The build-up is the source; the lines are the output. Refused (409) once approved, same lock.
   */
  async saveEstimation(id: Id, items: EstimationLineInput[]): Promise<Quotation> {
    const q = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'quotation', id);
    // A tender offer's figures come from ONE place — the tender's governed estimate (EST-16). Pricing
    // it here as well would be a second writer, and a returned revision re-priced in place would
    // rewrite figures somebody has already been asked to decide on.
    if (q.sourceTenderId) {
      throw new Error(
        `${q.quoteNumber} is a tender offer and can only be priced from its tender's estimate — ` +
          `re-price the tender, then generate or revise its offer there`,
      );
    }
    if (isPricingLocked(q)) {
      throw new Error(
        `pricing sheet is locked: only a draft or in-review quotation can be re-priced — ` +
          `${q.quoteNumber} Rev ${q.revision} is ${q.status}. Raise a revision to re-price.`,
      );
    }
    const rows = Array.isArray(items) ? items : [];
    if (rows.length === 0) throw new Error('the pricing workspace needs at least one item');

    const lines = rows.map((it, i) => {
      const r = estimateLine(it);
      return buildQuotationLine({
        description: (it.description ?? '').trim() || `Item ${i + 1}`,
        quantity: r.quantity,
        unit: it.unit ?? q.lines[i]?.unit ?? null,
        sourceItemId: it.sourceItemId ?? q.lines[i]?.sourceItemId ?? null,
        unitPrice: r.unitSellPrice,
        vatRate: q.lines[i]?.vatRate ?? 5,
      });
    });
    // EST-19: the approved scope's quantities are held — checked on the lines as they will be written,
    // after the positional source fallback above, so an item that omits its source is still judged.
    assertSourcedQuantitiesHeld(q.lines, lines, `${q.quoteNumber} Rev ${q.revision}`, { requireAll: true });
    const { subtotal, vatTotal, total } = computeQuotationTotals(lines);
    const updated: Quotation = { ...q, lines, subtotal, vatTotal, total, estimation: rows };
    await this.store.save(updated);
    // Audit trail (P1-2): the re-price is the money-cycle's most audit-sensitive edit — record the
    // value before→after (subtotal/vat/total) and the real actor so "who moved the total from X to Y".
    const changes = diffFields(q, updated, ['subtotal', 'vatTotal', 'total']);
    await this.events.append([
      makeEvent({
        type: QUOTATION_EVENT.updated,
        tenantId: q.tenantId, companyId: q.companyId, actorId: this.actor(q.createdBy),
        aggregateType: 'crm.quotation', aggregateId: id,
        payload: { quoteNumber: q.quoteNumber, field: 'estimation', lineCount: lines.length, total, changes },
      }),
    ]);
    this.logger.log(`Estimation saved for ${q.quoteNumber}: ${lines.length} line(s), total ${total}`);
    return updated;
  }

  /**
   * EST-19 — refuse, early, a pricing sheet that would change or invent an approved-scope line of this
   * offer. The sheet is a draft being built, so a line not YET on it is not refused here; the offer's
   * own write (saveEstimation) requires every sourced line.
   */
  async assertPricingHoldsApprovedScope(id: Id, items: EstimationLineInput[]): Promise<void> {
    const q = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'quotation', id);
    const rows = Array.isArray(items) ? items : [];
    const priced = rows.map((it, i) => ({
      description: (it.description ?? '').trim() || `Item ${i + 1}`,
      quantity: estimateLine(it).quantity,
      sourceItemId: it.sourceItemId ?? q.lines[i]?.sourceItemId ?? null,
    }));
    assertSourcedQuantitiesHeld(q.lines, priced, `${q.quoteNumber} Rev ${q.revision}`, { requireAll: false });
  }

  /** Quotations generated from a tender's pricing sheet. */
  listBySourceTender(tenantId: string, tenderId: string): Promise<Quotation[]> {
    return this.store.list({ tenantId, sourceTenderId: tenderId });
  }

  list(filter?: QuotationFilter): Promise<Quotation[]> {
    return this.store.list(filter);
  }

  streamAll(filter: QuotationFilter, onBatch: (rows: Quotation[]) => Promise<void>): Promise<void> {
    return this.store.streamAll(filter, onBatch);
  }

  listPaged(filter: QuotationFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }

  summary(filter: QuotationFilter): Promise<QuotationSummary> {
    return this.store.summary(filter);
  }

  /**
   * Canonical read model for the Commercial Control Center. Financial fields come from the same
   * pricing projection used by Quotation 360; the quotation line payload is never treated as a
   * cost contract. Missing cost stays null/unknown rather than becoming a fabricated zero.
   */
  async commercialPricingSummary(filter: QuotationFilter = {}): Promise<{ rows: CommercialPricingSummaryRow[] }> {
    const quotes = await this.store.list({ ...filter, limit: filter.limit ?? 500 });
    const rows = await Promise.all(quotes.map(async (q): Promise<CommercialPricingSummaryRow> => {
      // Once approved, the immutable baseline is the only accepted commercial truth. Never fall
      // back to a mutable quotation pricing draft for historical reporting.
      const baseline = ['approved', 'sent', 'under_negotiation', 'accepted'].includes(q.status)
        ? await this.getBaseline(q.tenantId, q.id)
        : null;
      const source = baseline
        ? { lines: baseline.lines, pricing: baseline.pricing, estimation: baseline.estimation }
        : { lines: q.lines, pricing: q.pricing, estimation: q.estimation };
      const pricing = baseline && !baseline.pricing && !baseline.estimation
        ? null
        : source.estimation && source.estimation.length > 0
          ? computeEstimationPricing(source.lines, source.estimation)
          : computeQuotationPricing(source.lines, source.pricing);
      const pricingKnown = pricing !== null && pricing.totalCost > 0;
      return {
        quotationId: q.id,
        quoteNumber: q.quoteNumber,
        revision: q.revision,
        status: q.status,
        total: q.total,
        totalCost: pricingKnown ? pricing!.totalCost : null,
        profit: pricingKnown ? pricing!.profit : null,
        marginPercent: pricingKnown ? pricing!.marginPercent : null,
        pricingKnown,
      };
    }));
    return { rows };
  }
}
