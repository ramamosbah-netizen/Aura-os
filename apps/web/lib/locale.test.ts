import { describe, expect, it } from 'vitest';
import { BUSINESS_TIME_ZONE, businessDate, businessDateInDays as serverInDays } from '@aura/shared';
import { DISPLAY_TIME_ZONE, businessDateInDays, businessDateInputValue } from './locale';

describe('businessDateInputValue', () => {
  it('uses the Dubai business day when UTC is still on the previous date', () => {
    expect(businessDateInputValue(new Date('2026-09-13T20:30:00.000Z'))).toBe('2026-09-14');
  });

  it('counts days forward from the business day', () => {
    expect(businessDateInDays(7, new Date('2026-09-13T20:30:00.000Z'))).toBe('2026-09-21');
  });
});

/**
 * The date a person sees and the date the server defaults, compares and ages against must be the
 * same date (J4-02). The web keeps its own copy so client bundles do not import the server kernel;
 * this holds the two copies to one zone and one answer.
 */
describe('the web and the server agree on the business date', () => {
  it('uses one zone', () => {
    expect(DISPLAY_TIME_ZONE).toBe(BUSINESS_TIME_ZONE);
  });

  it('gives the same answer either side of midnight in Dubai and at year end', () => {
    for (const iso of ['2026-09-13T19:59:59.999Z', '2026-09-13T20:00:00.000Z', '2026-09-13T20:30:00.000Z', '2026-12-31T21:15:00.000Z', '2026-02-28T22:00:00.000Z']) {
      const at = new Date(iso);
      expect(businessDateInputValue(at), iso).toBe(businessDate(at));
      expect(businessDateInDays(30, at), iso).toBe(serverInDays(30, at));
    }
  });
});
