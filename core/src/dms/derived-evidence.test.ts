import { describe, expect, it } from 'vitest';
import { makeDocumentRequirement, type DocumentRequirement } from '@aura/shared';
import { DerivedEvidenceRegistry, type DerivedEvidenceProvider, type DerivedEvidenceVerdict } from './derived-evidence';

const row = (over: Partial<DocumentRequirement> = {}): DocumentRequirement => ({
  ...makeDocumentRequirement({ tenantId: 't1', entityType: 'crm.quotation', entityId: 'q1', type: 'VENDOR_QUOTE', requiredCount: 3 }),
  ...over,
});

const typed = [
  { type: 'EXTERNAL_REFERENCE' as const, reference: 'typed-1', checkedBy: 'u1', checkedAt: '2026-09-24T00:00:00.000Z' },
  { type: 'EXTERNAL_REFERENCE' as const, reference: 'typed-2', checkedBy: 'u1', checkedAt: '2026-09-24T00:00:00.000Z' },
  { type: 'EXTERNAL_REFERENCE' as const, reference: 'typed-3', checkedBy: 'u1', checkedAt: '2026-09-24T00:00:00.000Z' },
];

const provider = (derive: DerivedEvidenceProvider['derive']): DerivedEvidenceProvider => ({
  entityType: 'crm.quotation', requirementType: 'VENDOR_QUOTE', derive,
});

const verdict = (over: Partial<DerivedEvidenceVerdict>): DerivedEvidenceVerdict => ({
  applies: true, satisfied: false, requiredCount: 2, evidence: [], ...over,
});

describe('DerivedEvidenceRegistry', () => {
  it('replaces a governed row with the computed state — three typed references do not count', async () => {
    const reg = new DerivedEvidenceRegistry();
    reg.register(provider(async () => verdict({ satisfied: false, requiredCount: 2, evidence: [typed[0]] })));
    const [out] = await reg.overlay([row({ status: 'PROVIDED', evidence: typed })]);
    expect(out.status).toBe('REQUIRED');
    expect(out.requiredCount).toBe(2);
    expect(out.evidence.map((e) => e.reference)).toEqual(['typed-1']);
  });

  it('marks it PROVIDED only when the provider says the rule is satisfied', async () => {
    const reg = new DerivedEvidenceRegistry();
    reg.register(provider(async () => verdict({ satisfied: true, evidence: [typed[0], typed[1]] })));
    const [out] = await reg.overlay([row()]);
    expect(out.status).toBe('PROVIDED');
  });

  it('never overwrites a decision a person took — a waiver stands as it was left', async () => {
    const reg = new DerivedEvidenceRegistry();
    let asked = 0;
    reg.register(provider(async () => { asked += 1; return verdict({ satisfied: true }); }));
    const waived = row({ status: 'WAIVED', evidence: [] });
    const [out] = await reg.overlay([waived]);
    expect(out).toEqual(waived);
    expect(asked).toBe(0);
  });

  it('fails CLOSED: a provider that throws leaves the requirement unmet, stored references and all', async () => {
    const reg = new DerivedEvidenceRegistry();
    reg.register(provider(async () => { throw new Error('comparison unavailable'); }));
    const [out] = await reg.overlay([row({ status: 'PROVIDED', evidence: typed })]);
    expect(out.status).toBe('REQUIRED');
    expect(out.evidence).toEqual([]);
    expect(await reg.isDerived(row())).toBe(true);
  });

  it('leaves a record the rule does not govern on its ordinary, attached evidence', async () => {
    const reg = new DerivedEvidenceRegistry();
    reg.register(provider(async () => verdict({ applies: false })));
    const stored = row({ status: 'PROVIDED', evidence: typed });
    const [out] = await reg.overlay([stored]);
    expect(out).toEqual(stored);
    expect(await reg.isDerived(stored)).toBe(false);
  });

  it('touches only its own pair — other requirement types are passed through', async () => {
    const reg = new DerivedEvidenceRegistry();
    reg.register(provider(async () => verdict({ satisfied: false })));
    const other = row({ type: 'DATASHEET', status: 'PROVIDED', evidence: [typed[0]], requiredCount: 1 });
    const [out] = await reg.overlay([other]);
    expect(out).toEqual(other);
    expect(await reg.isDerived(other)).toBe(false);
  });

  it('shows a DECIDED record as it was decided on — frozen, and still closed to hand-typed evidence', async () => {
    const reg = new DerivedEvidenceRegistry();
    reg.register(provider(async () => verdict({ frozen: true, satisfied: false, requiredCount: 0, evidence: [] })));
    const decided = row({ status: 'PROVIDED', requiredCount: 2, evidence: [typed[0], typed[1]] });
    const [out] = await reg.overlay([decided]);
    expect(out).toEqual(decided);
    expect(await reg.isDerived(decided)).toBe(true);
  });

  it('marks which rows are computed — live, frozen and failed — and leaves the rest unmarked', async () => {
    const reg = new DerivedEvidenceRegistry();
    let mode: 'live' | 'frozen' | 'throws' | 'not-governed' = 'live';
    reg.register(provider(async () => {
      if (mode === 'throws') throw new Error('comparison unavailable');
      if (mode === 'not-governed') return verdict({ applies: false });
      return verdict(mode === 'frozen' ? { frozen: true } : { satisfied: true, evidence: [typed[0], typed[1]] });
    }));
    const governed = row();
    const other = row({ type: 'DATASHEET' });
    const waived = row({ type: 'VENDOR_QUOTE', entityId: 'q2', status: 'WAIVED' });
    for (const [m, expected] of [['live', [governed.id]], ['frozen', [governed.id]], ['throws', [governed.id]], ['not-governed', []]] as const) {
      mode = m;
      const { derivedIds } = await reg.overlayMarked([governed, other, waived]);
      expect(derivedIds, m).toEqual(expected);
    }
  });

  it('refuses a second provider for the same pair — one requirement, one answer', () => {
    const reg = new DerivedEvidenceRegistry();
    reg.register(provider(async () => verdict({})));
    expect(() => reg.register(provider(async () => verdict({})))).toThrow(/already registered/);
  });
});
