import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { CLAUSE_EVENT, type ContractClause, type NewContractClause, type ClauseCategory, makeContractClause, reviseClause } from './domain/contract-clause';
import { CLAUSE_STORE, type ClauseFilter, type ClauseStore } from './clause-store';

/** Clause library — reusable, tenant-scoped contract-language templates. Owns `aura_contracts_clauses`. */
@Injectable()
export class ClauseService {
  private readonly logger = new Logger('Contracts');

  constructor(
    @Inject(CLAUSE_STORE) private readonly store: ClauseStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewContractClause): Promise<ContractClause> {
    const clause = makeContractClause(input);
    await this.store.save(clause);
    await this.events.append([
      makeEvent({
        type: CLAUSE_EVENT.created,
        tenantId: clause.tenantId, companyId: clause.companyId, actorId: clause.createdBy,
        aggregateType: 'contracts.clause', aggregateId: clause.id,
        payload: { code: clause.code, category: clause.category },
      }),
    ]);
    this.logger.log(`Clause created: ${clause.code} (${clause.category})`);
    return clause;
  }

  async revise(id: Id, patch: { title?: string; body?: string; category?: ClauseCategory; tags?: string[]; active?: boolean }): Promise<ContractClause> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`clause ${id} not found`);
    const updated = reviseClause(existing, patch);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CLAUSE_EVENT.revised,
        tenantId: updated.tenantId, companyId: updated.companyId, actorId: null,
        aggregateType: 'contracts.clause', aggregateId: id,
        payload: { code: updated.code, revision: updated.revision },
      }),
    ]);
    return updated;
  }

  get(id: Id): Promise<ContractClause | null> {
    return this.store.get(id);
  }

  list(filter?: ClauseFilter): Promise<ContractClause[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ClauseFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
