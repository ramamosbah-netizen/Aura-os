import type { ContractCapSnapshot } from '../contract-cap.port';

/**
 * The AR billing cap (gap register **G-08**) — the receivable mirror of the AP 3-way match.
 *
 * Two bounds, both cumulative across the contract's live invoices:
 *
 * 1. **Contract value.** Total billed may not exceed the approved contract value. Billing above
 *    the contract is a commercial claim, not an invoice — it needs a variation first.
 * 2. **Certified work.** Total billed may not exceed the net certified to date. You cannot invoice
 *    work the client's engineer has not certified. Skipped when the contract has no certificates
 *    (`netCertifiedToDate === null`) — plenty of contracts bill on milestones, not IPCs.
 *
 * Cumulative, not per-invoice, because per-invoice checks are trivially defeated by splitting one
 * over-cap invoice into two under-cap ones.
 */
export interface ContractCapInput {
  snapshot: ContractCapSnapshot;
  /**
   * Sum of live (non-cancelled) invoices already raised against this contract, **net of VAT**.
   * Every figure in this rule is VAT-exclusive: contract values and payment certificates are, so
   * comparing a VAT-inclusive invoice total against them would refuse a correct final invoice by
   * exactly the tax — the auto-invoice raised from a certified IPC being the obvious casualty.
   */
  alreadyInvoiced: number;
  /** The invoice being raised now, **net of VAT** (its subtotal). */
  newInvoiceTotal: number;
}

export interface ContractCapResult {
  withinCap: boolean;
  /** Populated only when `withinCap` is false — safe to put straight into a 409/400 message. */
  reason?: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A tolerance of one fils. Invoice totals are built from line quantity × unit price × VAT, so a
 * cumulative total can land a rounding step above a certified figure that is arithmetically equal.
 * Without this, a legitimate final invoice that exactly closes out a contract can be refused.
 */
const EPSILON = 0.01;

export function evaluateContractCap(input: ContractCapInput): ContractCapResult {
  const { snapshot, alreadyInvoiced, newInvoiceTotal } = input;

  // Not a project contract (AMC, ad-hoc, or a dangling ref) — nothing to cap against.
  if (!snapshot.contractExists) return { withinCap: true };

  const cumulative = round2(alreadyInvoiced + newInvoiceTotal);

  if (cumulative > round2(snapshot.contractValue) + EPSILON) {
    return {
      withinCap: false,
      reason:
        `Invoice would bill ${cumulative} against a contract worth ${round2(snapshot.contractValue)} ` +
        `(${round2(alreadyInvoiced)} already invoiced). Raise a variation before billing above the contract value.`,
    };
  }

  if (snapshot.netCertifiedToDate !== null) {
    // Approved retention releases are billable on top of the certified net: retention was withheld
    // FROM that net, so releasing it necessarily bills above it.
    const released = Math.max(0, round2(Number(snapshot.retentionReleased) || 0));
    const certified = round2(snapshot.netCertifiedToDate + released);
    if (cumulative > certified + EPSILON) {
      return {
        withinCap: false,
        reason:
          `Invoice would bill ${cumulative} against ${certified} certified to date ` +
          `(${round2(alreadyInvoiced)} already invoiced). Certify the work before invoicing it.`,
      };
    }
  }

  return { withinCap: true };
}
