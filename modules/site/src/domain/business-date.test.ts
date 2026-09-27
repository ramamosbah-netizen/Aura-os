import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSiteSurvey } from './survey';

/**
 * J4-02 — a record written just after midnight in Dubai is dated the day it was written. The server
 * used to default "today" to the UTC date, which is still yesterday until 04:00 in the UAE.
 */
describe('site records default to the business date', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('dates a survey recorded at 00:30 Dubai time on that day, not the day before', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T20:30:00.000Z')); // 00:30 on the 14th in Dubai
    const survey = makeSiteSurvey({ tenantId: 't1', siteAddress: 'Marina Tower', scopeNotes: 'CCTV survey' });
    expect(survey.surveyDate).toBe('2026-09-14');
  });

  it('keeps a date the surveyor gave', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T20:30:00.000Z'));
    expect(makeSiteSurvey({ tenantId: 't1', siteAddress: 'Marina Tower', scopeNotes: 'CCTV survey', surveyDate: '2026-09-12' }).surveyDate).toBe('2026-09-12');
  });
});
