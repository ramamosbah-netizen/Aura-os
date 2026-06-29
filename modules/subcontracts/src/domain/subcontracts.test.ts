import { describe, expect, it } from 'vitest';
import { makeSubcontract } from './subcontract';
import { makeClaim } from './claim';
import { InMemorySubcontractStore } from '../in-memory-subcontract-store';
import { SubcontractsService } from '../subcontracts.service';
import { AccessService, type EventStore } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  append: async () => [],
} as unknown as EventStore;

describe('Subcontracts & Claims', () => {
  describe('Subcontract Creation', () => {
    it('creates subcontract with default 10% retention rate', () => {
      const sub = makeSubcontract({
        tenantId: 't1',
        projectId: 'p1',
        title: 'Electrical Subcontract',
        subcontractorName: 'Tesla Electricals',
        value: 150000,
      });

      expect(sub.title).toBe('Electrical Subcontract');
      expect(sub.subcontractorName).toBe('Tesla Electricals');
      expect(sub.value).toBe(150000);
      expect(sub.retentionPercentage).toBe(10);
      expect(sub.status).toBe('draft');
    });
  });

  describe('Progressive Valuations (IPC)', () => {
    it('calculates gross, retention and net values cumulatively across claims', async () => {
      const store = new InMemorySubcontractStore();
      const service = new SubcontractsService(store, mockEvents, mockAccess);

      // 1. Create subcontract
      const sub = await service.createSubcontract({
        tenantId: 't1',
        projectId: 'p1',
        title: 'Concrete Subcontract',
        subcontractorName: 'Apex Concrete',
        value: 100000,
        retentionPercentage: 10,
      });

      // Assert cannot claim against draft
      await expect(
        service.createClaim({
          tenantId: 't1',
          subcontractId: sub.id,
          workCompletedValue: 20000,
        })
      ).rejects.toThrow('Cannot submit claim against inactive subcontract');

      // Activate subcontract
      await service.changeSubcontractStatus(sub.id, 'active');

      // 2. Submit Claim #1: cumulative gross completed = 20,000
      const claim1 = await service.createClaim({
        tenantId: 't1',
        subcontractId: sub.id,
        workCompletedValue: 20000,
      });

      expect(claim1.claimNumber).toBe(1);
      expect(claim1.previouslyCertifiedValue).toBe(0);
      expect(claim1.thisPeriodGrossValue).toBe(20000);
      expect(claim1.retentionWithheld).toBe(2000); // 10% of 20,000
      expect(claim1.netCertifiedValue).toBe(18000); // 20,000 - 2,000

      // Certify Claim #1
      await service.certifyClaim(claim1.id, 'user-1');

      // 3. Submit Claim #2: cumulative gross completed = 55,000
      const claim2 = await service.createClaim({
        tenantId: 't1',
        subcontractId: sub.id,
        workCompletedValue: 55000,
      });

      expect(claim2.claimNumber).toBe(2);
      expect(claim2.previouslyCertifiedValue).toBe(20000); // from Claim #1
      expect(claim2.thisPeriodGrossValue).toBe(35000); // 55,000 - 20,000
      expect(claim2.retentionWithheld).toBe(3500); // 10% of 35,000
      expect(claim2.netCertifiedValue).toBe(31500); // 35,000 - 3,500
    });
  });
});
