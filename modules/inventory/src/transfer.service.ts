import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
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

  get(id: Id): Promise<StockTransfer | null> {
    return this.store.get(id);
  }

  list(filter?: TransferFilter): Promise<StockTransfer[]> {
    return this.store.list(filter);
  }
}
