import { describe, it, expect } from 'vitest';
import {
  computeCertificate,
  makePaymentCertificate,
  certificateSummary,
  priorCertifiedNet,
  type PaymentCertificate,
} from './payment-certificate';

describe('IPC certification math', () => {
  it('holds retention on work done and deducts previous net (IPC #1)', () => {
    // Work done 1,000,000; 10% retention; no prior certificates.
    const m = computeCertificate({
      contractValue: 10_000_000,
      cumulativeWorkDone: 1_000_000,
      materialsOnSite: 0,
      retentionPercent: 10,
      retentionCapPercent: 0,
      advanceRecoveredToDate: 0,
      previousCertifiedNet: 0,
    });
    expect(m.grossToDate).toBe(1_000_000);
    expect(m.retentionToDate).toBe(100_000);
    expect(m.netCertifiedToDate).toBe(900_000);
    expect(m.netThisCertificate).toBe(900_000);
  });

  it('pays only the increment over the previous certificate (IPC #2)', () => {
    // Cumulative work now 2,500,000; prior net paid 900,000.
    const m = computeCertificate({
      contractValue: 10_000_000,
      cumulativeWorkDone: 2_500_000,
      materialsOnSite: 0,
      retentionPercent: 10,
      retentionCapPercent: 0,
      advanceRecoveredToDate: 0,
      previousCertifiedNet: 900_000,
    });
    expect(m.grossToDate).toBe(2_500_000);
    expect(m.retentionToDate).toBe(250_000);
    expect(m.netCertifiedToDate).toBe(2_250_000);
    expect(m.netThisCertificate).toBe(1_350_000); // 2,250,000 − 900,000
  });

  it('caps retention at the contract cap percent', () => {
    // 10% of 6,000,000 work = 600,000, but cap is 5% of 10,000,000 = 500,000.
    const m = computeCertificate({
      contractValue: 10_000_000,
      cumulativeWorkDone: 6_000_000,
      materialsOnSite: 0,
      retentionPercent: 10,
      retentionCapPercent: 5,
      advanceRecoveredToDate: 0,
      previousCertifiedNet: 0,
    });
    expect(m.retentionToDate).toBe(500_000); // capped, not 600,000
    expect(m.netCertifiedToDate).toBe(5_500_000);
  });

  it('adds materials on site (no retention on materials) and recovers advance', () => {
    const m = computeCertificate({
      contractValue: 10_000_000,
      cumulativeWorkDone: 1_000_000,
      materialsOnSite: 200_000,
      retentionPercent: 10,
      retentionCapPercent: 0,
      advanceRecoveredToDate: 50_000,
      previousCertifiedNet: 0,
    });
    expect(m.grossToDate).toBe(1_200_000);
    expect(m.retentionToDate).toBe(100_000); // 10% of work only, not materials
    expect(m.netCertifiedToDate).toBe(1_050_000); // 1,200,000 − 100,000 − 50,000
    expect(m.netThisCertificate).toBe(1_050_000);
  });

  it('makePaymentCertificate stamps a default reference and draft status', () => {
    const c = makePaymentCertificate({
      tenantId: 't1',
      contractId: 'c1',
      contractValue: 1_000_000,
      sequence: 3,
      cumulativeWorkDone: 100_000,
      retentionPercent: 10,
    });
    expect(c.reference).toBe('IPC-003');
    expect(c.status).toBe('draft');
    expect(c.netThisCertificate).toBe(90_000);
  });

  it('rejects negative work done and out-of-range retention', () => {
    expect(() => makePaymentCertificate({ tenantId: 't', contractId: 'c', sequence: 1, cumulativeWorkDone: -1 })).toThrow();
    expect(() =>
      makePaymentCertificate({ tenantId: 't', contractId: 'c', sequence: 1, cumulativeWorkDone: 10, retentionPercent: 150 }),
    ).toThrow();
  });
});

describe('contract billing rollup', () => {
  const base = {
    tenantId: 't1',
    companyId: null,
    contractId: 'c1',
    contractTitle: 'Tower A',
    accountId: 'a1',
    accountName: 'Client',
    retentionPercent: 10,
    retentionCapPercent: 0,
    advanceRecoveredToDate: 0,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    certifiedBy: null,
    certifiedAt: null,
    periodStart: null,
    periodEnd: null,
    materialsOnSite: 0,
  };

  const cert = (over: Partial<PaymentCertificate>): PaymentCertificate =>
    makePaymentCertificateRow({ ...base, ...over } as any);

  // build a row through the domain factory so computed fields are consistent
  function makePaymentCertificateRow(o: any): PaymentCertificate {
    const c = makePaymentCertificate({
      tenantId: o.tenantId,
      contractId: o.contractId,
      contractTitle: o.contractTitle,
      contractValue: o.contractValue,
      accountId: o.accountId,
      accountName: o.accountName,
      sequence: o.sequence,
      cumulativeWorkDone: o.cumulativeWorkDone,
      retentionPercent: o.retentionPercent,
      previousCertifiedNet: o.previousCertifiedNet,
    });
    return { ...c, status: o.status ?? 'draft' };
  }

  it('priorCertifiedNet sums only issued certificates', () => {
    const certs = [
      cert({ sequence: 1, contractValue: 10_000_000, cumulativeWorkDone: 1_000_000, previousCertifiedNet: 0, status: 'certified' }),
      cert({ sequence: 2, contractValue: 10_000_000, cumulativeWorkDone: 1_000_000, previousCertifiedNet: 0, status: 'draft' }),
    ];
    expect(priorCertifiedNet(certs)).toBe(900_000); // only the certified one counts
  });

  it('summary reports percent complete from the latest issued certificate', () => {
    const certs = [
      cert({ sequence: 1, contractValue: 10_000_000, cumulativeWorkDone: 2_000_000, previousCertifiedNet: 0, status: 'paid' }),
      cert({ sequence: 2, contractValue: 10_000_000, cumulativeWorkDone: 5_000_000, previousCertifiedNet: 1_800_000, status: 'certified' }),
    ];
    const s = certificateSummary(10_000_000, certs);
    expect(s.grossCertifiedToDate).toBe(5_000_000);
    expect(s.retentionHeld).toBe(500_000);
    expect(s.percentComplete).toBe(50);
    expect(s.certificateCount).toBe(2);
  });
});
