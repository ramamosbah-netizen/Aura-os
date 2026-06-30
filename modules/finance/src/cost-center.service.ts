import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  COST_CENTER_EVENT,
  type CostCenter,
  type NewCostCenter,
  type CostCenterReport,
  makeCostCenter,
  buildCostCenterReport,
} from './domain/cost-center';
import { COST_CENTER_STORE, type CostCenterStore } from './cost-center-store';
import { JOURNAL_STORE, type JournalStore } from './journal-store';

/** Cost-centre master + GL-folded cost-centre actuals report. */
@Injectable()
export class CostCenterService {
  private readonly logger = new Logger('FinanceCostCenter');

  constructor(
    @Inject(COST_CENTER_STORE) private readonly store: CostCenterStore,
    @Inject(JOURNAL_STORE) private readonly journals: JournalStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewCostCenter): Promise<CostCenter> {
    const cc = makeCostCenter(input);
    await this.store.save(cc);
    await this.events.append([
      makeEvent({
        type: COST_CENTER_EVENT.created,
        tenantId: cc.tenantId, companyId: cc.companyId, actorId: cc.createdBy,
        aggregateType: 'finance.cost_center', aggregateId: cc.id,
        payload: { code: cc.code, name: cc.name },
      }),
    ]);
    this.logger.log(`Cost centre created: ${cc.code} ${cc.name}`);
    return cc;
  }

  list(tenantId: Id): Promise<CostCenter[]> {
    return this.store.list(tenantId);
  }

  /** Fold all GL journal lines for the tenant by cost-centre tag → net actuals per centre. */
  async report(tenantId: Id): Promise<CostCenterReport> {
    const [centers, journals] = await Promise.all([
      this.store.list(tenantId),
      this.journals.list({ tenantId }),
    ]);
    const lines = journals.flatMap((j) => j.lines.map((l) => ({ debit: l.debit, credit: l.credit, costCenterId: l.costCenterId })));
    return buildCostCenterReport(centers, lines);
  }
}
