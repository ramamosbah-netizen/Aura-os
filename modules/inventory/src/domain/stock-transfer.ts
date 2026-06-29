import { type Id, newId } from '@aura/shared';

/**
 * Stock Transfer — moves quantity from one warehouse to another for the same SKU.
 * Internally creates an 'out' movement on the source item and an 'in' on the destination.
 */
export type TransferStatus = 'pending' | 'completed' | 'cancelled';

export interface StockTransfer {
  id: Id;
  tenantId: Id;
  sourceItemId: Id;
  destItemId: Id;
  quantity: number;
  reason: string;
  status: TransferStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface NewStockTransfer {
  tenantId: Id;
  sourceItemId: Id;
  destItemId: Id;
  quantity: number;
  reason?: string;
}

export function makeStockTransfer(input: NewStockTransfer): StockTransfer {
  const q = Number(input.quantity);
  if (!Number.isFinite(q) || q <= 0) throw new Error('transfer quantity must be positive');
  if (input.sourceItemId === input.destItemId) throw new Error('source and destination must differ');
  return {
    id: newId(),
    tenantId: input.tenantId,
    sourceItemId: input.sourceItemId,
    destItemId: input.destItemId,
    quantity: q,
    reason: input.reason?.trim() || 'warehouse transfer',
    status: 'completed',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

export const TRANSFER_EVENT = {
  completed: 'inventory.stock.transfer_completed',
} as const;
