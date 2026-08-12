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
  InMemorySafetyTrainingStore,
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

      const service = new HseService(incidentStore, ptwStore, capaStore, new InMemoryToolboxTalkStore(), new InMemoryRiskAssessmentStore(), new InMemorySafetyTrainingStore(), mockEvents, mockTx, mockAccess);

      const inc = await service.reportIncident({
        tenantId: 't1',
        projectId: 'p1',
        date: '2026-06-27',
        severity: 'minor',
        description: 'First aid kit used for minor cut',
        locationDetail: 'Substation room',
      });

      expect(inc.status).toBe('reported');

      // An incident walks its investigation lifecycle; it cannot jump straight to closed.
      await service.investigateIncident('t1', null, inc.id);
      const closed = await service.closeIncident('t1', null, inc.id, 'Unguarded sharp edge on cable tray');
      expect(closed.status).toBe('closed');
      expect(closed.rootCause).toBe('Unguarded sharp edge on cable tray');
    });
  });

  describe('Permits to Work (PTW)', () => {
    it('requests and approves permits', async () => {
      const incidentStore = new InMemoryHseIncidentStore();
      const ptwStore = new InMemoryPermitToWorkStore();
      const capaStore = new InMemoryCapaActionStore();

      const service = new HseService(incidentStore, ptwStore, capaStore, new InMemoryToolboxTalkStore(), new InMemoryRiskAssessmentStore(), new InMemorySafetyTrainingStore(), mockEvents, mockTx, mockAccess);

      // A permit may only be approved against an APPROVED risk assessment.
      const ra = await service.createRiskAssessment({
        tenantId: 't1',
        projectId: 'p1',
        reference: 'RA-001',
        activity: 'Hot work on riser',
        hazards: [{ hazard: 'Fire', likelihood: 3, severity: 4, controls: 'Fire watch', residualLikelihood: 1, residualSeverity: 3 }],
      });
      await service.approveRiskAssessment('t1', ra.id);

      const permit = await service.requestPermit({
        tenantId: 't1',
        projectId: 'p1',
        permitType: 'hot_work',
        validFrom: new Date(Date.now() - 3600_000).toISOString(),
        validTo: new Date(Date.now() + 86400000).toISOString(),
        description: 'Welding on main line riser',
        riskAssessmentId: ra.id,
        createdBy: 'requester-1',
      });

      expect(permit.status).toBe('requested');

      // Segregation of duties: approved by someone other than the requester.
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

      const service = new HseService(incidentStore, ptwStore, capaStore, new InMemoryToolboxTalkStore(), new InMemoryRiskAssessmentStore(), new InMemorySafetyTrainingStore(), mockEvents, mockTx, mockAccess);

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

  describe('Safety Training Matrix', () => {
    it('records safety training records and marks expired status correctly', async () => {
      const incidentStore = new InMemoryHseIncidentStore();
      const ptwStore = new InMemoryPermitToWorkStore();
      const capaStore = new InMemoryCapaActionStore();
      const trainingStore = new InMemorySafetyTrainingStore();

      const service = new HseService(
        incidentStore,
        ptwStore,
        capaStore,
        new InMemoryToolboxTalkStore(),
        new InMemoryRiskAssessmentStore(),
        trainingStore,
        mockEvents,
        mockTx,
        mockAccess,
      );

      const r1 = await service.recordSafetyTraining({
        tenantId: 't1',
        workerName: 'Ahmed Khan',
        workerId: 'E-AHMED-101',
        inductionDate: '2026-06-01',
        cardExpiry: '2027-06-01',
        certifications: ['Work at Height', 'Confined Space'],
      });

      expect(r1.status).toBe('valid');
      expect(r1.certifications).toContain('Work at Height');

      // expired card scenario
      const r2 = await service.recordSafetyTraining({
        tenantId: 't1',
        workerName: 'John Doe',
        workerId: 'E-JOHN-102',
        inductionDate: '2025-01-01',
        cardExpiry: '2025-06-01', // expired already
      });

      expect(r2.status).toBe('expired');

      const all = await service.listSafetyTraining('t1');
      expect(all.length).toBe(2);

      const forAhmed = await service.getSafetyTrainingForWorker('t1', 'E-AHMED-101');
      expect(forAhmed.length).toBe(1);
      expect(forAhmed[0].workerName).toBe('Ahmed Khan');
    });
  });
});
