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
