import { describe, expect, it } from 'vitest';
import { makePlantUsage } from './plant-usage';
import { makeLabourAllocation } from './labour-allocation';

/**
 * AURA-PM-002 — site actuals carry a stable reference to the resource they consumed.
 *
 * Before this, "TC-01", "Tower Crane TC-01" and "Tower crane 1" were three cranes to the system, and
 * a day's plant usage could never be matched against the §22 booking that planned it. These pin the
 * fix: plant usage carries a typed reference in the same stored form §22 uses (type + id in the
 * owning register), and labour carries the subcontractor's supplier id — the keys reconciliation
 * matches on. The free-text label stays as a label; it is no longer the identity.
 */
describe('AURA-PM-002 — actual resource lineage', () => {
  const base = { tenantId: 't1', projectId: 'p1', date: '2026-07-07' };

  describe('PlantUsage', () => {
    it('carries a typed resource reference alongside the free-text equipment label', () => {
      const u = makePlantUsage({ ...base, equipment: 'Tower Crane TC-01', hours: 8, resourceType: 'asset', resourceId: '  9f3c0000-0000-0000-0000-0000000000fc  ' });
      expect(u.resourceType).toBe('asset');
      expect(u.resourceId).toBe('9f3c0000-0000-0000-0000-0000000000fc'); // trimmed
      expect(u.equipment).toBe('Tower Crane TC-01'); // label preserved, not the identity
    });

    it('defaults to no reference (both null) — usage without a registered resource stays valid', () => {
      const u = makePlantUsage({ ...base, equipment: 'Hired scissor lift', hours: 4 });
      expect(u.resourceType).toBeNull();
      expect(u.resourceId).toBeNull();
    });

    it('refuses a partial reference: a type with no id matches nothing', () => {
      expect(() => makePlantUsage({ ...base, equipment: 'x', hours: 1, resourceType: 'vehicle' }))
        .toThrow(/both a type and an id, or neither/);
    });

    it('refuses a partial reference: an id with no type is ambiguous between registers', () => {
      expect(() => makePlantUsage({ ...base, equipment: 'x', hours: 1, resourceId: 'abc' }))
        .toThrow(/both a type and an id, or neither/);
    });

    it('refuses an unknown resource type', () => {
      expect(() => makePlantUsage({ ...base, equipment: 'x', hours: 1, resourceType: 'employee' as never, resourceId: 'abc' }))
        .toThrow(/unknown plant resource type/);
    });
  });

  describe('LabourAllocation', () => {
    it('carries the subcontractor supplier id alongside the name label', () => {
      const a = makeLabourAllocation({ ...base, trade: 'Steelfixer', headcount: 6, hours: 8, subcontractorName: 'Gulf Steel LLC', subcontractorId: '  sup-42  ' });
      expect(a.subcontractorId).toBe('sup-42'); // trimmed
      expect(a.subcontractorName).toBe('Gulf Steel LLC');
    });

    it('defaults to no subcontractor id — own labour stays valid', () => {
      const a = makeLabourAllocation({ ...base, trade: 'Mason', headcount: 3, hours: 8 });
      expect(a.subcontractorId).toBeNull();
    });
  });
});
