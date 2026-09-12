import { describe, expect, it } from 'vitest';
import { filterAreaRows } from './project-areas';

describe('filterAreaRows', () => {
  const rows = [
    { id: 'cctv', discipline: 'CCTV' },
    { id: 'access', discipline: 'Access Control' },
    { id: 'general', title: 'Project-wide permit' },
  ];

  it('returns every row when no discipline lens is selected', () => {
    expect(filterAreaRows(rows, null)).toEqual(rows);
  });

  it('keeps matching and project-wide records while excluding another discipline', () => {
    expect(filterAreaRows(rows, 'access-control').map((row) => row.id)).toEqual(['access', 'general']);
  });

  it('matches normalised system values used by commissioning records', () => {
    expect(filterAreaRows([{ id: 'one', system: 'Gate Barriers' }], 'gate-barriers')).toHaveLength(1);
  });
});

/**
 * TC-GATE-12 — the lens resolves ELV-system aliases before comparing.
 *
 * It used to strip punctuation and stop there, so 'access-control' and 'access_control' matched and
 * 'acs' matched nothing — though @aura/shared recognises it, and the same blindness in the
 * commissioning readiness chain let an open non-conformance miss the system it was raised against.
 *
 * The punctuation strip is still the fallback, because this lens compares heterogeneous fields: a
 * drawing's discipline is not an ELV system and must keep comparing the way it always did.
 */
describe('filterAreaRows — ELV system aliases (TC-GATE-12)', () => {
  const rows = [
    { id: 'a', system: 'access_control' },
    { id: 'b', system: 'acs' },
    { id: 'c', system: 'cctv' },
    { id: 'd', discipline: 'architectural' },
    { id: 'e' },
  ];

  it('brings an aliased row under the same lens as its canonical twin', () => {
    const picked = filterAreaRows(rows, 'access_control').map((r) => r.id);
    expect(picked).toContain('a');
    expect(picked).toContain('b');
    expect(picked, 'a different system must still be filtered out').not.toContain('c');
  });

  it('keeps a row with no discipline or system under every lens', () => {
    expect(filterAreaRows(rows, 'cctv').map((r) => r.id)).toContain('e');
  });

  it('still compares non-system dimensions the way it always did', () => {
    const picked = filterAreaRows(rows, 'architectural').map((r) => r.id);
    expect(picked).toContain('d');
    expect(picked).not.toContain('a');
  });
});
