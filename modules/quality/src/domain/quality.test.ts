import { describe, expect, it } from 'vitest';
import { makeNcr } from './ncr';
import { makeInspectionRequest } from './inspection-request';
import { makeSnag } from './snag';
import {
  InMemoryNcrStore,
  InMemoryInspectionRequestStore,
  InMemorySnagStore,
  InMemoryItpStore,
} from '../in-memory-quality-store';
import { QualityService } from '../quality.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  appendWithClient: async () => [],
} as unknown as EventStore;

const mockTx: TxRunner = {
  run: (fn) => fn(null),
};

describe('Quality Module Bounded Context', () => {
  describe('NCR (Non-Conformance Reports)', () => {
    it('creates an NCR in raised status', () => {
      const ncr = makeNcr({
        tenantId: 't1',
        projectId: 'p1',
        ncrNumber: 'NCR-2026-001',
        description: 'Concrete core compressive strength below specification',
        severity: 'major',
      });
      expect(ncr.severity).toBe('major');
      expect(ncr.status).toBe('raised');
    });

    it('manages NCR tasks via the service layer', async () => {
      const ncrStore = new InMemoryNcrStore();
      const irStore = new InMemoryInspectionRequestStore();
      const snagStore = new InMemorySnagStore();

      const service = new QualityService(ncrStore, irStore, snagStore, new InMemoryItpStore(), mockEvents, mockTx, mockAccess);

      const ncr = await service.raiseNcr({
        tenantId: 't1',
        projectId: 'p1',
        ncrNumber: 'NCR-2026-001',
        description: 'Incorrect reinforcement spacing in columns',
        severity: 'minor',
      });

      expect(ncr.status).toBe('raised');

      const corrected = await service.updateNcrStatus('t1', null, ncr.id, 'corrected', 'Poor spacing template', 'Repositioned under supervision');
      expect(corrected.status).toBe('corrected');
      expect(corrected.rootCause).toBe('Poor spacing template');
    });
  });

  describe('Inspection Requests (IR)', () => {
    it('requests and approves inspections', async () => {
      const ncrStore = new InMemoryNcrStore();
      const irStore = new InMemoryInspectionRequestStore();
      const snagStore = new InMemorySnagStore();

      const service = new QualityService(ncrStore, irStore, snagStore, new InMemoryItpStore(), mockEvents, mockTx, mockAccess);

      const ir = await service.requestInspection({
        tenantId: 't1',
        projectId: 'p1',
        irNumber: 'IR-CIV-005',
        discipline: 'civil',
        locationDetail: 'Foundation slab pour zone 3',
        inspectionDate: '2026-06-27',
      });

      expect(ir.status).toBe('requested');

      const approved = await service.resolveInspection('t1', 'inspector-1', ir.id, 'approved', 'Rebar placement verified');
      expect(approved.status).toBe('approved');
      expect(approved.inspectedBy).toBe('inspector-1');
    });
  });

  describe('Snagging / Punch Lists', () => {
    it('logs and resolves snags', async () => {
      const ncrStore = new InMemoryNcrStore();
      const irStore = new InMemoryInspectionRequestStore();
      const snagStore = new InMemorySnagStore();

      const service = new QualityService(ncrStore, irStore, snagStore, new InMemoryItpStore(), mockEvents, mockTx, mockAccess);

      const snag = await service.logSnag({
        tenantId: 't1',
        projectId: 'p1',
        description: 'Wall paint discoloration in lobby',
        locationDetail: 'Ground floor main entrance',
        severity: 'low',
      });

      expect(snag.status).toBe('open');
      expect(snag.severity).toBe('low');

      const resolved = await service.resolveSnag('t1', null, snag.id, 'resolved');
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).not.toBeNull();
    });
  });
});
