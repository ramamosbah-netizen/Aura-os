import { Inject, Injectable, Logger } from '@nestjs/common';
import { COST_LEDGER_STORE, type CostLedgerFilter, type CostLedgerStore } from './cost-ledger-store';
import { type CostTransaction, type NewCostTransaction, makeCostTransaction } from './domain/cost-transaction';
import { CbsService } from './cbs.service';

/**
 * The Project Transaction Engine (Cost side). Every module posts a CostTransaction here instead of
 * touching the CBS: the entry is appended to the append-only ledger (the source of truth + the
 * "show transactions" drill-down), and the CBS node's cached balance is moved by the same delta so
 * summary reads stay fast. A credit note / reversal / return is just a negative-amount post.
 */
@Injectable()
export class CostLedgerService {
  private readonly logger = new Logger('CostLedger');

  constructor(
    @Inject(COST_LEDGER_STORE) private readonly store: CostLedgerStore,
    private readonly cbs: CbsService,
  ) {}

  /** Post a transaction: append to the ledger, then move the CBS cost line's cached balance. */
  async post(input: NewCostTransaction): Promise<CostTransaction> {
    const txn = makeCostTransaction(input);
    await this.store.append(txn);
    if (txn.cbsNodeId && txn.amount !== 0) {
      try {
        if (txn.type === 'committed') await this.cbs.recordCommittedCost(txn.cbsNodeId, txn.amount);
        else await this.cbs.recordActualCost(txn.cbsNodeId, txn.amount);
      } catch (err) {
        // The ledger entry stands regardless — the CBS cache can be rebuilt from it.
        this.logger.error(`Posted txn ${txn.id} but failed to update CBS node ${txn.cbsNodeId}: ${err}`);
      }
    }
    this.logger.log(`📒 ${txn.type} ${txn.amount} → CBS ${txn.cbsNodeId ?? '(uncoded)'} [${txn.source} ${txn.sourceRef ?? ''}]`);
    return txn;
  }

  /** The ledger for a project or a single cost line — the audit trail behind every number. */
  list(filter: CostLedgerFilter): Promise<CostTransaction[]> {
    return this.store.list(filter);
  }
}
