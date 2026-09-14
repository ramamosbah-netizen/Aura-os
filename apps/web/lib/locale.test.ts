import { describe, expect, it } from 'vitest';
import { businessDateInputValue } from './locale';

describe('businessDateInputValue', () => {
  it('uses the Dubai business day when UTC is still on the previous date', () => {
    expect(businessDateInputValue(new Date('2026-09-13T20:30:00.000Z'))).toBe('2026-09-14');
  });
});
