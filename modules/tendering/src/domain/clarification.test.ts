import { describe, expect, it } from 'vitest';
import { CLARIFICATION_KINDS, makeTenderClarification, withAnswer } from './clarification';

const base = { tenantId: 't1', tenderId: 'tender-1', title: 'Spec of camera poles?' };

describe('makeTenderClarification', () => {
  it('defaults: kind=clarification, issuedAt=today, unanswered', () => {
    const c = makeTenderClarification(base);
    expect(c.kind).toBe('clarification');
    expect(c.issuedAt).toBe(new Date().toISOString().slice(0, 10));
    expect(c.answer).toBeNull();
    expect(c.answeredAt).toBeNull();
    expect(c.deadlineExtendedTo).toBeNull();
  });

  it('trims the facts and requires a title', () => {
    const c = makeTenderClarification({ ...base, reference: ' RFI-04 ', body: '  which spec?  ' });
    expect(c.reference).toBe('RFI-04');
    expect(c.body).toBe('which spec?');
    expect(() => makeTenderClarification({ ...base, title: '  ' })).toThrow(/title/);
  });

  it('only an addendum can move the deadline', () => {
    const add = makeTenderClarification({ ...base, kind: 'addendum', deadlineExtendedTo: '2026-09-01' });
    expect(add.deadlineExtendedTo).toBe('2026-09-01');
    expect(() => makeTenderClarification({ ...base, kind: 'clarification', deadlineExtendedTo: '2026-09-01' }))
      .toThrow(/addendum fact/);
  });

  it('the kind vocabulary is closed', () => {
    expect(CLARIFICATION_KINDS).toEqual(['clarification', 'addendum']);
    expect(() => makeTenderClarification({ ...base, kind: 'rumour' as never })).toThrow(/invalid clarification kind/);
  });
});

describe('withAnswer', () => {
  it('fills the answer and stamps answeredAt, never rewriting the ask', () => {
    const c = makeTenderClarification(base);
    const answered = withAnswer(c, ' Use spec B. ');
    expect(answered.answer).toBe('Use spec B.');
    expect(answered.answeredAt).not.toBeNull();
    expect(answered.title).toBe(c.title);
    expect(() => withAnswer(c, '  ')).toThrow(/answer is required/);
  });
});
