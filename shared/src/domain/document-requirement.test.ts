import { describe, it, expect } from 'vitest';
import {
  makeDocumentRequirement,
  addEvidence,
  waiveRequirement,
  setNotApplicable,
  decisionReadiness,
  COMMERCIAL_EVIDENCE_TEMPLATE,
  type DocumentRequirement,
} from './document-requirement';

const base = { tenantId: 't1', entityType: 'quotation', entityId: 'q1' } as const;
const req = (over: Partial<Parameters<typeof makeDocumentRequirement>[0]> = {}) =>
  makeDocumentRequirement({ ...base, type: 'TECHNICAL_PROPOSAL', ...over });

const ref = (reference: string) => ({ type: 'EXTERNAL_REFERENCE' as const, reference, checkedBy: 'u-admin' });

describe('DocumentRequirement — evidence, not files', () => {
  it('starts REQUIRED with no evidence', () => {
    const r = req();
    expect(r.status).toBe('REQUIRED');
    expect(r.evidence).toHaveLength(0);
    expect(r.requiredCount).toBe(1);
  });

  it('never allows a requiredCount below 1', () => {
    expect(req({ requiredCount: 0 }).requiredCount).toBe(1);
    expect(req({ requiredCount: -4 }).requiredCount).toBe(1);
  });

  it('flips to PROVIDED once evidence meets the required count', () => {
    const r = addEvidence(req(), ref('DOC-123'));
    expect(r.status).toBe('PROVIDED');
    expect(r.evidence[0].reference).toBe('DOC-123');
  });

  // The rule the whole model exists for.
  it('stays REQUIRED while evidence is PARTIAL — 1 of 3 vendor quotes is still a gap', () => {
    let r = req({ type: 'VENDOR_QUOTE', requiredCount: 3 });
    r = addEvidence(r, ref('supplier-a.pdf'));
    expect(r.status).toBe('REQUIRED');
    r = addEvidence(r, ref('supplier-b.pdf'));
    expect(r.status).toBe('REQUIRED');
    r = addEvidence(r, ref('supplier-c.pdf'));
    expect(r.status).toBe('PROVIDED');
  });

  it('rejects empty evidence references', () => {
    expect(() => addEvidence(req(), ref('   '))).toThrow(/reference is required/);
  });

  it('refuses evidence on a not-applicable requirement', () => {
    expect(() => addEvidence(setNotApplicable(req()), ref('x'))).toThrow(/not-applicable/);
  });

  it('records who waived and why — an unattributed waiver is not a control', () => {
    const r = waiveRequirement(req({ type: 'DATASHEET' }), 'u-admin', 'client supplied their own spec');
    expect(r.status).toBe('WAIVED');
    expect(r.note).toBe('client supplied their own spec');
    expect(r.evidence.at(-1)?.checkedBy).toBe('u-admin');
    expect(r.evidence.at(-1)?.reference).toMatch(/^waived:/);
  });

  it('will not waive without a reason', () => {
    expect(() => waiveRequirement(req(), 'u-admin', '  ')).toThrow(/reason/);
  });
});

describe('decisionReadiness', () => {
  const template = (): DocumentRequirement[] =>
    COMMERCIAL_EVIDENCE_TEMPLATE.map((t) => makeDocumentRequirement({ ...base, type: t.type, requiredCount: t.requiredCount }));

  it('is NOT_READY with nothing provided', () => {
    const r = decisionReadiness(template());
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('NOT_READY');
    expect(r.applicable).toBe(4);
    expect(r.missing.map((m) => m.type)).toContain('VENDOR_QUOTE');
  });

  it('is READY only when nothing is outstanding', () => {
    const list = template().map((r) => {
      let x = r;
      for (let i = 0; i < r.requiredCount; i++) x = addEvidence(x, ref(`e${i}`));
      return x;
    });
    const readiness = decisionReadiness(list);
    expect(readiness.score).toBe(100);
    expect(readiness.verdict).toBe('READY');
    expect(readiness.missing).toHaveLength(0);
  });

  it('counts a WAIVED requirement as settled, and reports it as waived', () => {
    const list = template();
    list[3] = waiveRequirement(list[3], 'u-admin', 'not applicable to retrofit scope');
    const r = decisionReadiness(list);
    expect(r.settled).toBe(1);
    expect(r.waived).toEqual(['DATASHEET']);
  });

  it('excludes NOT_APPLICABLE from BOTH sides of the score', () => {
    const list = template();
    list[3] = setNotApplicable(list[3]);
    const r = decisionReadiness(list);
    expect(r.applicable).toBe(3);
    expect(r.score).toBe(0);
    expect(r.missing.map((m) => m.type)).not.toContain('DATASHEET');
  });

  it('is NEARLY_READY at 80%+ but never READY while something is outstanding', () => {
    // 4 of 5 settled = 80%, one vendor quote short
    const list = [
      ...COMMERCIAL_EVIDENCE_TEMPLATE.slice(0, 4).map((t) => {
        let x = makeDocumentRequirement({ ...base, type: t.type, requiredCount: 1 });
        x = addEvidence(x, ref('done'));
        return x;
      }),
      makeDocumentRequirement({ ...base, type: 'VENDOR_QUOTE', requiredCount: 3 }),
    ];
    const r = decisionReadiness(list);
    expect(r.score).toBe(80);
    expect(r.verdict).toBe('NEARLY_READY');
    expect(r.verdict).not.toBe('READY');
  });

  it('sorts what is missing worst-first, so the biggest gap is chased first', () => {
    let partial = makeDocumentRequirement({ ...base, type: 'VENDOR_QUOTE', requiredCount: 3 });
    partial = addEvidence(partial, ref('one'));
    const untouched = makeDocumentRequirement({ ...base, type: 'DRAWING', requiredCount: 1 });
    const r = decisionReadiness([partial, untouched]);
    expect(r.missing[0].type).toBe('DRAWING');
    expect(r.missing[0].have).toBe(0);
    expect(r.missing[1]).toEqual({ type: 'VENDOR_QUOTE', have: 1, need: 3 });
  });

  it('treats a decision with no requirements as ready rather than dividing by zero', () => {
    expect(decisionReadiness([])).toMatchObject({ score: 100, verdict: 'READY', applicable: 0 });
  });
});
