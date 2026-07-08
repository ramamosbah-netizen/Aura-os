import { describe, expect, it } from 'vitest';
import { makeTransmittal } from './transmittal';
import { makeCorrespondence } from './correspondence';
import { InMemoryTransmittalStore } from '../in-memory-transmittal-store';
import { InMemoryCorrespondenceStore } from '../in-memory-correspondence-store';
import { InMemorySubmittalStore } from '../in-memory-submittal-store';
import { InMemoryDrawingRegisterStore } from '../in-memory-drawing-register-store';
import { InMemoryTransmittalItemStore } from '../in-memory-transmittal-item-store';
import { DocControlService } from '../doccontrol.service';
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

describe('Document Control Module Bounded Context', () => {
  describe('Transmittals', () => {
    it('creates a new transmittal in draft status', () => {
      const t = makeTransmittal({
        tenantId: 't1',
        projectId: 'p1',
        code: 'TRA-101',
        title: 'Architectural Package Submission',
      });
      expect(t.code).toBe('TRA-101');
      expect(t.title).toBe('Architectural Package Submission');
      expect(t.status).toBe('draft');
    });

    it('manages transmittals through the service layer', async () => {
      const transmittalStore = new InMemoryTransmittalStore();
      const correspondenceStore = new InMemoryCorrespondenceStore();
      
      const service = new DocControlService(
        transmittalStore,
        new InMemoryTransmittalItemStore(),
        correspondenceStore,
        new InMemorySubmittalStore(),
        new InMemoryDrawingRegisterStore(),
        mockEvents,
        mockTx,
        mockAccess
      );

      const t = await service.createTransmittal({
        tenantId: 't1',
        projectId: 'p1',
        code: 'TRA-102',
        title: 'Electrical shop drawings submission',
      });

      expect(t.status).toBe('draft');
      
      const acknowledged = await service.acknowledgeTransmittal('t1', null, t.id);
      expect(acknowledged.status).toBe('acknowledged');
    });

    it('paginates transmittals and filters by project', async () => {
      const service = new DocControlService(
        new InMemoryTransmittalStore(),
        new InMemoryTransmittalItemStore(),
        new InMemoryCorrespondenceStore(),
        new InMemorySubmittalStore(),
        new InMemoryDrawingRegisterStore(),
        mockEvents,
        mockTx,
        mockAccess,
      );

      for (let i = 0; i < 3; i++) {
        await service.createTransmittal({ tenantId: 't1', projectId: 'p1', code: `TRA-2${i}`, title: `Package ${i}` });
      }
      await service.createTransmittal({ tenantId: 't1', projectId: 'p2', code: 'TRA-30', title: 'Other project' });

      const page1 = await service.listTransmittalsPaged({ tenantId: 't1' }, { limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(4);
      expect(page1.hasMore).toBe(true);

      const byProject = await service.listTransmittalsPaged({ tenantId: 't1', projectId: 'p1' }, { limit: 10, offset: 0 });
      expect(byProject.total).toBe(3);
      expect(byProject.items.every((t) => t.projectId === 'p1')).toBe(true);
    });
  });

  describe('Correspondence Log', () => {
    it('logs and closes correspondence', async () => {
      const transmittalStore = new InMemoryTransmittalStore();
      const correspondenceStore = new InMemoryCorrespondenceStore();

      const service = new DocControlService(
        transmittalStore,
        new InMemoryTransmittalItemStore(),
        correspondenceStore,
        new InMemorySubmittalStore(),
        new InMemoryDrawingRegisterStore(),
        mockEvents,
        mockTx,
        mockAccess
      );

      const corr = await service.createCorrespondence({
        tenantId: 't1',
        projectId: 'p1',
        code: 'COR-001',
        subject: 'Request for extension of time (EOT)',
        direction: 'outbound',
      });

      expect(corr.status).toBe('logged');
      expect(corr.direction).toBe('outbound');

      const closed = await service.closeCorrespondence('t1', null, corr.id);
      expect(closed.status).toBe('closed');
    });
  });
});
