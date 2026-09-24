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
    expect(() => addEvidence(setNotApplicable(req(), 'u-qs2', 'retrofit, no new devices'), ref('x'))).toThrow(/not-applicable/);
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

  /**
   * THE PREPARER MAY NOT EXCUSE THEIR OWN EVIDENCE. A requirement exists so a decision is not
   * taken on the preparer's word alone, so their excusing it is the one exclusion that defeats it.
   */
  it('refuses the preparer waiving evidence on their own decision', () => {
    expect(() => waiveRequirement(req({ type: 'VENDOR_QUOTE' }), 'u-qs', 'only two suppliers quoted', new Date(), { preparedBy: 'u-qs' }))
      .toThrow(/access denied: the person who prepared this decision may not waive/i);
  });

  it('lets somebody other than the preparer waive it, and records who and why', () => {
    const r = waiveRequirement(req({ type: 'VENDOR_QUOTE' }), 'u-qs2', 'only two suppliers quoted', new Date(), { preparedBy: 'u-qs' });
    expect(r.status).toBe('WAIVED');
    expect(r.evidence.at(-1)?.checkedBy).toBe('u-qs2');
  });

  it('applies no preparer check where the record names no preparer', () => {
    // Stated rather than implied: an entity type with no preparer rule is not refused by one.
    expect(waiveRequirement(req(), 'u-qs', 'reason', new Date(), { preparedBy: null }).status).toBe('WAIVED');
  });
});

describe('"not applicable" costs what a waiver costs', () => {
  /**
   * It took no actor and no reason. MEASURED on the live checklist: the offer's own preparer
   * excused VENDOR_QUOTE with an empty body, got 201, and the verdict went NOT_READY → READY with
   * `note: null` and `evidence: []` — nothing on the record said the decision was ever taken.
   */
  it('requires a reason', () => {
    expect(() => setNotApplicable(req(), 'u-qs2', '   ')).toThrow(/needs a reason/i);
  });

  it('records who excluded it and why, as evidence', () => {
    const r = setNotApplicable(req({ type: 'DATASHEET' }), 'u-qs2', 'client supplied their own spec');
    expect(r.status).toBe('NOT_APPLICABLE');
    expect(r.note).toBe('client supplied their own spec');
    expect(r.evidence.at(-1)?.checkedBy).toBe('u-qs2');
    expect(r.evidence.at(-1)?.reference).toMatch(/^not applicable:/);
  });

  it('refuses the preparer excluding their own evidence this way either', () => {
    // The route that had no guard is the one a preparer refused a waiver would reach for next.
    expect(() => setNotApplicable(req({ type: 'VENDOR_QUOTE' }), 'u-qs', 'single source', new Date(), { preparedBy: 'u-qs' }))
      .toThrow(/access denied: the person who prepared this decision may not exclude/i);
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
    list[3] = setNotApplicable(list[3], 'u-qs2', 'not applicable to retrofit scope');
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

  /**
   * THIS TEST USED TO ASSERT `score: 100, verdict: 'READY'` for an empty checklist, and its name
   * said why: "rather than dividing by zero". The arithmetic concern was right and is still
   * honoured — nothing divides by zero. The verdict was the part that did not survive contact with
   * the product.
   *
   * MEASURED, on a real tender: `assertApprovalReadiness` refuses an empty checklist outright —
   * "quotation QUO-2026-000001 approval blocked: readiness checklist is not configured" — while
   * this function told every screen the same quotation was READY at 100%. Two answers to one
   * question, and the green one was on the screen a person looks at.
   *
   * A decision nobody has written a checklist for has not met its evidence requirements; it has
   * not had them stated. That is a third state, not a flattering reading of the first.
   */
  it('reports an unconfigured checklist as its own verdict, and still never divides by zero', () => {
    expect(decisionReadiness([])).toMatchObject({ score: 0, verdict: 'UNCONFIGURED', applicable: 0 });
    expect(Number.isFinite(decisionReadiness([]).score)).toBe(true);
  });

  it('reports a checklist whose every requirement is NOT_APPLICABLE as unconfigured too', () => {
    // Stated and dismissed is not the same as met, and it is the same emptiness downstream: there
    // is no evidence behind the decision either way.
    const na = setNotApplicable(makeDocumentRequirement({
      tenantId: 't1', entityType: 'crm.quotation', entityId: 'q1', type: 'VENDOR_QUOTE', requiredCount: 3,
    }), 'u-qs2', 'single-source proprietary system');
    expect(decisionReadiness([na]).verdict).toBe('UNCONFIGURED');
  });
});
