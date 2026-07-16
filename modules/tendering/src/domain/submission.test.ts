import { describe, expect, it } from 'vitest';
import { makeTenderSubmission, SUBMISSION_METHODS } from './submission';

describe('makeTenderSubmission', () => {
  it('defaults: submittedAt=now, method=other, value=0, everything else null', () => {
    const s = makeTenderSubmission({ tenantId: 't1', tenderId: 'tender-1' });
    expect(s.id).toBeTruthy();
    expect(s.method).toBe('other');
    expect(s.submittedValue).toBe(0);
    expect(Date.parse(s.submittedAt)).not.toBeNaN();
    expect(s.portal).toBeNull();
    expect(s.reference).toBeNull();
    expect(s.addendaAcknowledged).toBeNull();
    expect(s.validUntil).toBeNull();
    expect(s.submittedBy).toBeNull();
  });

  it('trims the free-text facts and keeps the value snapshot numeric', () => {
    const s = makeTenderSubmission({
      tenantId: 't1',
      tenderId: 'tender-1',
      tenderTitle: '  Marina CCTV  ',
      method: 'portal',
      portal: ' Etimad ',
      reference: ' SUB-2026-091 ',
      submittedValue: 1_250_000,
      addendaAcknowledged: ' ADD-01..03 ',
    });
    expect(s.tenderTitle).toBe('Marina CCTV');
    expect(s.portal).toBe('Etimad');
    expect(s.reference).toBe('SUB-2026-091');
    expect(s.addendaAcknowledged).toBe('ADD-01..03');
    expect(s.submittedValue).toBe(1_250_000);
  });

  it('blank strings collapse to null — a record of facts holds facts or nothing', () => {
    const s = makeTenderSubmission({ tenantId: 't1', tenderId: 'tender-1', portal: '  ', reference: '' });
    expect(s.portal).toBeNull();
    expect(s.reference).toBeNull();
  });

  it('the method vocabulary is closed', () => {
    expect(SUBMISSION_METHODS).toEqual(['portal', 'email', 'in_person', 'courier', 'other']);
  });
});
