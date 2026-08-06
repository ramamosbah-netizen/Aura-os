/**
 * Cash application — allocating one customer receipt across several open invoices. A client pays a
 * lump sum (one cheque / transfer) that clears several invoices at once; recording it one invoice at
 * a time loses the fact that it was a single receipt and is error-prone. This computes the split.
 *
 * Pure and framework-free: the service feeds the customer's open invoices (each with its remaining
 * balance) and the amount received, and gets back the per-invoice allocation plus any unapplied
 * remainder (an over-payment / advance the caller must decide what to do with).
 */

export interface OpenInvoiceRef {
  id: string;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD — oldest first
  balance: number;   // remaining receivable (total − paid − credited)
}

export interface Allocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  totalAllocated: number;
  /** Received amount not applied to any invoice (an over-payment / advance). */
  unapplied: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Allocate `amount` across the open invoices, oldest issue date first, filling each balance. */
export function allocateOldestFirst(open: OpenInvoiceRef[], amount: number): AllocationResult {
  const received = round2(Number(amount) || 0);
  if (received <= 0) throw new Error('receipt amount must be positive');

  const ordered = [...open]
    .filter((i) => i.balance > 0)
    .sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : a.invoiceNumber.localeCompare(b.invoiceNumber)));

  const allocations: Allocation[] = [];
  let remaining = received;
  for (const inv of ordered) {
    if (remaining <= 0.001) break;
    const applied = round2(Math.min(remaining, inv.balance));
    if (applied <= 0) continue;
    allocations.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: applied });
    remaining = round2(remaining - applied);
  }
  const totalAllocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
  return { allocations, totalAllocated, unapplied: round2(received - totalAllocated) };
}

/**
 * Validate an explicit set of allocations against the open invoices: each targets an open invoice,
 * none exceeds that invoice's balance, and the total does not exceed the amount received.
 */
export function validateAllocations(
  open: OpenInvoiceRef[],
  requested: Array<{ invoiceId: string; amount: number }>,
  amountReceived: number,
): AllocationResult {
  const byId = new Map(open.map((i) => [i.id, i]));
  const allocations: Allocation[] = [];
  for (const r of requested) {
    const inv = byId.get(r.invoiceId);
    const amount = round2(Number(r.amount) || 0);
    if (!inv) throw new Error(`invoice ${r.invoiceId} is not an open invoice for this customer`);
    if (amount <= 0) throw new Error(`allocation to ${inv.invoiceNumber} must be positive`);
    if (amount > inv.balance + 0.001) {
      // "insufficient" leads so the taxonomy classifies this as a 409 state conflict.
      throw new Error(`insufficient balance — allocation of ${amount} exceeds the ${inv.balance} balance of invoice ${inv.invoiceNumber}`);
    }
    allocations.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount });
  }
  const totalAllocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
  const received = round2(Number(amountReceived) || 0);
  if (totalAllocated > received + 0.001) {
    throw new Error(`allocations total ${totalAllocated}, above the ${received} received`);
  }
  return { allocations, totalAllocated, unapplied: round2(received - totalAllocated) };
}
