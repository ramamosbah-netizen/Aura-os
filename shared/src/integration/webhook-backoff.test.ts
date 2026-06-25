import { describe, expect, it } from 'vitest';
import { webhookBackoffMs } from './webhook';

describe('webhookBackoffMs', () => {
  it('doubles each attempt from the base', () => {
    expect(webhookBackoffMs(1, 1000)).toBe(1000);
    expect(webhookBackoffMs(2, 1000)).toBe(2000);
    expect(webhookBackoffMs(3, 1000)).toBe(4000);
    expect(webhookBackoffMs(4, 1000)).toBe(8000);
  });

  it('caps the delay', () => {
    expect(webhookBackoffMs(10, 1000, 5000)).toBe(5000);
  });

  it('treats attempts < 1 as the first attempt', () => {
    expect(webhookBackoffMs(0, 1000)).toBe(1000);
  });
});
