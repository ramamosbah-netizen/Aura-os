import { describe, it, expect } from 'vitest';
import {
  makeScopeAssistProposal, acceptProposal, supersedeProposal,
  filterToInScopeEvidence, fingerprintEvidence, contentHash,
  type SuggestedScopeItem,
} from './scope-assist';

const item = (id: string, sourceIds: string[]): SuggestedScopeItem => ({
  id, description: `item ${id}`, unit: 'no', quantity: null,
  provenance: sourceIds.map((s) => ({ kind: 'requirement', sourceId: s })),
});

describe('scope-assist domain — provenance filter (isolation + anti-hallucination)', () => {
  it('keeps only items whose EVERY citation is in-scope', () => {
    const allowed = new Set(['a', 'b']);
    const { kept, dropped } = filterToInScopeEvidence(
      [item('1', ['a']), item('2', ['a', 'b']), item('3', ['a', 'x']), item('4', [])],
      allowed,
    );
    expect(kept.map((i) => i.id)).toEqual(['1', '2']);
    // item 3 cites out-of-scope 'x'; item 4 has NO provenance — both dropped.
    expect(dropped.map((i) => i.id)).toEqual(['3', '4']);
  });

  it('drops an item citing a cross-tenant source even if the rest is in-scope', () => {
    const { kept, dropped } = filterToInScopeEvidence([item('1', ['mine', 'OTHER_TENANT_DOC'])], new Set(['mine']));
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
  });
});

describe('scope-assist domain — fingerprint', () => {
  it('is order-independent and content-sensitive', () => {
    const a = fingerprintEvidence([{ kind: 'requirement', sourceId: 'r1', contentHash: contentHash('cctv') }, { kind: 'scope-line', sourceId: 'l1', contentHash: contentHash('cam', 4) }]);
    const b = fingerprintEvidence([{ kind: 'scope-line', sourceId: 'l1', contentHash: contentHash('cam', 4) }, { kind: 'requirement', sourceId: 'r1', contentHash: contentHash('cctv') }]);
    expect(a).toBe(b); // reordering the same set → same fingerprint
    const c = fingerprintEvidence([{ kind: 'requirement', sourceId: 'r1', contentHash: contentHash('access control') }, { kind: 'scope-line', sourceId: 'l1', contentHash: contentHash('cam', 4) }]);
    expect(c).not.toBe(a); // changed content → different fingerprint
  });
});

describe('scope-assist domain — lifecycle stamps', () => {
  const base = () => makeScopeAssistProposal({ tenantId: 't1', opportunityId: 'o1', version: 1, evidenceFingerprint: 'fp', generator: 'heuristic', items: [item('1', ['a'])] });

  it('accept: suggested → accepted, records basis + actor; re-accept refused', () => {
    const p = base();
    const a = acceptProposal(p, 'u1', 'basis-1');
    expect(a.status).toBe('accepted');
    expect(a.acceptedBasisRevisionId).toBe('basis-1');
    expect(a.acceptedBy).toBe('u1');
    expect(() => acceptProposal(a, 'u2', 'basis-2')).toThrow(/only a suggested proposal can be accepted/);
  });

  it('supersede only touches a still-open suggested proposal, never accepted history', () => {
    const p = base();
    expect(supersedeProposal(p).status).toBe('superseded');
    const accepted = acceptProposal(p, 'u1', 'basis-1');
    expect(supersedeProposal(accepted).status).toBe('accepted'); // history untouched
  });
});
