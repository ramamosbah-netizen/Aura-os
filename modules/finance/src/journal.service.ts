import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { FINANCE_EVENT } from './domain/invoice';
import { type Journal, type NewJournal, makeJournal } from './domain/journal';
import { JOURNAL_STORE, type JournalFilter, type JournalStore } from './journal-store';

@Injectable()
export class JournalService {
  private readonly logger = new Logger('FinanceJournal');

  constructor(
    @Inject(JOURNAL_STORE) private readonly store: JournalStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  async post(input: NewJournal, actorId?: Id): Promise<Journal> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      const target: AccessTarget = { permission: 'finance.journal.post', orgPath };
      this.access.assert(actorId, target);
    }

    const journal = makeJournal(input);
    await this.store.create(journal);

    await this.events.append([
      makeEvent({
        type: FINANCE_EVENT.journalPosted,
        tenantId: journal.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'finance.journal',
        aggregateId: journal.id,
        payload: {
          reference: journal.reference,
          description: journal.description,
          lines: journal.lines.map((l) => ({
            accountCode: l.accountCode,
            debit: l.debit,
            credit: l.credit,
          })),
        },
      }),
    ]);

    this.logger.log(`Journal posted: ${journal.description} (${journal.id})`);
    return journal;
  }

  get(id: Id): Promise<Journal | null> {
    return this.store.get(id);
  }

  list(filter?: JournalFilter): Promise<Journal[]> {
    return this.store.list(filter);
  }
}
