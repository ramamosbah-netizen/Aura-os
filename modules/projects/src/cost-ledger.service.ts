import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CompaniesService } from '@aura/core';
import { COST_LEDGER_STORE, type CostLedgerFilter, type CostLedgerStore } from './cost-ledger-store';
import { type CostTransaction, type NewCostTransaction, makeCostTransaction } from './domain/cost-transaction';
import { CbsService } from './cbs.service';
import { WbsService } from './wbs.service';

/**
 * The Project Transaction Engine (Cost side). Every module posts a CostTransaction here instead of
 * touching CBS/WBS actuals directly: the entry is appended to the append-only ledger (the source
 * of truth + drill-down), and actual-cost projections are reconciled from the complete ledger so
 * retries and rebuilds converge. A credit note / reversal / return is a negative append-only fact.
 */
@Injectable()
export class CostLedgerService {
  private readonly logger = new Logger('CostLedger');

  constructor(
    @Inject(COST_LEDGER_STORE) private readonly store: CostLedgerStore,
    private readonly cbs: CbsService,
    // Union-typed optional parameters emit `Object` metadata; make the projection dependency
    // explicit so Nest cannot silently omit WBS AC reconciliation in the application graph.
    @Optional() @Inject(WbsService) private readonly wbs: WbsService | null = null,
    @Optional() private readonly companies: CompaniesService | null = null,
  ) {}

  /** Post a transaction and reconcile actual projections from canonical ledger history.
   * Idempotent when `input.dedupeKey` is set — replay returns the first fact and still repairs a
   * prior projection failure without double-counting cost. */
  async post(input: NewCostTransaction): Promise<CostTransaction> {
    const txn = makeCostTransaction(await this.withMonetaryProvenance(input));
    const { txn: stored, inserted } = await this.store.append(txn);
    // Lightweight in-memory test adapters may only expose the legacy incremental CBS methods.
    // The application wiring always provides the full projection API below.
    const canReconcile = typeof (this.cbs as CbsService & { list?: unknown }).list === 'function';
    if (!inserted) {
      if (!sameCanonicalFact(txn, stored)) {
        throw new Error(`cost transaction dedupe conflict for ${txn.dedupeKey}`);
      }
      // Dedupe hit: the canonical fact already exists. Reconcile projections instead of blindly
      // incrementing them; this also repairs a prior ledger-committed/projection-failed attempt.
      if (stored.type === 'actual' && canReconcile) await this.reconcileProjections(stored.tenantId, stored.projectId);
      this.logger.log(`↩ cost txn dedupe [${stored.dedupeKey}] — reconciled projections (${stored.id})`);
      return stored;
    }
    if (stored.type === 'actual' && canReconcile) await this.reconcileProjections(stored.tenantId, stored.projectId);
    else if (stored.cbsNodeId && stored.amount !== 0) {
      if (stored.type === 'committed') await this.cbs.recordCommittedCost(stored.cbsNodeId, stored.amount);
      else if (stored.type === 'budget') {
        if (stored.source === 'variation') await this.cbs.recordApprovedVariationBudget(stored.cbsNodeId, stored.amount);
        else await this.cbs.recordBudget(stored.cbsNodeId, stored.amount);
      } else throw new Error('canonical CostLedger projection API is required for actual-cost posts');
    }
    this.logger.log(`📒 ${stored.type} ${stored.amount} → CBS ${stored.cbsNodeId ?? '(uncoded)'} [${stored.source} ${stored.sourceRef ?? ''}]`);
    return stored;
  }

