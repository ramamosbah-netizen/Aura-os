/**
 * Transaction posture (Slice 8) — symmetric with the auth and RLS posture gates.
 *
 * Governed financial workflows (freeze→supersede a pricing revision; materialise a quotation revision
 * plus its pricing link) must commit as ONE transaction. That atomicity is real only behind a
 * PostgresTxRunner. The DI factory degrades to a NullTxRunner when no pool is present — correct for
 * in-memory dev and tests, but a SILENT downgrade to non-atomic writes if a database-backed
 * deployment ever booted without its pool. This pure decision lets the API bootstrap fail closed in
 * that case, and be unit-tested without booting Nest.
 */
export interface TxPostureInput {
  /** Is a database configured for this process (e.g. DATABASE_URL present)? */
  databaseConfigured: boolean;
  /** Did DI resolve a real transactional runner (PostgresTxRunner), not the NullTxRunner fallback? */
  runnerIsTransactional: boolean;
}

export interface TxPostureDecision {
  ok: boolean;
  reason?: string;
}

export function evaluateTxPosture(input: TxPostureInput): TxPostureDecision {
  // A database is configured but the runner cannot open a transaction → the money flows would run
  // non-atomically. Refuse to boot. No database (in-memory / tests) → NullTxRunner is intended.
  if (input.databaseConfigured && !input.runnerIsTransactional) {
    return {
      ok: false,
      reason:
        'DATABASE_URL is set but TX_RUNNER is not a PostgresTxRunner (no DB pool) — refusing to run ' +
        'governed pricing/quotation workflows non-atomically. Fix the database configuration.',
    };
  }
  return { ok: true };
}
