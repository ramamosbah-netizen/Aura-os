import { describe, it, expect } from 'vitest';
import { makeOpportunity } from './crm';

const base = { tenantId: 't1', title: 'Tower B ELV' };

describe('Opportunity executionType ↔ requiresTender invariant', () => {
  it('defaults to tender (preserving the historical requiresTender default)', () => {
    const o = makeOpportunity(base);
    expect(o.executionType).toBe('tender');
    expect(o.requiresTender).toBe(true);
  });

  it('maps the legacy boolean: requiresTender=false → direct_sale', () => {
    const o = makeOpportunity({ ...base, requiresTender: false });
    expect(o.executionType).toBe('direct_sale');
    expect(o.requiresTender).toBe(false);
  });

  it('takes executionType as the truth, deriving requiresTender from it', () => {
    expect(makeOpportunity({ ...base, executionType: 'direct_sale' }).requiresTender).toBe(false);
    expect(makeOpportunity({ ...base, executionType: 'tender' }).requiresTender).toBe(true);
    // The non-tender execution types all read as requiresTender=false — none auto-creates a tender.
    for (const t of ['framework_agreement', 'amc_renewal', 'variation_order'] as const) {
      const o = makeOpportunity({ ...base, executionType: t });
      expect(o.executionType).toBe(t);
      expect(o.requiresTender).toBe(false);
    }
  });

  it('executionType wins when both are supplied (the boolean is the shadow)', () => {
    const o = makeOpportunity({ ...base, executionType: 'direct_sale', requiresTender: true });
    expect(o.executionType).toBe('direct_sale');
    expect(o.requiresTender).toBe(false);
  });
});