  /** Rebuild CBS/WBS actual projections from the append-only ledger. */
  async reconcileProjections(tenantId: string, projectId: string): Promise<void> {
    const txns = await this.store.list({ tenantId, projectId, limit: 1000000 });
    const actualByCbs = new Map<string, number>();
    const actualByWbs = new Map<string, number>();
    for (const txn of txns) {
      if (txn.type !== 'actual') continue;
      // Legacy rows without monetary provenance retain their explicit historical amount. New
      // cross-currency rows without a base amount are unknown and are excluded from projections.
      const amount = txn.baseAmount ?? (txn.baseCurrency == null && txn.sourceCurrency == null ? txn.amount : null);
      if (amount == null || !Number.isFinite(amount)) continue;
      if (txn.cbsNodeId) actualByCbs.set(txn.cbsNodeId, (actualByCbs.get(txn.cbsNodeId) ?? 0) + amount);
      if (txn.wbsNodeId) actualByWbs.set(txn.wbsNodeId, (actualByWbs.get(txn.wbsNodeId) ?? 0) + amount);
    }

    for (const node of await this.cbs.list({ projectId })) {
      await this.cbs.reconcileActualProjection(node.id, Number((actualByCbs.get(node.id) ?? 0).toFixed(2)));
    }
    if (this.wbs) {
      for (const node of await this.wbs.list({ projectId })) {
        await this.wbs.reconcileActualProjection(node.id, Number((actualByWbs.get(node.id) ?? 0).toFixed(2)));
      }
    }
  }

  private async withMonetaryProvenance(input: NewCostTransaction): Promise<NewCostTransaction> {
    const sourceAmount = input.sourceAmount ?? input.amount;
    if (!Number.isFinite(Number(sourceAmount))) throw new Error('cost transaction amount must be finite');

    let baseCurrency = input.baseCurrency?.trim().toUpperCase() || null;
    if (!baseCurrency && input.companyId && this.companies) {
      const company = (await this.companies.list(input.tenantId)).find((candidate) => candidate.id === input.companyId);
      baseCurrency = company?.baseCurrency?.trim().toUpperCase() || null;
    }
    const sourceCurrency = input.sourceCurrency?.trim().toUpperCase() || baseCurrency;
    if (sourceCurrency && !baseCurrency) throw new Error('cost transaction base currency is unavailable');

    if (!sourceCurrency || !baseCurrency) {
      // Preserve legacy callers without inventing AED or rate=1. The explicit amount remains
      // available for historical compatibility, while projections can treat provenance as unknown.
      return { ...input, sourceAmount, sourceCurrency: null, baseCurrency: null, baseAmount: null, exchangeRate: null };
    }

    const exchangeRate = input.exchangeRate ?? (sourceCurrency === baseCurrency ? 1 : null);
    if (exchangeRate == null || !Number.isFinite(Number(exchangeRate)) || Number(exchangeRate) <= 0) {
      throw new Error(`valid FX provenance required for ${sourceCurrency} → ${baseCurrency}`);
    }
    const baseAmount = input.baseAmount ?? Number((Number(sourceAmount) * Number(exchangeRate)).toFixed(2));
    if (!Number.isFinite(baseAmount)) throw new Error('cost transaction baseAmount must be finite');
    return {
      ...input,
      amount: baseAmount,
      sourceAmount,
      sourceCurrency,
      baseCurrency,
      exchangeRate: Number(exchangeRate),
      // Event-sourced callers should pass occurredAt so a replay reconstructs identical
      // provenance. The wall clock fallback is retained only for ad-hoc legacy posts.
      rateDate: input.rateDate ?? input.occurredAt ?? new Date().toISOString(),
      rateSource: input.rateSource ?? (sourceCurrency === baseCurrency ? 'same_currency' : null),
      baseAmount,
    };
  }

  /** The ledger for a project or a single cost line — the audit trail behind every number. */
  list(filter: CostLedgerFilter): Promise<CostTransaction[]> {
    return this.store.list(filter);
  }
}

function sameCanonicalFact(a: CostTransaction, b: CostTransaction): boolean {
  return a.tenantId === b.tenantId
    && a.projectId === b.projectId
    && a.cbsNodeId === b.cbsNodeId
    && a.wbsNodeId === b.wbsNodeId
    && a.type === b.type
    && a.amount === b.amount
    && a.sourceAmount === b.sourceAmount
    && a.sourceCurrency === b.sourceCurrency
    && a.exchangeRate === b.exchangeRate
    && a.rateSource === b.rateSource
    && a.baseAmount === b.baseAmount
    && a.baseCurrency === b.baseCurrency
    && a.quantity === b.quantity
    && a.source === b.source
    && a.sourceRef === b.sourceRef
    && JSON.stringify(sortRecord(a.dimensions)) === JSON.stringify(sortRecord(b.dimensions));
}

function sortRecord(value: Record<string, string> | null): Record<string, string> | null {
  if (!value) return null;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
