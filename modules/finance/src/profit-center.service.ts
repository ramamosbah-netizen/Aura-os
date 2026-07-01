import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  PROFIT_CENTER_EVENT,
  type ProfitCenter,
  type NewProfitCenter,
  type ProfitCenterReport,
  makeProfitCenter,
  buildProfitCenterReport,
} from './domain/profit-center';
import { PROFIT_CENTER_STORE, type ProfitCenterStore } from './profit-center-store';
import { JOURNAL_STORE, type JournalStore } from './journal-store';

/** Profit-centre master + GL-folded contribution (credit − debit) report. */
@Injectable()
export class ProfitCenterService {
  private readonly logger = new Logger('FinanceProfitCenter');

  constructor(
    @Inject(PROFIT_CENTER_STORE) private readonly store: ProfitCenterStore,
    @Inject(JOURNAL_STORE) private readonly journals: JournalStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewProfitCenter): Promise<ProfitCenter> {
    const pc = makeProfitCenter(input);
    await this.store.save(pc);
    await this.events.append([
      makeEvent({
        type: PROFIT_CENTER_EVENT.created,
        tenantId: pc.tenantId, companyId: pc.companyId, actorId: pc.createdBy,
        aggregateType: 'finance.profit_center', aggregateId: pc.id,
        payload: { code: pc.code, name: pc.name },
      }),
    ]);
    this.logger.log(`Profit centre created: ${pc.code} ${pc.name}`);
    return pc;
  }

  list(tenantId: Id): Promise<ProfitCenter[]> {
    return this.store.list(tenantId);
  }

  async report(tenantId: Id): Promise<ProfitCenterReport> {
    const [centers, journals] = await Promise.all([
      this.store.list(tenantId),
      this.journals.list({ tenantId }),
    ]);
    const lines = journals.flatMap((j) => j.lines.map((l) => ({ debit: l.debit, credit: l.credit, profitCenterId: l.profitCenterId })));
    return buildProfitCenterReport(centers, lines);
  }
}
