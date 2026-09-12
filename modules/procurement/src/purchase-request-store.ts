import type { Id, Page, PageParams } from '@aura/shared';
import type { PurchaseRequest } from './domain/purchase-request';

export const PURCHASE_REQUEST_STORE = Symbol('PURCHASE_REQUEST_STORE');

export interface PurchaseRequestFilter {
  tenantId?: string;
  status?: string;
  projectId?: string;
  discipline?: string;
  limit?: number;
}

export interface PurchaseRequestStore {
  create(pr: PurchaseRequest): Promise<void>;
  update(pr: PurchaseRequest): Promise<void>;
  get(id: Id): Promise<PurchaseRequest | null>;
  /** LISTING, and capped by default. "Which requests belong to this project" is the read below. */
  list(filter?: PurchaseRequestFilter): Promise<PurchaseRequest[]>;
  listPaged(filter: PurchaseRequestFilter, page: PageParams): Promise<Page<PurchaseRequest>>;

  /**
   * The ids of every request on a project, uncapped (TC-GATE-19).
   *
   * IDS, because the only caller needs to know which requests belong to the project so it can
   * resolve RFQs back to it — not what the requests say. Asking for less is what makes an
   * unbounded read safe to have.
   */
  listIdsForProject(tenantId: Id, projectId: Id): Promise<string[]>;
}
