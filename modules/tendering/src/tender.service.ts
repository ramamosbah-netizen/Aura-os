import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxRunner } from '@aura/core';
import { TENDER_EVENT, type Tender, type TenderStatus, type NewTender, makeTender } from './domain/tender';
import { TENDER_STORE, type TenderFilter, type TenderStore } from './tender-store';
import { BOQ_STORE, type BOQStore } from './boq-store';
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
  async update(id: Id, patch: Partial<Pick<Tender, 'title' | 'reference' | 'value' | 'accountId' | 'accountName' | 'ownerId'>>): Promise<Tender> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`tender ${id} not found`);
    const updated: Tender = { ...existing, ...patch };
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
   * Transition a tender's status. Emits specific events like `tender.awarded`
   * that trigger cross-module automation (e.g. auto-create a Contract).
   */
  async changeStatus(id: Id, status: TenderStatus): Promise<Tender> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`tender ${id} not found`);
    const updated: Tender = { ...existing, status };

    const eventType = status === 'won' ? TENDER_EVENT.awarded
      : status === 'lost' ? TENDER_EVENT.lost
      : status === 'submitted' ? TENDER_EVENT.submitted
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
