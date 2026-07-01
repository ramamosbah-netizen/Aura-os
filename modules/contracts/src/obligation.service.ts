import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  OBLIGATION_EVENT,
  type ContractObligation,
  type NewContractObligation,
  type ObligationStatus,
  makeContractObligation,
  setObligationStatus,
  isOverdue,
} from './domain/contract-obligation';
import { OBLIGATION_STORE, type ObligationFilter, type ObligationStore } from './obligation-store';

/** Contract obligation tracking — deliverables/milestones/compliance with due-date reminders. */
@Injectable()
export class ObligationService {
  private readonly logger = new Logger('Contracts');

  constructor(
    @Inject(OBLIGATION_STORE) private readonly store: ObligationStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewContractObligation): Promise<ContractObligation> {
    const o = makeContractObligation(input);
    await this.store.save(o);
    await this.events.append([
      makeEvent({
        type: OBLIGATION_EVENT.created,
        tenantId: o.tenantId, companyId: o.companyId, actorId: o.createdBy,
        aggregateType: 'contracts.obligation', aggregateId: o.id,
        payload: { contractId: o.contractId, title: o.title, dueDate: o.dueDate, type: o.obligationType },
      }),
    ]);
    this.logger.log(`Obligation created: ${o.title} due ${o.dueDate} (contract ${o.contractId})`);
    return o;
  }

  async changeStatus(id: Id, status: ObligationStatus, on?: string): Promise<ContractObligation> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`obligation ${id} not found`);
    const updated = setObligationStatus(existing, status, on);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: OBLIGATION_EVENT.statusChanged,
        tenantId: updated.tenantId, companyId: updated.companyId, actorId: null,
        aggregateType: 'contracts.obligation', aggregateId: id,
        payload: { title: updated.title, status: updated.status },
      }),
    ]);
    return updated;
  }

  get(id: Id): Promise<ContractObligation | null> {
    return this.store.get(id);
  }

  list(filter?: ObligationFilter): Promise<ContractObligation[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ObligationFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }

  /** Open obligations that are overdue or due within `withinDays` — the reminder feed. */
  async dueSoon(tenantId: Id, withinDays = 14, asOf?: string): Promise<ContractObligation[]> {
    const now = asOf ?? new Date().toISOString().slice(0, 10);
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + withinDays);
    const horizonStr = horizon.toISOString().slice(0, 10);
    const all = await this.store.list({ tenantId, limit: 1000 });
    return all
      .filter((o) => o.status !== 'met' && o.status !== 'waived' && (isOverdue(o, now) || o.dueDate <= horizonStr))
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  }
}
