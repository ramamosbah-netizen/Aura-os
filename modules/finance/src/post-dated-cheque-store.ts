import type { Id } from '@aura/shared';
import type { PostDatedCheque, ChequeStatus, ChequeDirection } from './domain/post-dated-cheque';

export const POST_DATED_CHEQUE_STORE = Symbol('POST_DATED_CHEQUE_STORE');

export interface PostDatedChequeFilter {
  tenantId?: string;
  status?: ChequeStatus;
  direction?: ChequeDirection;
  limit?: number;
}

export interface PostDatedChequeStore {
  save(cheque: PostDatedCheque): Promise<void>;
  get(id: Id): Promise<PostDatedCheque | null>;
  list(filter?: PostDatedChequeFilter): Promise<PostDatedCheque[]>;
}
