import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxRunner } from '@aura/core';
import { TENDER_EVENT, type Tender, type TenderStatus, type NewTender, makeTender } from './domain/tender';
import { checkTenderTransition, tenderGateMessage, type TenderGateEvidence } from './domain/tender-gate';
import { makeTenderSubmission, type NewTenderSubmission, type TenderSubmission } from './domain/submission';
import { TENDER_STORE, type TenderFilter, type TenderStore } from './tender-store';
import { BOQ_STORE, type BOQStore } from './boq-store';
import { BID_SCORE_STORE, type BidScoreStore } from './bid-score-store';
import { ESTIMATE_STORE, type EstimateStore } from './estimate-store';
import { SUBMISSION_STORE, type SubmissionStore } from './submission-store';
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
  async update(id: Id, patch: Partial<Pick<Tender, 'title' | 'reference' | 'value' | 'accountId' | 'accountName' | 'ownerId' | 'submissionDeadline'>>): Promise<Tender> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`tender ${id} not found`);
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

    const existing = await this.store.get(id);
    if (!existing) throw new Error(`tender ${id} not found`);

    const evidence = await this.tenderEvidence(existing.tenantId, id);
    const check = checkTenderTransition(existing, status, evidence);
    if (!check.allowed) throw new Error(tenderGateMessage(status, check.gaps));

    const updated: Tender = { ...existing, status };

    const eventType = status === 'won' ? TENDER_EVENT.awarded
      : status === 'lost' ? TENDER_EVENT.lost
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
   * T2 — submit the bid: the `→ submitted` transition WITH its facts. Runs the same gate as any
   * transition, then commits the status change, the TenderSubmission record and the `submitted`
   * event in one tx. Calling it on an already-submitted tender records a RESUBMISSION (a second
   * fact — e.g. against a later addendum), never an edit of the first.
   */
  async submit(
    id: Id,
    details: Omit<NewTenderSubmission, 'tenantId' | 'companyId' | 'tenderId' | 'tenderTitle' | 'submittedValue'> = {},
  ): Promise<{ tender: Tender; submission: TenderSubmission }> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`tender ${id} not found`);

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

  get(id: Id): Promise<Tender | null> {
    return this.store.get(id);
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
    await this.boqStore.deleteBOQItem(tenantId, id);
    await this.recalculateTenderValue(tenantId, existing.boqId);
  }

  async importBOQItems(
    tenantId: string,
    companyId: string | null,
    boqId: Id,
    itemsInput: Array<Omit<NewBOQItem, 'tenantId' | 'companyId' | 'boqId'>>,
  ): Promise<BOQItem[]> {
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
    return createdItems;
  }

  private async recalculateTenderValue(tenantId: string, boqId: Id): Promise<void> {
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
