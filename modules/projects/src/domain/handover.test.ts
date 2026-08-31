import { describe, expect, it } from 'vitest';
import { hashHandoverSnapshot, serializeHandoverSnapshot } from './handover';

describe('handover snapshot integrity', () => {
  it('uses deterministic canonical serialization across object key order', () => {
    const a = { contractId: 'c1', source: { value: 100, currency: 'AED' }, lines: [{ code: '1' }] };
    const b = { lines: [{ code: '1' }], source: { currency: 'AED', value: 100 }, contractId: 'c1' };

    expect(serializeHandoverSnapshot(a)).toBe(serializeHandoverSnapshot(b));
    expect(hashHandoverSnapshot(a)).toBe(hashHandoverSnapshot(b));
  });

  it('changes the content hash when a frozen commercial fact changes', () => {
    const snapshot = { contractId: 'c1', originalContractValue: 100, currency: 'AED' };
    expect(hashHandoverSnapshot({ ...snapshot, originalContractValue: 101 })).not.toBe(hashHandoverSnapshot(snapshot));
  });
});
