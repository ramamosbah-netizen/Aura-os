import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUSINESS_TIME_ZONE, businessDate, businessDateInDays } from './business-date';

describe('the business date (J4-02)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('is the company’s day, not UTC’s, in the four hours after midnight in Dubai', () => {
    // 00:30 on the 14th in Dubai is 20:30 on the 13th in UTC.
    expect(businessDate(new Date('2026-09-13T20:30:00.000Z'))).toBe('2026-09-14');
    expect(new Date('2026-09-13T20:30:00.000Z').toISOString().slice(0, 10)).toBe('2026-09-13');
    // Either side of the boundary.
    expect(businessDate(new Date('2026-09-13T19:59:59.999Z'))).toBe('2026-09-13');
    expect(businessDate(new Date('2026-09-13T20:00:00.000Z'))).toBe('2026-09-14');
    expect(BUSINESS_TIME_ZONE).toBe('Asia/Dubai');
  });

  it('defaults to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T21:15:00.000Z'));
    expect(businessDate()).toBe('2027-01-01');
    expect(businessDateInDays(7)).toBe('2027-01-08');
    expect(businessDateInDays(-1)).toBe('2026-12-31');
  });

  it('crosses month and year ends without drifting', () => {
    expect(businessDateInDays(30, new Date('2026-02-27T21:00:00.000Z'))).toBe('2026-03-30');
  });
});
