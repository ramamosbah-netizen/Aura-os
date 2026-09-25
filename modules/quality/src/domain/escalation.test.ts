import { describe, expect, it } from 'vitest';
import { assertDecidable, decideNcrRaised, decideNotNonconformance, makeEscalation } from './escalation';

const asked = () => makeEscalation({
  tenantId: 't1', projectId: 'p1', sourceId: 'punch-1', sourceReference: 'TC-CCTV-01', system: 'cctv',
  description: 'Camera 3 out of focus', severity: 'major', pointNo: 'IMG-03', failingRunNo: 1, requestedBy: 'u-tc',
});

describe('TC-08 — what T&C escalates, Quality decides', () => {
  it('lands as Quality\'s own pending record, carrying the failing evidence', () => {
    expect(asked()).toMatchObject({ status: 'pending', sourceType: 'commissioning.punch', pointNo: 'IMG-03', requestedBy: 'u-tc', ncrId: null });
    expect(() => makeEscalation({ tenantId: 't1', projectId: 'p1', sourceId: 'x', description: 'x', requestedBy: null })).toThrow(/requires the person asking/);
  });

  it('the person who asked may not decide it', () => {
    expect(() => decideNotNonconformance(asked(), { reason: 'x', actorId: 'u-tc' })).toThrow(/access denied: the person who escalated/);
    expect(() => assertDecidable(asked(), null)).toThrow(/requires an authenticated person/);
  });

  it('raises an NCR, or declines with a reason — and a decision is final', () => {
    const raised = decideNcrRaised(asked(), { ncrId: 'ncr-9', actorId: 'u-qa' });
    expect(raised).toMatchObject({ status: 'ncr_raised', ncrId: 'ncr-9', decidedBy: 'u-qa' });
    expect(() => decideNotNonconformance(raised, { reason: 'x', actorId: 'u-qa' })).toThrow(/only a pending escalation can be decided — this one is ncr_raised/);
    expect(() => decideNotNonconformance(asked(), { reason: ' ', actorId: 'u-qa' })).toThrow(/requires a reason/);
    const declined = decideNotNonconformance(asked(), { reason: 'Installation workmanship — a snag, not a non-conformance', actorId: 'u-qa' });
    expect(declined).toMatchObject({ status: 'not_nonconformance', decidedBy: 'u-qa', ncrId: null });
  });
});
