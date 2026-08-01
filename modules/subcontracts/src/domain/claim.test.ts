import { describe, it, expect } from 'vitest';
import { makeClaim } from './claim';

describe('subcontract claim domain (payment certification math)', () => {
  it('computes this-period gross, retention and net for a normal claim', () => {
    const c = makeClaim(
      { tenantId: 't', subcontractId: 's', claimNumber: 2, workCompletedValue: 100000, previouslyCertifiedValue: 60000 },
      10,
    );
    expect(c.thisPeriodGrossValue).toBe(40000);
    expect(c.retentionWithheld).toBe(4000);
    expect(c.netCertifiedValue).toBe(36000);
    expect(c.status).toBe('draft');
  });

  it('clamps a negative period gross to zero (no over-certification)', () => {
    const c = makeClaim(
      { tenantId: 't', subcontractId: 's', claimNumber: 3, workCompletedValue: 50000, previouslyCertifiedValue: 60000 },
      10,
    );
    expect(c.thisPeriodGrossValue).toBe(0);
    expect(c.retentionWithheld).toBe(0);
    expect(c.netCertifiedValue).toBe(0);
  });

  it('a retention-release claim pays the released amount with no new gross/retention', () => {
    const c = makeClaim(
      { tenantId: 't', subcontractId: 's', claimNumber: 9, workCompletedValue: 0, previouslyCertifiedValue: 100000, isRetentionRelease: true, retentionReleased: 5000 },
      10,
    );
    expect(c.isRetentionRelease).toBe(true);
    expect(c.thisPeriodGrossValue).toBe(0);
    expect(c.retentionWithheld).toBe(0);
    expect(c.netCertifiedValue).toBe(5000);
  });
});
