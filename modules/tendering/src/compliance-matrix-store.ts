import type { TxHandle } from '@aura/core';
import type { ComplianceMatrixIssue } from './domain/compliance-matrix';

/** DI token for the technical compliance matrix issues (EST-12). */
export const COMPLIANCE_MATRIX_STORE = Symbol('COMPLIANCE_MATRIX_STORE');

/**
 * APPEND-ONLY. An issue is inserted once; the only later write is the one that marks it superseded by
 * the next revision, and that happens once. There is no update of rows, number, revision or issuer.
 */
export interface ComplianceMatrixStore {
  /** Insert `issue`; when it replaces a revision, mark that one superseded in the same unit. */
  issue(tx: TxHandle | null, issue: ComplianceMatrixIssue, supersedes: ComplianceMatrixIssue | null): Promise<void>;
  /** Every issued revision of the tender's matrix, newest first. */
  listByTender(tenantId: string, tenderId: string): Promise<ComplianceMatrixIssue[]>;
  get(tenantId: string, id: string): Promise<ComplianceMatrixIssue | null>;
}
