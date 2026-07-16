import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  CLARIFICATION_EVENT,
  type NewTenderClarification,
  type TenderClarification,
  makeTenderClarification,
  withAnswer,
} from './domain/clarification';
import { CLARIFICATION_STORE, type ClarificationFilter, type ClarificationStore } from './clarification-store';
import { TenderService } from './tender.service';

/**
 * Clarification/addendum service (T4 register depth) — the Q&A and change traffic on a tender.
 * Owns `aura_tendering_clarifications`, emits `tendering.clarification.*`. Separate from
 * TenderService (same split as BidScoreService/WinLossService).
 */
@Injectable()
export class ClarificationService {
  private readonly logger = new Logger('Tendering');

  constructor(
    @Inject(CLARIFICATION_STORE) private readonly store: ClarificationStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // An addendum that extends the deadline mirrors it onto the tender, so the register's
    // urgency reads the extended reality. Explicit @Inject token — the union-typed @Optional
    // param would silently inject null (the platform's known gotcha).
    @Optional() @Inject(TenderService) private readonly tenders: TenderService | null = null,
  ) {}

  async record(input: NewTenderClarification): Promise<TenderClarification> {
    const clarification = makeTenderClarification(input);
    await this.store.save(clarification);

    // The addendum's granted extension becomes the tender's working deadline.
    if (clarification.kind === 'addendum' && clarification.deadlineExtendedTo && this.tenders) {
      await this.tenders.update(clarification.tenderId, { submissionDeadline: clarification.deadlineExtendedTo });
    }

    await this.events.append([
      makeEvent({
        type: CLARIFICATION_EVENT.recorded,
        tenantId: clarification.tenantId,
        companyId: clarification.companyId,
        actorId: clarification.createdBy,
        aggregateType: 'tendering.clarification',
        aggregateId: clarification.id,
        payload: {
          tenderId: clarification.tenderId,
          kind: clarification.kind,
          reference: clarification.reference,
          title: clarification.title,
          deadlineExtendedTo: clarification.deadlineExtendedTo,
        },
      }),
    ]);
    this.logger.log(
      `${clarification.kind === 'addendum' ? 'Addendum' : 'Clarification'} recorded on tender ${clarification.tenderId}: ${clarification.title}` +
        (clarification.deadlineExtendedTo ? ` (deadline → ${clarification.deadlineExtendedTo})` : ''),
    );
    return clarification;
  }

  /** Answer a clarification / acknowledge an addendum. */
  async answer(tenantId: Id, id: Id, answer: string, actorId: Id | null = null): Promise<TenderClarification> {
    const existing = await this.store.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error(`clarification ${id} not found`);
    if (existing.answeredAt) {
      throw new Error(`clarification ${existing.title} is already ${existing.kind === 'addendum' ? 'acknowledged' : 'answered'}`);
    }
    const updated = withAnswer(existing, answer);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CLARIFICATION_EVENT.answered,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId,
        aggregateType: 'tendering.clarification',
        aggregateId: updated.id,
        payload: { tenderId: updated.tenderId, kind: updated.kind, reference: updated.reference },
      }),
    ]);
    return updated;
  }

  get(id: Id): Promise<TenderClarification | null> {
    return this.store.get(id);
  }

  list(filter?: ClarificationFilter): Promise<TenderClarification[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ClarificationFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
