import { describe, expect, it } from 'vitest';
import { makeNcr } from './ncr';
import { makeInspectionRequest } from './inspection-request';
import { makeSnag } from './snag';
import {
  InMemoryNcrStore,
  InMemoryInspectionRequestStore,
  InMemorySnagStore,
  InMemoryItpStore,
  InMemoryMaterialApprovalStore,
  InMemoryCalibrationStore,
  InMemoryAuditScheduleStore,
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

      const service = new QualityService(ncrStore, irStore, snagStore, new InMemoryItpStore(), new InMemoryMaterialApprovalStore(), new InMemoryCalibrationStore(), new InMemoryAuditScheduleStore(), mockEvents, mockTx, mockAccess);

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

      const service = new QualityService(ncrStore, irStore, snagStore, new InMemoryItpStore(), new InMemoryMaterialApprovalStore(), new InMemoryCalibrationStore(), new InMemoryAuditScheduleStore(), mockEvents, mockTx, mockAccess);

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

      const service = new QualityService(ncrStore, irStore, snagStore, new InMemoryItpStore(), new InMemoryMaterialApprovalStore(), new InMemoryCalibrationStore(), new InMemoryAuditScheduleStore(), mockEvents, mockTx, mockAccess);

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

  describe('Material Approvals Pagination', () => {
    it('paginates material approvals correctly', async () => {
      const ncrStore = new InMemoryNcrStore();
      const irStore = new InMemoryInspectionRequestStore();
      const snagStore = new InMemorySnagStore();
      const itpStore = new InMemoryItpStore();
      const marStore = new InMemoryMaterialApprovalStore();
      const calStore = new InMemoryCalibrationStore();

      const service = new QualityService(ncrStore, irStore, snagStore, itpStore, marStore, calStore, new InMemoryAuditScheduleStore(), mockEvents, mockTx, mockAccess);

      await service.createMaterialApproval({
        tenantId: 't1',
        projectId: 'p1',
        reference: 'MAR-001',
        materialName: 'Steel Rebar Grade 60',
        supplier: 'Steel Corp',
      });
      await service.createMaterialApproval({
        tenantId: 't1',
        projectId: 'p1',
        reference: 'MAR-002',
        materialName: 'Portland Cement Type I',
        supplier: 'Cement Co',
      });
      await service.createMaterialApproval({
        tenantId: 't1',
        projectId: 'p2',
        reference: 'MAR-003',
        materialName: 'Ready Mix Concrete C40',
        supplier: 'Steel Corp',
      });

      const page1 = await service.listMaterialApprovalsPaged({ tenantId: 't1' }, { limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);

      const pageSupplier = await service.listMaterialApprovalsPaged({ tenantId: 't1', supplier: 'Steel Corp' }, { limit: 10, offset: 0 });
      expect(pageSupplier.items.length).toBe(2);
      expect(pageSupplier.items.every(item => item.supplier === 'Steel Corp')).toBe(true);
    });
  });

  describe('Transactional-list pagination (NCR / IR / snag / ITP)', () => {
    it('pages each list with totals and tenant isolation', async () => {
      const service = new QualityService(
        new InMemoryNcrStore(), new InMemoryInspectionRequestStore(), new InMemorySnagStore(),
        new InMemoryItpStore(), new InMemoryMaterialApprovalStore(), new InMemoryCalibrationStore(),
        new InMemoryAuditScheduleStore(), mockEvents, mockTx, mockAccess,
      );

      for (let i = 1; i <= 3; i++) {
        await service.raiseNcr({ tenantId: 't1', projectId: 'p1', ncrNumber: `NCR-${i}`, description: `d${i}`, severity: 'minor' });
        await service.requestInspection({ tenantId: 't1', projectId: 'p1', irNumber: `IR-${i}`, discipline: 'civil', locationDetail: `loc ${i}`, inspectionDate: '2026-07-01' });
        await service.logSnag({ tenantId: 't1', projectId: 'p1', description: `snag ${i}`, locationDetail: `loc ${i}`, severity: 'low' });
        await service.createItp({ tenantId: 't1', projectId: 'p1', reference: `ITP-${i}`, title: `plan ${i}`, points: [{ activity: 'a', pointType: 'hold' }] });
      }
      await service.raiseNcr({ tenantId: 't2', projectId: 'px', ncrNumber: 'OTHER', description: 'other tenant', severity: 'minor' });

      const page = { limit: 2, offset: 0 };
      for (const p of [
        await service.listNcrsPaged('t1', page),
        await service.listInspectionsPaged('t1', page),
        await service.listSnagsPaged('t1', page),
        await service.listItpsPaged('t1', page),
      ]) {
        expect(p.items).toHaveLength(2);
        expect(p.total).toBe(3);
        expect(p.hasMore).toBe(true);
      }

      const rest = await service.listNcrsPaged('t1', { limit: 2, offset: 2 });
      expect(rest.items).toHaveLength(1);
      expect(rest.hasMore).toBe(false);
    });
  });
});
