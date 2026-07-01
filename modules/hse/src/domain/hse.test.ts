import { describe, expect, it } from 'vitest';
import { makeHseIncident } from './hse-incident';
import { makePermitToWork } from './permit-to-work';
import { makeCapaAction } from './capa-action';
import {
  InMemoryHseIncidentStore,
  InMemoryPermitToWorkStore,
  InMemoryCapaActionStore,
  InMemoryToolboxTalkStore,
  InMemoryRiskAssessmentStore,
} from '../in-memory-hse-store';
import { HseService } from '../hse.service';
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

describe('HSE Module Bounded Context', () => {
  describe('Incidents', () => {
    it('creates an incident in reported status', () => {
      const inc = makeHseIncident({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        severity: 'minor',
        description: 'Slipped on wet floor in corridor A',
        locationDetail: 'Block B, Ground Floor',
      });
      expect(inc.severity).toBe('minor');
      expect(inc.status).toBe('reported');
    });

    it('manages incidents via the service layer', async () => {
      const incidentStore = new InMemoryHseIncidentStore();
      const ptwStore = new InMemoryPermitToWorkStore();
      const capaStore = new InMemoryCapaActionStore();

      const service = new HseService(incidentStore, ptwStore, capaStore, new InMemoryToolboxTalkStore(), new InMemoryRiskAssessmentStore(), mockEvents, mockTx, mockAccess);

      const inc = await service.reportIncident({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        severity: 'minor',
        description: 'First aid kit used for minor cut',
        locationDetail: 'Substation room',
      });

      expect(inc.status).toBe('reported');

      const closed = await service.closeIncident('t1', null, inc.id);
      expect(closed.status).toBe('closed');
    });
  });

  describe('Permits to Work (PTW)', () => {
    it('requests and approves permits', async () => {
      const incidentStore = new InMemoryHseIncidentStore();
      const ptwStore = new InMemoryPermitToWorkStore();
      const capaStore = new InMemoryCapaActionStore();

      const service = new HseService(incidentStore, ptwStore, capaStore, new InMemoryToolboxTalkStore(), new InMemoryRiskAssessmentStore(), mockEvents, mockTx, mockAccess);

      const permit = await service.requestPermit({
        tenantId: 't1',
        projectId: 'p1',
        permitType: 'hot_work',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 86400000).toISOString(),
        description: 'Welding on main line riser',
      });

      expect(permit.status).toBe('requested');

      const approved = await service.approvePermit('t1', 'actor-1', permit.id);
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe('actor-1');
    });
  });

  describe('CAPA Actions', () => {
    it('raises and completes CAPA actions', async () => {
      const incidentStore = new InMemoryHseIncidentStore();
      const ptwStore = new InMemoryPermitToWorkStore();
      const capaStore = new InMemoryCapaActionStore();

      const service = new HseService(incidentStore, ptwStore, capaStore, new InMemoryToolboxTalkStore(), new InMemoryRiskAssessmentStore(), mockEvents, mockTx, mockAccess);

      const capa = await service.raiseCapa({
        tenantId: 't1',
        projectId: 'p1',
        sourceType: 'inspection',
        actionRequired: 'Provide safety barriers at excavation edge',
        dueDate: '2026-06-30',
      });

      expect(capa.status).toBe('pending');
      expect(capa.dueDate).toBe('2026-06-30');

      const completed = await service.completeCapa('t1', null, capa.id);
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).not.toBeNull();
    });
  });
});
