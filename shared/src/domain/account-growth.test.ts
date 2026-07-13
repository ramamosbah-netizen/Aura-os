import { describe, expect, it } from 'vitest';
import { projectCompletionSignal, contractCompletionSignal } from './account-growth';
import { makeSignal } from './signal';

describe('projectCompletionSignal', () => {
  it('builds an EXPANSION signal on the delivered account, deduped by project', () => {
    const s = projectCompletionSignal({
      tenantId: 't1', projectId: 'p1', projectTitle: 'HQ CCTV rollout',
      accountId: 'a1', accountName: 'Nakheel', value: 500000,
    });
    expect(s.source).toBe('PROJECT_LIFECYCLE');
    expect(s.type).toBe('EXPANSION');
    expect(s.accountId).toBe('a1');
    expect(s.contextType).toBe('project');
    expect(s.contextId).toBe('p1');
    expect(s.dedupeKey).toBe('growth-from-project:p1');
    expect(s.title).toContain('HQ CCTV rollout');
    // Feeds a valid Signal (NEW, on the radar).
    expect(makeSignal(s).status).toBe('NEW');
  });

  it('falls back to a generic name when the project title is missing', () => {
    const s = projectCompletionSignal({ tenantId: 't1', projectId: 'p2', projectTitle: null });
    expect(s.title).toContain('project');
    expect(s.dedupeKey).toBe('growth-from-project:p2');
  });
});

describe('contractCompletionSignal', () => {
  it('builds a RENEWAL_DUE signal, deduped by contract', () => {
    const s = contractCompletionSignal({
      tenantId: 't1', contractId: 'c1', contractTitle: 'Tower AMC 2025',
      accountId: 'a1', accountName: 'Emaar', value: 120000,
    });
    expect(s.source).toBe('CONTRACT_LIFECYCLE');
    expect(s.type).toBe('RENEWAL_DUE');
    expect(s.contextType).toBe('contract');
    expect(s.contextId).toBe('c1');
    expect(s.dedupeKey).toBe('growth-from-contract:c1');
    expect(s.confidence).toBe(60);
  });
});
