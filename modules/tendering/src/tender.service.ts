import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { AuditService, CommandBus, EVENT_STORE, type EventStore, NumberingService, TenantContext, TX_RUNNER, type TxRunner } from '@aura/core';
import { TENDER_EVENT, type Tender, type TenderStatus, type NewTender, makeTender } from './domain/tender';
import { checkTenderTransition, tenderGateMessage, type TenderGateEvidence } from './domain/tender-gate';
import { makeTenderAwardEvidence, type NewTenderAwardEvidence, type TenderAwardEvidence } from './domain/tender-award-evidence';
import { makeTenderCommercialBasis, type NewTenderCommercialBasis, type TenderCommercialBasis } from './domain/tender-commercial-basis';
import { makeTenderSubmission, type NewTenderSubmission, type TenderSubmission } from './domain/submission';
import { TENDER_STORE, type TenderFilter, type TenderStore } from './tender-store';
import { BOQ_STORE, type BOQStore } from './boq-store';
import { BID_SCORE_STORE, type BidScoreStore } from './bid-score-store';
import { ESTIMATE_STORE, type EstimateStore } from './estimate-store';
import { SUBMISSION_STORE, type SubmissionStore } from './submission-store';
import { ESTIMATE_SOURCE_STORE, type EstimateSourceStore } from './estimate-source-store';
import { type BOQ, type BOQItem, makeBOQ, makeBOQItem, type NewBOQItem } from './domain/boq';

const CREATE_TENDER = 'tendering.tender.create';

/**
 * Tendering service — the second deal-chain module. Owns `aura_tendering_tenders`, emits
 * `tendering.tender.*` on the spine. It REFERENCES CRM accounts by id + snapshot (never joins
 * CRM's tables) — modules compose via events/API, not the database.
 *
 * Create dispatches through the kernel `CommandBus` (validate → authz → idempotency → one tx
 * → atomic row + outbox event), with the reference number generated inside the handler.
 * `update`/`changeStatus`/BOQ-recalc keep their inline atomic TX_RUNNER writes — the
 * tender.awarded event drives Contract auto-creation.
 */
@Injectable()
export class TenderService implements OnModuleInit {
  private readonly logger = new Logger('Tendering');

