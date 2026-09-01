import { describe, expect, it } from 'vitest';
import { hashHandoverSnapshot, serializeHandoverSnapshot, verifyHandoverSnapshotHash, isFrozenDeliverySource } from './handover';

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

  it('recognizes the versioned B1 source envelope without requiring B2 item mapping', () => {
    const snapshot = {
      schemaVersion: 1,
      handoverId: 'h1',
      contractId: 'c1',
      tenantId: 't1',
      sourceKind: 'DIRECT',
      sourceOpportunityId: 'o1',
      sourceTenderId: null,
      commercialScopeRevisionId: null,
      boqRevisionId: null,
      estimateRevisionId: 'estimate-r1',
      acceptedQuotationId: 'q1',
      acceptedQuotationRevisionId: 'qr1',
      commercialBaselineId: 'b1',
      originalContractValue: 100,
      currency: 'AED',
      awardAcceptanceType: 'quotation_acceptance',
      awardAcceptanceEvidence: { quotationId: 'q1' },
      frozenCommercialBaseline: null,
      capturedAt: '2026-08-31T10:00:00.000Z',
    };

    expect(isFrozenDeliverySource(snapshot)).toBe(true);
    const hash = hashHandoverSnapshot(snapshot);
    expect(verifyHandoverSnapshotHash(snapshot, hash)).toBe(true);
    expect(verifyHandoverSnapshotHash({ ...snapshot, originalContractValue: 101 }, hash)).toBe(false);
  });

  it('fails closed for an unversioned or malformed source envelope', () => {
    expect(isFrozenDeliverySource({ contractId: 'c1' })).toBe(false);
    expect(isFrozenDeliverySource({ schemaVersion: 1, handoverId: 'h1', contractId: 'c1', tenantId: 't1', sourceKind: 'DIRECT', capturedAt: 'not-a-date' })).toBe(false);
  });
});
