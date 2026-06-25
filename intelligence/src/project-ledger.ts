import type { DomainEvent } from '@aura/shared';

// Read-only project profitability — the payoff of running BOTH axes on one spine. Per
// project: budget (the deal-chain project value, revenue) vs committed (POs) / received
// (GRNs) / invoiced (supplier spend). Derived purely from event payloads — no joins, no
// reads of any module's tables.

export interface ProjectLedger {
  projectId: string;
  projectName: string | null;
  accountName: string | null;
  /** Project value from the deal chain (revenue / budget). */
  budget: number;
  /** Σ purchase-order value committed against the project. */
  committed: number;
  /** Σ goods-receipt value received. */
  received: number;
  /** Σ supplier-invoice value (actual spend). */
  invoiced: number;
  /** budget − invoiced: positive = under budget, negative = over budget. */
  variance: number;
}

/** Events that feed the per-project ledger (the project itself + the operate-loop spend). */
export function isLedgerEvent(type: string): boolean {
  return (
    type === 'projects.project.created' ||
    type === 'procurement.po.created' ||
    type === 'inventory.grn.created' ||
    type === 'finance.invoice.created'
  );
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

interface Acc {
  projectName: string | null;
  accountName: string | null;
  budget: number;
  committed: number;
  received: number;
  invoiced: number;
}

function emptyAcc(): Acc {
  return { projectName: null, accountName: null, budget: 0, committed: 0, received: 0, invoiced: 0 };
}

interface LedgerPayload {
  value?: unknown;
  title?: unknown;
  project?: { id?: unknown; name?: unknown } | null;
  account?: { name?: unknown } | null;
}

/** Pure fold of spine events into per-project ledgers, sorted by budget (desc). */
export function foldProjectLedgers(events: DomainEvent[]): ProjectLedger[] {
  const byId = new Map<string, Acc>();
  const ensure = (id: string): Acc => {
    let a = byId.get(id);
    if (!a) {
      a = emptyAcc();
      byId.set(id, a);
    }
    return a;
  };

  for (const e of events) {
    const p = e.payload as LedgerPayload;
    if (e.type === 'projects.project.created') {
      const a = ensure(e.aggregateId);
      a.budget += num(p.value);
      if (typeof p.title === 'string') a.projectName = p.title;
      if (p.account && typeof p.account.name === 'string') a.accountName = p.account.name;
      continue;
    }
    // Operate-loop spend events reference the project by id + name snapshot.
    if (!p.project || typeof p.project.id !== 'string') continue;
    const a = ensure(p.project.id);
    if (!a.projectName && typeof p.project.name === 'string') a.projectName = p.project.name;
    if (e.type === 'procurement.po.created') a.committed += num(p.value);
    else if (e.type === 'inventory.grn.created') a.received += num(p.value);
    else if (e.type === 'finance.invoice.created') a.invoiced += num(p.value);
  }

  return [...byId.entries()]
    .map(([projectId, a]) => ({
      projectId,
      projectName: a.projectName,
      accountName: a.accountName,
      budget: a.budget,
      committed: a.committed,
      received: a.received,
      invoiced: a.invoiced,
      variance: a.budget - a.invoiced,
    }))
    .sort((x, y) => y.budget - x.budget);
}
