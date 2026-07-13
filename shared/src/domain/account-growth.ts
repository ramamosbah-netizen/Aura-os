import type { NewSignal } from './signal';

// Account growth signals (S9) — the reactors that close the acquisition loop back onto the
// installed base. A delivered project or a completed contract is not the end of the relationship;
// it is the moment a follow-on scope, cross-sell or renewal becomes real. These pure builders turn
// a deal-chain completion into a NewSignal for the Opportunity Radar (S3), deduped so an outbox
// retry or re-completion never re-emits. The reactor stays thin — the rule lives here, testable.

export interface CompletedProjectFacts {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectTitle: string | null;
  accountId?: string | null;
  accountName?: string | null;
  value?: number | null;
}

/** A completed project → an EXPANSION / cross-sell possibility on the delivered account. */
export function projectCompletionSignal(f: CompletedProjectFacts): NewSignal {
  const name = f.projectTitle?.trim() || 'project';
  return {
    tenantId: f.tenantId,
    companyId: f.companyId ?? null,
    source: 'PROJECT_LIFECYCLE',
    type: 'EXPANSION',
    title: `Delivered: ${name} — expansion / cross-sell opportunity`,
    description: 'A completed project is an opening for follow-on scope, cross-sell or a service (AMC) attach.',
    accountId: f.accountId ?? null,
    accountName: f.accountName ?? null,
    contextType: 'project',
    contextId: f.projectId,
    evidence: `Project "${name}" completed${f.value ? ` (value ${f.value})` : ''}. Delivered accounts are the warmest growth pipeline.`,
    confidence: 55,
    dedupeKey: `growth-from-project:${f.projectId}`,
  };
}

export interface CompletedContractFacts {
  tenantId: string;
  companyId?: string | null;
  contractId: string;
  contractTitle: string | null;
  accountId?: string | null;
  accountName?: string | null;
  value?: number | null;
}

/** A completed contract → a RENEWAL / AMC-due possibility on the account. */
export function contractCompletionSignal(f: CompletedContractFacts): NewSignal {
  const name = f.contractTitle?.trim() || 'contract';
  return {
    tenantId: f.tenantId,
    companyId: f.companyId ?? null,
    source: 'CONTRACT_LIFECYCLE',
    type: 'RENEWAL_DUE',
    title: `Contract completed: ${name} — renewal / AMC due`,
    description: 'A completed contract is the trigger to pursue renewal, a maintenance contract, or the next phase.',
    accountId: f.accountId ?? null,
    accountName: f.accountName ?? null,
    contextType: 'contract',
    contextId: f.contractId,
    evidence: `Contract "${name}" completed${f.value ? ` (value ${f.value})` : ''}. Time to secure the renewal before the relationship cools.`,
    confidence: 60,
    dedupeKey: `growth-from-contract:${f.contractId}`,
  };
}
