import type { PurchaseRequestLine } from './domain/purchase-request-line';

export const PR_LINE_STORE = Symbol('PR_LINE_STORE');

export interface PurchaseRequestLineStore {
  save(line: PurchaseRequestLine): Promise<void>;
  find(id: string, tenantId: string): Promise<PurchaseRequestLine | null>;
  /** Every line on one requisition, in line order. */
  listForRequest(prId: string, tenantId: string): Promise<PurchaseRequestLine[]>;
  remove(id: string, tenantId: string): Promise<void>;
}
