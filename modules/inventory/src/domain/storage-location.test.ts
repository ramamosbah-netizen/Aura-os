import { describe, it, expect } from 'vitest';
import { makeStorageLocation, setLocationActive } from './storage-location';

describe('storage-location domain', () => {
  it('creates an active location, upper-casing the bin code and defaulting the type', () => {
    const l = makeStorageLocation({ tenantId: 't', warehouse: 'Main Store', binCode: 'a-12', description: '  top shelf ' });
    expect(l.active).toBe(true);
    expect(l.binCode).toBe('A-12');
    expect(l.type).toBe('bin');
    expect(l.description).toBe('top shelf');
  });

  it('requires warehouse and bin code', () => {
    expect(() => makeStorageLocation({ tenantId: 't', warehouse: ' ', binCode: 'A1' })).toThrow(/warehouse is required/i);
    expect(() => makeStorageLocation({ tenantId: 't', warehouse: 'W', binCode: '' })).toThrow(/binCode is required/i);
  });

  it('normalises an unknown type to bin and honours a valid one', () => {
    expect(makeStorageLocation({ tenantId: 't', warehouse: 'W', binCode: 'A1', type: 'nope' as never }).type).toBe('bin');
    expect(makeStorageLocation({ tenantId: 't', warehouse: 'W', binCode: 'A1', type: 'van' }).type).toBe('van');
  });

  it('setLocationActive toggles the flag', () => {
    const l = makeStorageLocation({ tenantId: 't', warehouse: 'W', binCode: 'A1' });
    expect(setLocationActive(l, false).active).toBe(false);
  });
});
