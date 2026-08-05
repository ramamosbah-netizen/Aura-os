import type { Id } from '@aura/shared';

/**
 * Port owned by Finance for the contract data its **AR billing cap** needs (gap register G-08).
 *
 * The AP side has had a 3-way match (invoice ≤ PO value, ≤ received GRN value) since the
 * beginning. The AR side had **no equivalent bound at all**: an IPC-driven invoice is implicitly
 * capped by the certificate that generated it, but nothing stopped a *manually* raised customer
 * invoice from billing above the contract, or ahead of certified work.
 *
 * Same shape as `PO_MATCH_PORT` and for the same reason (ADR-0004): Finance depends on an
 * interface it owns, and the app layer binds an adapter over Contracts. The **rule** —
 * `domain/contract-cap.ts` — stays in Finance; only the data fetch is delegated.
 */
export interface ContractCapSnapshot {
  /** False when `contractRef` names no contract — an AMC or ad-hoc invoice. The cap is skipped. */
  contractExists: boolean;
  /** The contract's approved value. 0 when absent. */
  contractValue: number;
  /**
   * Net certified to date across the contract's payment certificates (the certified work the
   * client owes). `null` when the contract has no certificates — a contract billed without IPCs
   * is legitimate, so the certified bound simply doesn't apply.
   */
  netCertifiedToDate: number | null;
}

export interface ContractCapPort {
  getSnapshot(tenantId: Id, contractId: Id): Promise<ContractCapSnapshot>;
}

export const CONTRACT_CAP_PORT = Symbol('CONTRACT_CAP_PORT');
