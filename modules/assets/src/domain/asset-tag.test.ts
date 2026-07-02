import { describe, expect, it } from 'vitest';
import { makeAssetTag } from './asset-tag';

describe('asset QR tag', () => {
  it('builds a stable deep-link payload with the serial as cross-check', () => {
    const tag = makeAssetTag({ id: 'a-1', serialNumber: 'gen-7701', name: 'Generator 250kVA', category: 'Plant' });
    expect(tag.tagCode).toBe('GEN-7701');
    expect(tag.payload).toBe('aura://assets/a-1?sn=GEN-7701');
    expect(tag.name).toBe('Generator 250kVA');
  });

  it('URI-encodes awkward serials', () => {
    const tag = makeAssetTag({ id: 'a-2', serialNumber: 'SN 10/B#4', name: 'Pump', category: 'Plant' });
    expect(tag.payload).toBe('aura://assets/a-2?sn=SN%2010%2FB%234');
  });

  it('requires id and serial', () => {
    expect(() => makeAssetTag({ id: '', serialNumber: 'X', name: 'n', category: 'c' })).toThrow(/id/);
    expect(() => makeAssetTag({ id: 'a', serialNumber: ' ', name: 'n', category: 'c' })).toThrow(/serial/);
  });
});
