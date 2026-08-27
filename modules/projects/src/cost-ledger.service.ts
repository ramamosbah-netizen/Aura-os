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

  /** Post a transaction: append to the ledger, then move the CBS cost line's cached balance.
   * Idempotent when `input.dedupeKey` is set — a replayed post returns the first transaction and
   * moves the CBS balance ONCE, so an event the outbox re-delivers cannot double-count cost. */
  async post(input: NewCostTransaction): Promise<CostTransaction> {
    const txn = makeCostTransaction(input);
    const { txn: stored, inserted } = await this.store.append(txn);
    if (!inserted) {
      // Dedupe hit: the transaction (and its CBS effect) already landed on the first delivery.
      this.logger.log(`↩ cost txn dedupe [${stored.dedupeKey}] — already posted (${stored.id}), CBS unchanged`);
      return stored;
    }
    if (stored.cbsNodeId && stored.amount !== 0) {
      try {
        if (stored.type === 'committed') await this.cbs.recordCommittedCost(stored.cbsNodeId, stored.amount);
        else if (stored.type === 'budget') await this.cbs.recordBudget(stored.cbsNodeId, stored.amount);
        else await this.cbs.recordActualCost(stored.cbsNodeId, stored.amount);
      } catch (err) {
        // The ledger entry stands regardless — the CBS cache can be rebuilt from it.
        this.logger.error(`Posted txn ${stored.id} but failed to update CBS node ${stored.cbsNodeId}: ${err}`);
      }
    }
    this.logger.log(`📒 ${stored.type} ${stored.amount} → CBS ${stored.cbsNodeId ?? '(uncoded)'} [${stored.source} ${stored.sourceRef ?? ''}]`);
    return stored;
  }

  /** The ledger for a project or a single cost line — the audit trail behind every number. */
  list(filter: CostLedgerFilter): Promise<CostTransaction[]> {
    return this.store.list(filter);
  }
}
