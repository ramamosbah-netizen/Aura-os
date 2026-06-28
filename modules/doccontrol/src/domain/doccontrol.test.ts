import { describe, expect, it } from 'vitest';
import { makeTransmittal } from './transmittal';
import { makeCorrespondence } from './correspondence';
import { InMemoryTransmittalStore } from '../in-memory-transmittal-store';
import { InMemoryCorrespondenceStore } from '../in-memory-correspondence-store';
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
        correspondenceStore,
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
  });

  describe('Correspondence Log', () => {
    it('logs and closes correspondence', async () => {
      const transmittalStore = new InMemoryTransmittalStore();
      const correspondenceStore = new InMemoryCorrespondenceStore();

      const service = new DocControlService(
        transmittalStore,
        correspondenceStore,
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
