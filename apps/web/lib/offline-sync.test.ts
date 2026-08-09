import { describe, it, expect } from 'vitest';
import { generateUUID } from './offline-sync';

describe('offline-sync utils', () => {
  it('generates a valid UUID string', () => {
    const uuid = generateUUID();
    expect(typeof uuid).toBe('string');
    expect(uuid.length).toBeGreaterThan(10);
  });
});
