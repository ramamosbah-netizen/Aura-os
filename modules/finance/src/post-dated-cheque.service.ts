import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  POST_DATED_CHEQUE_EVENT,
  type PostDatedCheque,
  type NewPostDatedCheque,
  type ChequeAction,
  type ChequeSummary,
  makePostDatedCheque,
  applyChequeAction,
  isMaturingSoon,
  summariseCheques,
} from './domain/post-dated-cheque';
import { POST_DATED_CHEQUE_STORE, type PostDatedChequeFilter, type PostDatedChequeStore } from './post-dated-cheque-store';

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Post-dated cheque (PDC) service — owns `aura_finance_post_dated_cheques`, emits
 * `finance.post_dated_cheque.*`, and surfaces a maturity watch-list for treasury.
 */
@Injectable()
export class PostDatedChequeService {
  private readonly logger = new Logger('PostDatedCheque');

  constructor(
    @Inject(POST_DATED_CHEQUE_STORE) private readonly store: PostDatedChequeStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewPostDatedCheque): Promise<PostDatedCheque> {
    const c = makePostDatedCheque(input);
    await this.store.save(c);
    await this.events.append([
      makeEvent({
        type: POST_DATED_CHEQUE_EVENT.created,
        tenantId: c.tenantId,
        companyId: c.companyId,
        actorId: c.createdBy,
        aggregateType: 'finance.post_dated_cheque',
        aggregateId: c.id,
        payload: { chequeNumber: c.chequeNumber, direction: c.direction, amount: c.amount, maturityDate: c.maturityDate },
      }),
    ]);
    this.logger.log(`PDC ${c.chequeNumber} (${c.direction}) created: ${c.amount} ${c.currency}, matures ${c.maturityDate}`);
    return c;
  }

  async changeStatus(id: Id, action: ChequeAction): Promise<PostDatedCheque> {
    const c = await this.store.get(id);
    if (!c) throw new Error(`post-dated cheque ${id} not found`);
    const updated = applyChequeAction(c, action); // throws on invalid transition
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: POST_DATED_CHEQUE_EVENT.statusChanged,
        tenantId: c.tenantId, companyId: c.companyId, actorId: null,
        aggregateType: 'finance.post_dated_cheque', aggregateId: id,
        payload: { chequeNumber: c.chequeNumber, action, status: updated.status, bounceCount: updated.bounceCount },
      }),
    ]);
    this.logger.log(`PDC ${c.chequeNumber} ${action} → ${updated.status}`);
    return updated;
  }

  get(id: Id): Promise<PostDatedCheque | null> {
    return this.store.get(id);
  }

  list(filter?: PostDatedChequeFilter): Promise<PostDatedCheque[]> {
    return this.store.list(filter);
  }

  /** Pending cheques maturing within `withinDays` — the treasury watch-list (incl. overdue). */
  async maturingSoon(tenantId: string, withinDays = 7): Promise<PostDatedCheque[]> {
    const asOf = today();
    const all = await this.store.list({ tenantId, status: 'pending', limit: 500 });
    return all.filter((c) => isMaturingSoon(c, asOf, withinDays));
  }

  /** Open receivable vs payable exposure + watch-list/bounced counts. */
  async summary(tenantId: string, withinDays = 7): Promise<ChequeSummary> {
    const all = await this.store.list({ tenantId, limit: 1000 });
    return summariseCheques(all, today(), withinDays);
  }
}
