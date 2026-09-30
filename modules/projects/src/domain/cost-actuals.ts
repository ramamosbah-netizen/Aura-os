import type { CostTransaction } from './cost-transaction';

/**
 * WHAT A PROJECT'S ACTUAL COST IS, BY WORK PACKAGE — and what is not attributed to any (F-07).
 *
 * Cost is coded to a CBS line always and to a WBS work package only where the source recorded one:
 * a day sheet that named the package, a material issue delivered to it. Plant usage and subcontract
 * claims record no package, and mobilisation, housekeeping and standing time belong to none. Forcing
 * a package onto those would manufacture attribution nobody observed — so every reader of a package's
 * cost gets the unattributed remainder beside it, and the project's actual cost is the ledger's
 * TOTAL, never the sum of what happened to be attributed.
 */
export interface WorkPackageActuals {
  /** Every countable actual posting, attributed or not — the project's actual cost. */
  total: number;
  /** Actual cost per work package of THIS project, with how many postings make it up. */
  byPackage: Record<string, { amount: number; postings: number }>;
  /** Actual cost that names no work package of this project. */
  unattributed: { amount: number; postings: number };
  /** Actual postings left out because their base-currency amount is unknown (no FX provenance). */
  unknownProvenance: number;
}

/**
 * The amount an actual posting contributes, or null when it cannot be counted: legacy rows without
 * monetary provenance keep their explicit historical amount; a cross-currency row without a base
 * amount is unknown. ONE rule, used by the projection rebuild and by every reader, so the two can
 * never disagree about which postings count.
 */
export function countableActual(txn: CostTransaction): number | null {
  if (txn.type !== 'actual') return null;
  const amount = txn.baseAmount ?? (txn.baseCurrency == null && txn.sourceCurrency == null ? txn.amount : null);
  return amount != null && Number.isFinite(amount) ? amount : null;
}

/**
 * Fold a project's ledger into actual cost by work package. `packageIds` are the project's own work
 * packages: a posting naming any other id is not this project's package cost, and is counted as
 * unattributed rather than dropped — dropping it would shrink the total.
 */
export function actualByWorkPackage(txns: readonly CostTransaction[], packageIds: readonly string[]): WorkPackageActuals {
  const own = new Set(packageIds);
  const out: WorkPackageActuals = { total: 0, byPackage: {}, unattributed: { amount: 0, postings: 0 }, unknownProvenance: 0 };
  for (const txn of txns) {
    if (txn.type !== 'actual') continue;
    const amount = countableActual(txn);
    if (amount == null) { out.unknownProvenance += 1; continue; }
    out.total += amount;
    if (txn.wbsNodeId && own.has(txn.wbsNodeId)) {
      const cell = (out.byPackage[txn.wbsNodeId] ??= { amount: 0, postings: 0 });
      cell.amount += amount;
      cell.postings += 1;
    } else {
      out.unattributed.amount += amount;
      out.unattributed.postings += 1;
    }
  }
  const r2 = (n: number): number => Number(n.toFixed(2));
  out.total = r2(out.total);
  out.unattributed.amount = r2(out.unattributed.amount);
  for (const cell of Object.values(out.byPackage)) cell.amount = r2(cell.amount);
  return out;
}