  constructor(
    @Inject(TENDER_STORE) private readonly store: TenderStore,
    @Inject(BOQ_STORE) private readonly boqStore: BOQStore,
    // The lifecycle gate reads these — the bid decision and the priced estimate — as evidence.
    @Inject(BID_SCORE_STORE) private readonly bidScores: BidScoreStore,
    @Inject(ESTIMATE_STORE) private readonly estimates: EstimateStore,
    @Inject(SUBMISSION_STORE) private readonly submissions: SubmissionStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly commands: CommandBus,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    // T3 — deleting a BOQ item takes its build-up along; the build-up's bid-time source links go
    // with it. Optional (and LAST) so directly-constructed test services need not supply it.
    @Optional() @Inject(ESTIMATE_SOURCE_STORE) private readonly estimateSources: EstimateSourceStore | null = null,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewTender, Tender>({
      name: CREATE_TENDER,
      permission: 'tendering.tender.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('tender title is required');
      },
      handler: async (command, tx) => {
        const tender = makeTender(command.payload);
        if (!tender.reference) {
          tender.reference = await this.numbering.generateNextNumber(
            tender.tenantId,
            tender.companyId,
            'tendering',
            'tender',
            'TND',
          );
        }
        const event = makeEvent({
          type: TENDER_EVENT.created,
          tenantId: tender.tenantId,
          companyId: tender.companyId,
          actorId: tender.createdBy,
          aggregateType: 'tendering.tender',
          aggregateId: tender.id,
          payload: {
            title: tender.title,
            status: tender.status,
            value: tender.value,
            account: tender.accountId
              ? { id: tender.accountId, name: tender.accountName }
              : null,
          },
        });
        await this.store.createWithClient(tx, tender);
        // T2 invariant — every tender at/past `submitted` carries a submission record. A tender
        // BORN submitted (the deal-chain reactor's auto-tender from a won opportunity) gets its
        // record here, in the same tx; command idempotency keeps a retry from writing a second.
        if (tender.status === 'submitted' || tender.status === 'won' || tender.status === 'lost') {
          await this.submissions.saveWithClient(tx, makeTenderSubmission({
            tenantId: tender.tenantId,
            companyId: tender.companyId,
            tenderId: tender.id,
            tenderTitle: tender.title,
            submittedBy: tender.createdBy,
            submittedValue: tender.value,
            notes: 'Recorded automatically — tender was created already submitted (deal chain).',
            createdBy: tender.createdBy,
          }));
        }
        await this.events.appendWithClient(tx, [event]);
        this.logger.log(`Tender created: ${tender.title} (${tender.id}) value=${tender.value}`);
        return tender;
      },
    });
  }

  async create(input: NewTender, idempotencyKey?: string | null): Promise<Tender> {
    const tender = await this.commands.execute<Tender>({
      id: newId(),
      name: CREATE_TENDER,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
    await this.audit.log(
      tender.tenantId,
      tender.companyId,
      tender.createdBy,
      'tendering',
      'tender',
      tender.id,
      'create',
      { reference: tender.reference, value: tender.value },
    );
    return tender;
  }

  /** Update mutable fields on a tender (title, value, etc). */
  async update(id: Id, patch: Partial<Pick<Tender, 'title' | 'reference' | 'value' | 'accountId' | 'accountName' | 'ownerId' | 'submissionDeadline' | 'source'>>): Promise<Tender> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'tender', id);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: Tender = { ...existing, ...defined };
    const event = makeEvent({
      type: TENDER_EVENT.updated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'tendering.tender',
      aggregateId: updated.id,
      payload: { title: updated.title, value: updated.value },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Tender updated: ${updated.title} (${updated.id})`);
    return updated;
  }

  /**
   * Back-link a directly-registered tender to the CRM Opportunity created for it — the reverse of
   * "Start Tender". Stamps `sourceOpportunityId` and classifies the source as `opportunity` so the
   * Opportunity 360 composes this tender under it (the 360 filters tenders by that link). This is a
   * back-reference stamp, not a lifecycle change, so it emits NO event — it must not trip the
   * `tendering.tender.updated` BOQ-recalc reactor.
   */
  async linkOpportunity(tenderId: Id, opportunityId: Id): Promise<Tender> {
    const existing = assertSameTenant(await this.store.get(tenderId), this.tenant?.boundTenantId(), 'tender', tenderId);
    const updated: Tender = { ...existing, sourceOpportunityId: opportunityId, source: existing.source ?? 'opportunity' };
    await this.store.update(updated);
    this.logger.log(`Tender ${updated.title} (${updated.id}) back-linked to opportunity ${opportunityId}`);
    return updated;
  }

  /** Gather the facts the lifecycle gate needs from the sibling records — the bid decision and
   * whether anything is priced. Kept here so the gate stays pure and the caller stays simple. */
  async tenderEvidence(tenantId: Id, tenderId: Id): Promise<TenderGateEvidence> {
    const [scores, buildUps, subs] = await Promise.all([
      this.bidScores.list({ tenantId, tenderId }),
      this.estimates.listByTender(tenantId, tenderId),
      this.submissions.list({ tenantId, tenderId, limit: 1 }),
    ]);
    const latest = [...scores].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    return {
      bidRecommendation: latest?.recommendation ?? null,
      hasPricedEstimate: buildUps.some((b) => b.sellingRate > 0),
      hasSubmission: subs.length > 0,
    };
  }

  /**
   * Transition a tender's status. T1 — the transition is GOVERNED: `checkTenderTransition` refuses
   * an illegal jump (e.g. `draft → submitted` with no bid decision or nothing priced) before any
   * write happens. Emits specific events — `bid_decided` on committing to bid, `priced` on pricing,
   * `awarded` on a win (which drives Contract auto-creation) — that trigger cross-module automation.
   */
  async changeStatus(id: Id, status: TenderStatus): Promise<Tender> {
    // T2 — `submitted` is not a plain status flip: it is the submission fact being recorded.
    // Routing the flip through submit() keeps the invariant (submitted ⇒ a record exists) true
    // by construction; a status-only caller just gets a record with no channel details.
    if (status === 'submitted') return (await this.submit(id)).tender;

    // ADR-0021 — `won` is NOT a status you flip. A tender win is a customer award, and an award
    // without captured evidence cannot produce a trustworthy contracted value. `award()` is the one
    // governed path: it validates the evidence, persists it, transitions and emits in a single
    // transaction, so no window exists in which a deal is Won while its evidence is half-captured.
    //
    // No `closeWonUnevidenced()` companion is offered, deliberately: an audit of every caller found
    // none that needs one. Unevidenced wins still exist — historical rows, and the deal-chain
    // auto-tender that is BORN `won` via create() — and they keep reading LEGACY_WON, which is the
    // honest answer rather than a failure.
    if (status === 'won') {
      throw new Error(
        "A tender can only be won through the governed award command: capture the customer's award evidence (awarded value, currency and award date) via award()",
      );
    }

    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'tender', id);

    const evidence = await this.tenderEvidence(existing.tenantId, id);
    const check = checkTenderTransition(existing, status, evidence);
    if (!check.allowed) throw new Error(tenderGateMessage(status, check.gaps));

    const updated: Tender = { ...existing, status };

    // `won` never reaches here — the governed-award guard above rejects it, so `awarded` is emitted
    // only by award(), which is what makes "an awarded event always carries award evidence" true.
    const eventType = status === 'lost' ? TENDER_EVENT.lost
      // `submitted` never reaches here — the early return above routes it through submit().
      : status === 'declined' ? TENDER_EVENT.declined
      // Entering `estimating` IS the go/conditional bid decision being acted on (§2.2 bid.decided);
      // `priced` is the quote being priced (§2.2 quote.priced).
      : status === 'estimating' ? TENDER_EVENT.bidDecided
      : status === 'priced' ? TENDER_EVENT.priced
      : TENDER_EVENT.updated;

    const event = makeEvent({
      type: eventType,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'tendering.tender',
      aggregateId: updated.id,
      payload: {
        title: updated.title,
        status: updated.status,
        value: updated.value,
        // The decision that gated this move — so a subscriber to bid_decided sees go vs conditional.
        bidRecommendation: evidence.bidRecommendation ?? null,
        account: updated.accountId
          ? { id: updated.accountId, name: updated.accountName }
          : null,
      },
    });

    // Atomic: the status update and its (cross-module-triggering) event commit together.
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Tender ${updated.title} → ${status}`);
    return updated;
  }

  /**
   * ADR-0021 — AWARD the tender: the single governed path to `won`.
   *
   * One command, one transaction: validate the customer's award evidence, persist it, transition the
   * tender and emit `tendering.tender.awarded` together. Splitting this into "close the tender, then
   * add evidence later" would leave a window in which the deal is Won while its award evidence is
   * half-captured — and the downstream reactors would run in exactly that window.
   *
   * WHAT IS BEING CAPTURED is what the CUSTOMER awarded. Not `tender.value` (our estimate), not the
   * submitted bid (what we offered), not a BOQ or estimate total (our build-up). None of those is an
   * award, and none of them may ever be substituted for one.
   *
   * IDEMPOTENT: the store's capture is `WHERE award_evidence IS NULL`, so a redelivered or repeated
   * award reports a replay and returns the tender unchanged rather than overwriting the original
   * award — a second award must never silently rewrite the first one's provenance.
   *
   * The `won` gate still applies. Award evidence justifies the win; it does not excuse a tender that
   * was never submitted.
   */
  async award(
    id: Id,
    evidence: NewTenderAwardEvidence,
    /**
     * The approved commercial basis AS IT STOOD AT THE AWARD, when one exists. Resolved by the APP
     * layer and passed in, because only that layer may read across tendering -> quotation ->
     * baseline; this module states what it will accept. Omitted or null means no basis exists yet,
     * which is a legitimate award: the tender wins and NO contract is created until one is linked.
     *
     * NEVER synthesised from `tender.value`. An estimate is not an approved offer.
     */
    basis?: Omit<NewTenderCommercialBasis, 'kind' | 'establishedAt'> | null,
  ): Promise<Tender> {
    // Validate BEFORE anything else: an invalid award must not reach a gate check, a store or a bus.
    const captured: TenderAwardEvidence = makeTenderAwardEvidence(evidence);

    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'tender', id);

    // Already evidenced. Two very different situations share this branch and must NOT share an
    // outcome:
    //   · the SAME award arriving twice (a retry, an at-least-once redelivery) — idempotent no-op
    //   · a DIFFERENT award for a tender already awarded — a genuine conflict
    // Returning the stored tender for both would mean a caller who submitted a different amount got
    // a 200 and a body quietly contradicting what they sent. Not overwriting is necessary but not
    // sufficient: the conflict has to be visible. `already` classifies to 409.
    if (existing.awardEvidence) {
      const prior = existing.awardEvidence;
      const sameAward =
        prior.awardedValue === captured.awardedValue &&
        prior.currency === captured.currency &&
        prior.awardedAt === captured.awardedAt &&
        prior.awardReference === captured.awardReference &&
        prior.evidenceDocumentId === captured.evidenceDocumentId;
      if (sameAward) {
        this.logger.log(`Tender ${existing.title} — identical award replayed, ignored (idempotent)`);
        return existing;
      }
      throw new Error(
        `Tender has already been awarded (${prior.currency} ${prior.awardedValue} on ${prior.awardedAt}): ` +
          'award evidence is captured once and never rewritten',
      );
    }

    const gate = await this.tenderEvidence(existing.tenantId, id);
    const check = checkTenderTransition(existing, 'won', gate);
    if (!check.allowed) throw new Error(tenderGateMessage('won', check.gaps));

    // The basis is fixed at the AWARD instant, not at whatever time a downstream reactor runs.
    const atAward: TenderCommercialBasis | null = basis
      ? makeTenderCommercialBasis({ ...basis, kind: 'AT_AWARD', establishedAt: captured.awardedAt })
      : null;

    const updated: Tender = { ...existing, status: 'won', awardEvidence: captured, commercialBasis: atAward };

    const event = makeEvent({
      type: TENDER_EVENT.awarded,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: captured.capturedBy,
      aggregateType: 'tendering.tender',
      aggregateId: updated.id,
      payload: {
        title: updated.title,
        status: updated.status,
        // The tender's own ESTIMATE. Kept because the contract reactor still falls back to it when
        // no baseline exists — and named `value` there exactly as before, so this stays compatible.
        // It is NOT the award: consumers read `awardedValue` for that, or the tender itself.
        value: updated.value,
        bidRecommendation: gate.bidRecommendation ?? null,
        account: updated.accountId ? { id: updated.accountId, name: updated.accountName } : null,
        // ADR-0021 — the award facts on the wire, so the event is self-describing. A subscriber must
        // still RE-READ the live tender before acting on them (the Slice 9 rule): the payload is a
        // snapshot of one moment on a bus that delivers at-least-once and out of order.
        awardedValue: captured.awardedValue,
        currency: captured.currency,
        awardedAt: captured.awardedAt,
        awardReference: captured.awardReference,
        evidenceDocumentId: captured.evidenceDocumentId,
        // Whether a contract can be built from this award at all. Subscribers still RE-READ the
        // tender (the basis is immutable, so live == award-time); this is for observability.
        commercialBasisEstablished: atAward !== null,
      },
    });

    await this.tx.run(async (handle) => {
      // Write-once capture; `false` means another writer got there first inside this window.
      const stamped = await this.store.awardWithClient(handle, id, captured);
      if (!stamped) throw new Error('Tender has already been awarded: award evidence is captured once and never rewritten');
      // Same transaction as the award it justifies — there is no window where a tender is won with
      // a half-established basis, and none where the basis outlives a rolled-back award.
      if (atAward) await this.store.linkCommercialBasisWithClient(handle, id, atAward);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(
      `Tender ${updated.title} AWARDED — ${captured.currency} ${captured.awardedValue} (excl. VAT) at ${captured.awardedAt}` +
        (captured.awardReference ? `, ref ${captured.awardReference}` : ', no reference captured'),
    );
    return updated;
  }

  /**
   * ADR-0021 follow-up — link a commercial basis that was locked AFTER the award (the deferred path).
   *
   * A tender can legitimately be won before anything is priced through an approved quotation. When
   * that happens no contract is created — inventing one from `tender.value` would put our own
   * estimate into a contractual value, and into payment-certificate maths downstream. The tender
   * simply reads "awaiting commercial basis" until a baseline actually locks.
   *
   * Recorded as `POST_AWARD_LINKED`, never as `AT_AWARD`: it is a different historical claim, and
   * flattening the two would misdate the basis by however long the wait was.
   *
   * The CALLER (the app layer) owns the cross-module guards it alone can check — that the baseline
   * belongs to THIS tender, and that no contract exists yet. This method owns what the aggregate
   * knows: the tender is won, and a basis is established exactly once.
   *
   * Returns the tender unchanged when a basis already exists. That is the race that matters: a
   * second, different baseline locking later must NEVER re-base a contract that has already been
   * built — so this reports the no-op instead of overwriting.
   */
  async linkCommercialBasis(
    id: Id,
    basis: Omit<NewTenderCommercialBasis, 'kind'>,
  ): Promise<{ tender: Tender; linked: boolean }> {
    const established = makeTenderCommercialBasis({ ...basis, kind: 'POST_AWARD_LINKED' });
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'tender', id);

    // A basis presupposes the award. Anything else is a caller bug, not a race.
    if (existing.status !== 'won') {
      throw new Error('A commercial basis can only be linked to a tender that has been won');
    }
    if (existing.commercialBasis) {
      this.logger.log(
        `Tender ${existing.title} already has a commercial basis (${existing.commercialBasis.kind}, baseline ` +
          `${existing.commercialBasis.baselineId}) — ignoring baseline ${established.baselineId}`,
      );
      return { tender: existing, linked: false };
    }

    const linked = await this.store.linkCommercialBasisWithClient(null, id, established);
    if (!linked) {
      // Lost a race with a concurrent writer; theirs stands.
      return { tender: (await this.store.get(id)) ?? existing, linked: false };
    }
    this.logger.log(
      `Tender ${existing.title} — commercial basis linked AFTER award: baseline ${established.baselineId} ` +
        `(quotation ${established.quotationId}, value ${established.value}) locked ${established.establishedAt}`,
    );
    return { tender: { ...existing, commercialBasis: established }, linked: true };
  }

  /**
   * T2 — submit the bid: the `→ submitted` transition WITH its facts. Runs the same gate as any
   * transition, then commits the status change, the TenderSubmission record and the `submitted`
   * event in one tx. Calling it on an already-submitted tender records a RESUBMISSION (a second
   * fact — e.g. against a later addendum), never an edit of the first.
   */
  async submit(
    id: Id,
    details: Omit<NewTenderSubmission, 'tenantId' | 'companyId' | 'tenderId' | 'tenderTitle' | 'submittedValue'> = {},
  ): Promise<{ tender: Tender; submission: TenderSubmission }> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'tender', id);

    const evidence = await this.tenderEvidence(existing.tenantId, id);
    const check = checkTenderTransition(existing, 'submitted', evidence);
    if (!check.allowed) throw new Error(tenderGateMessage('submitted', check.gaps));

    const submission = makeTenderSubmission({
      ...details,
      tenantId: existing.tenantId,
      companyId: existing.companyId,
      tenderId: existing.id,
      tenderTitle: existing.title,
      // The offer as it stands right now — a snapshot later BOQ edits cannot rewrite.
      submittedValue: existing.value,
    });
    const updated: Tender = { ...existing, status: 'submitted' };

    const event = makeEvent({
      type: TENDER_EVENT.submitted,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: submission.submittedBy,
      aggregateType: 'tendering.tender',
      aggregateId: updated.id,
      payload: {
        title: updated.title,
        status: updated.status,
        value: updated.value,
        submission: {
          id: submission.id,
          submittedAt: submission.submittedAt,
          submittedBy: submission.submittedBy,
          method: submission.method,
          portal: submission.portal,
          reference: submission.reference,
          submittedValue: submission.submittedValue,
        },
        account: updated.accountId
          ? { id: updated.accountId, name: updated.accountName }
          : null,
      },
    });

    // Atomic: the record, the status and the event are one fact — none may exist without the others.
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.submissions.saveWithClient(handle, submission);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Tender ${updated.title} submitted (${submission.method}${submission.reference ? ` ref=${submission.reference}` : ''}) value=${submission.submittedValue}`);
    return { tender: updated, submission };
  }

  /** The submission records on a tender, latest first. */
  listSubmissions(tenantId: Id, tenderId: Id): Promise<TenderSubmission[]> {
    return this.submissions.list({ tenantId, tenderId });
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Tender | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: TenderFilter): Promise<Tender[]> {
    return this.store.list(filter);
  }

  listPaged(filter: TenderFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }

  // ── BOQ & Cost Estimating ─────────────────────────────────────

  async getOrCreateBOQ(tenantId: string, companyId: string | null, tenderId: Id): Promise<{ boq: BOQ; items: BOQItem[] }> {
    let boq = await this.boqStore.getBOQByTender(tenantId, tenderId);
    if (!boq) {
      boq = makeBOQ({ tenantId, companyId, tenderId });
      await this.boqStore.saveBOQ(boq);
    }
    const items = await this.boqStore.getBOQItems(tenantId, boq.id);
    return { boq, items };
  }

  async addBOQItem(
    tenantId: string,
    companyId: string | null,
    boqId: Id,
    input: Omit<NewBOQItem, 'tenantId' | 'companyId' | 'boqId'>,
  ): Promise<BOQItem> {
    const item = makeBOQItem({
      tenantId,
      companyId,
      boqId,
      ...input,
    });
    await this.boqStore.saveBOQItem(item);
    await this.recalculateTenderValue(tenantId, boqId);
    return item;
  }

  async updateBOQItem(
    tenantId: string,
    id: Id,
    patch: Partial<Pick<BOQItem, 'itemCode' | 'description' | 'unit' | 'quantity' | 'rate' | 'ifcGuid'>>,
  ): Promise<BOQItem> {
    const existing = await this.boqStore.getBOQItem(tenantId, id);
    if (!existing) throw new Error(`BOQ item ${id} not found`);

    // T3 — the estimate is the UNIQUE author of a priced item's rate. Once a build-up exists,
    // a hand-typed rate would silently diverge from the governed roll-up; the only ways to
    // reprice are re-estimating or removing the estimate. ("only … can" phrasing → 409.)
    if (patch.rate !== undefined && Number(patch.rate) !== existing.rate) {
      const buildUp = await this.estimates.getByBoqItem(tenantId, id);
      if (buildUp) {
        throw new Error(
          `only the estimate can reprice BOQ item ${existing.itemCode} — it carries a rate build-up (selling rate ${buildUp.sellingRate}); rebuild the estimate to change the rate, or delete the build-up to hand-price the item`,
        );
      }
    }

    const quantity = patch.quantity !== undefined ? Number(patch.quantity) : existing.quantity;
    const rate = patch.rate !== undefined ? Number(patch.rate) : existing.rate;

    const updated: BOQItem = {
      ...existing,
      itemCode: patch.itemCode !== undefined ? patch.itemCode.trim() : existing.itemCode,
      description: patch.description !== undefined ? patch.description.trim() : existing.description,
      unit: patch.unit !== undefined ? patch.unit.trim() : existing.unit,
      quantity,
      rate,
      totalAmount: quantity * rate,
      ifcGuid: patch.ifcGuid !== undefined ? patch.ifcGuid : existing.ifcGuid,
      updatedAt: new Date().toISOString(),
    };

    await this.boqStore.saveBOQItem(updated);
    await this.recalculateTenderValue(tenantId, existing.boqId);
    return updated;
  }

  async deleteBOQItem(tenantId: string, id: Id): Promise<void> {
    const existing = await this.boqStore.getBOQItem(tenantId, id);
    if (!existing) return;
    // T3 — one build-up per BOQ item means no orphans: the item's build-up (and that build-up's
    // bid-time source links) leave with it.
    const buildUp = await this.estimates.getByBoqItem(tenantId, id);
    if (buildUp) {
      await this.estimates.delete(buildUp.id);
      await this.estimateSources?.removeByBuildUp(tenantId, buildUp.id);
    }
    await this.boqStore.deleteBOQItem(tenantId, id);
    await this.recalculateTenderValue(tenantId, existing.boqId);
  }

  /**
   * Bulk-import BOQ items (T5). `replace: true` clears the existing BOQ first — and each
   * cleared item takes its rate build-up and bid-time source links with it (the T3 no-orphans
   * rule), because a replaced scope's old estimates describe lines that no longer exist.
   * Default is append (a second sheet adds to the bill). The tender value recomputes once.
   */
  async importBOQItems(
    tenantId: string,
    companyId: string | null,
    boqId: Id,
    itemsInput: Array<Omit<NewBOQItem, 'tenantId' | 'companyId' | 'boqId'>>,
    options: { replace?: boolean } = {},
  ): Promise<{ items: BOQItem[]; replaced: number }> {
    let replaced = 0;
    if (options.replace) {
      const existing = await this.boqStore.getBOQItems(tenantId, boqId);
      for (const item of existing) {
        const buildUp = await this.estimates.getByBoqItem(tenantId, item.id);
        if (buildUp) {
          await this.estimates.delete(buildUp.id);
          await this.estimateSources?.removeByBuildUp(tenantId, buildUp.id);
        }
        await this.boqStore.deleteBOQItem(tenantId, item.id);
      }
      replaced = existing.length;
    }

    const createdItems: BOQItem[] = [];
    for (const itemInput of itemsInput) {
      const item = makeBOQItem({
        tenantId,
        companyId,
        boqId,
        ...itemInput,
      });
      await this.boqStore.saveBOQItem(item);
      createdItems.push(item);
    }
    await this.recalculateTenderValue(tenantId, boqId);
    return { items: createdItems, replaced };
  }

  /** Recompute the tender's value from its BOQ totals. Public because the estimate engine calls
   * it after writing a governed selling rate onto an item (T3) — the tender value must follow the
   * roll-up the moment the roll-up lands, not on the next unrelated BOQ edit. */
  async recalculateTenderValue(tenantId: string, boqId: Id): Promise<void> {
    const boq = await this.boqStore.findBOQ(tenantId, boqId);
    if (!boq) return;

    const items = await this.boqStore.getBOQItems(tenantId, boqId);
    const totalEstimate = items.reduce((sum, item) => sum + item.totalAmount, 0);

    const existingTender = await this.store.get(boq.tenderId);
    if (existingTender) {
      existingTender.value = totalEstimate;
      const event = makeEvent({
        type: TENDER_EVENT.updated,
        tenantId: existingTender.tenantId,
        companyId: existingTender.companyId,
        actorId: null,
        aggregateType: 'tendering.tender',
        aggregateId: existingTender.id,
        payload: { title: existingTender.title, value: existingTender.value },
      });
      await this.tx.run(async (handle) => {
        await this.store.updateWithClient(handle, existingTender);
        await this.events.appendWithClient(handle, [event]);
      });
      this.logger.log(`Tender ${existingTender.title} value recalculated from BOQ: value=${existingTender.value}`);
    }
  }
}
