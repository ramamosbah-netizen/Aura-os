import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { makeStockTransfer, TRANSFER_EVENT, type StockTransfer, type NewStockTransfer } from './domain/stock-transfer';
import { TRANSFER_STORE, type TransferFilter, type TransferStore } from './transfer-store';
import { StockService } from './stock.service';

@Injectable()
export class TransferService {
  private readonly logger = new Logger('StockTransfer');

  constructor(
    @Inject(TRANSFER_STORE) private readonly store: TransferStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly stock: StockService,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async execute(input: NewStockTransfer): Promise<StockTransfer> {
    const source = await this.stock.getItem(input.sourceItemId);
    if (!source) throw new Error(`source item ${input.sourceItemId} not found`);
    const dest = await this.stock.getItem(input.destItemId);
    if (!dest) throw new Error(`destination item ${input.destItemId} not found`);

    const transfer = makeStockTransfer(input);

    await this.stock.recordMovement(source.id, 'out', transfer.quantity, `transfer → ${dest.warehouse}`);
    await this.stock.recordMovement(dest.id, 'in', transfer.quantity, `transfer ← ${source.warehouse}`);

    await this.store.save(transfer);
    await this.events.append([
      makeEvent({
        type: TRANSFER_EVENT.completed,
        tenantId: transfer.tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'inventory.transfer',
        aggregateId: transfer.id,
        payload: { sourceItemId: source.id, destItemId: dest.id, quantity: transfer.quantity },
      }),
    ]);
    this.logger.log(`Transfer ${transfer.quantity} ${source.unit} of ${source.code}: ${source.warehouse} → ${dest.warehouse}`);
    return transfer;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<StockTransfer | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: TransferFilter): Promise<StockTransfer[]> {
    return this.store.list(filter);
  }

  listPaged(filter: TransferFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
