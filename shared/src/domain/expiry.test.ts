import { describe, expect, it } from 'vitest';
import {
  classifyExpiry,
  daysBetween,
  daysUntil,
  expiryStatusOn,
  isDateOnly,
  isOnExpiryWatchlist,
} from './expiry';

describe('daysBetween / daysUntil', () => {
  it('counts calendar days, not elapsed time', () => {
    expect(daysBetween('2026-08-01', '2026-08-11')).toBe(10);
    expect(daysUntil('2026-08-11', '2026-08-01')).toBe(10);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntil('2026-07-01', '2026-08-11')).toBe(-41);
  });

  it('is zero on the day itself — an expiry date is valid until it passes', () => {
    expect(daysUntil('2026-08-11', '2026-08-11')).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2026-03-01', '2026-02-28')).toBe(1); // 2026 is not a leap year
  });

  it('is anchored at UTC midnight, so the result does not drift with the clock', () => {
    // The whole reason for the T00:00:00Z anchor: without it a value computed late in the day
    // lands a day out, and a certificate reads as valid on the day it expires.
    expect(daysBetween('2026-08-11', '2026-08-12')).toBe(1);
    expect(daysBetween('2026-08-12', '2026-08-11')).toBe(-1);
  });
});

describe('classifyExpiry', () => {
  it('calls a passed date expired', () => {
    expect(classifyExpiry(-1, 30)).toBe('expired');
    expect(classifyExpiry(-100, 30)).toBe('expired');
  });

  it('calls today expiring, not expired — it has not passed yet', () => {
    expect(classifyExpiry(0, 30)).toBe('expiring');
  });

  it('treats the window as inclusive', () => {
    expect(classifyExpiry(30, 30)).toBe('expiring');
    expect(classifyExpiry(31, 30)).toBe('valid');
  });

  it('calls anything beyond the window valid', () => {
    expect(classifyExpiry(365, 30)).toBe('valid');
  });
});

describe('isOnExpiryWatchlist', () => {
  it('includes items already past their date — the most urgent ones', () => {
    // The rule bank-guarantee had to be corrected into: a live obligation 43 days overdue must
    // not silently drop off the list while one due in 10 days stays on it.
    expect(isOnExpiryWatchlist(-43, 30)).toBe(true);
    expect(isOnExpiryWatchlist(10, 30)).toBe(true);
  });

  it('excludes items comfortably in the future', () => {
    expect(isOnExpiryWatchlist(31, 30)).toBe(false);
  });

  it('agrees with classifyExpiry — on the list is exactly "not valid"', () => {
    for (const days of [-100, -1, 0, 1, 29, 30, 31, 400]) {
      expect(isOnExpiryWatchlist(days, 30)).toBe(classifyExpiry(days, 30) !== 'valid');
    }
  });
});

describe('expiryStatusOn', () => {
  it('classifies straight from dates', () => {
    expect(expiryStatusOn('2026-07-01', '2026-08-11', 30)).toBe('expired');
    expect(expiryStatusOn('2026-08-20', '2026-08-11', 30)).toBe('expiring');
    expect(expiryStatusOn('2027-08-20', '2026-08-11', 30)).toBe('valid');
  });
});

describe('isDateOnly', () => {
  it('accepts a YYYY-MM-DD string and nothing else', () => {
    expect(isDateOnly('2026-08-11')).toBe(true);
    expect(isDateOnly('2026-08-11T00:00:00Z')).toBe(false);
    expect(isDateOnly('11/08/2026')).toBe(false);
    expect(isDateOnly('')).toBe(false);
    expect(isDateOnly(null)).toBe(false);
    expect(isDateOnly(undefined)).toBe(false);
  });
});
