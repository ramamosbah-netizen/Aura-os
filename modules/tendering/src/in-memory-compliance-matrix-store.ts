import type { TxHandle } from '@aura/core';
import type { ComplianceMatrixIssue } from './domain/compliance-matrix';
import type { ComplianceMatrixStore } from './compliance-matrix-store';

export class InMemoryComplianceMatrixStore implements ComplianceMatrixStore {
  private readonly issues = new Map<string, ComplianceMatrixIssue>();

  async issue(_tx: TxHandle | null, issue: ComplianceMatrixIssue, supersedes: ComplianceMatrixIssue | null): Promise<void> {
    const clash = [...this.issues.values()].some((i) => i.tenantId === issue.tenantId && i.tenderId === issue.tenderId && i.revision === issue.revision);
    if (clash) throw new Error(`${issue.matrixNumber} Rev ${issue.revision} was already issued`);
    if (supersedes) {
      const previous = this.issues.get(supersedes.id);
      if (!previous || previous.supersededBy) throw new Error(`${supersedes.matrixNumber} Rev ${supersedes.revision} is already superseded`);
      this.issues.set(previous.id, { ...previous, supersededBy: issue.id, supersededAt: issue.issuedAt });
    }
    this.issues.set(issue.id, structuredClone(issue));
  }

  async listByTender(tenantId: string, tenderId: string): Promise<ComplianceMatrixIssue[]> {
    return [...this.issues.values()]
      .filter((i) => i.tenantId === tenantId && i.tenderId === tenderId)
      .sort((a, b) => b.revision - a.revision)
      .map((i) => structuredClone(i));
  }

  async get(tenantId: string, id: string): Promise<ComplianceMatrixIssue | null> {
    const found = this.issues.get(id);
    return found && found.tenantId === tenantId ? structuredClone(found) : null;
  }
}
