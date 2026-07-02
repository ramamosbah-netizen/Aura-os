import { describe, it, expect } from 'vitest';
import { makeRiskAssessment, approveRiskAssessment, riskBand } from './risk-assessment';
import { makeSafetyTrainingRecord } from './safety-training';
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

// Coverage for the two depth verticals the gap report called thin: risk
// assessments (JSA scoring/banding) and the safety-training matrix.

const mockEvents = { appendWithClient: async () => [] } as unknown as EventStore;
const mockTx: TxRunner = { run: (fn) => fn(null) };

function buildService(): HseService {
  return new HseService(
    new InMemoryHseIncidentStore(),
    new InMemoryPermitToWorkStore(),
    new InMemoryCapaActionStore(),
    new InMemoryToolboxTalkStore(),
    new InMemoryRiskAssessmentStore(),
    new InMemorySafetyTrainingStore(),
    mockEvents,
    mockTx,
    new AccessService(),
  );
}

describe('Risk assessment (JSA) domain', () => {
  it('bands scores 1–25 into low/medium/high/critical', () => {
    expect(riskBand(1)).toBe('low');
    expect(riskBand(4)).toBe('medium');
    expect(riskBand(8)).toBe('high');
    expect(riskBand(15)).toBe('critical');
    expect(riskBand(25)).toBe('critical');
  });

  it('scores the assessment from the worst hazard and clamps inputs to 1–5', () => {
    const ra = makeRiskAssessment({
      tenantId: 't1',
      projectId: 'p1',
      reference: 'RA-001',
      activity: 'Hot works on level 3',
      hazards: [
        { hazard: 'Fire', likelihood: 4, severity: 5, controls: 'Fire watch + extinguishers', residualLikelihood: 1, residualSeverity: 5 },
        { hazard: 'Fumes', likelihood: 9, severity: 2, controls: 'Ventilation', residualLikelihood: 1, residualSeverity: 2 },
      ],
    });
    expect(ra.initialScore).toBe(20); // fire 4×5; fumes likelihood clamped to 5 → 10
    expect(ra.residualScore).toBe(5);
    expect(ra.residualBand).toBe('medium');
    expect(ra.status).toBe('draft');

    const approved = approveRiskAssessment(ra);
    expect(approved.status).toBe('approved');
  });
});

describe('Safety training matrix', () => {
  it('marks a record expired when the card lapsed and validates dates', () => {
    const expired = makeSafetyTrainingRecord({
      tenantId: 't1', workerName: 'Ali H', workerId: 'W-1',
      inductionDate: '2024-01-05', cardExpiry: '2024-12-31',
      certifications: ['Work at Height'],
    });
    expect(expired.status).toBe('expired');

    expect(() =>
      makeSafetyTrainingRecord({ tenantId: 't1', workerName: 'X', workerId: 'W', inductionDate: 'not-a-date' }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it('records + lists trainings and approves risk assessments via the service', async () => {
    const svc = buildService();
    await svc.recordSafetyTraining({
      tenantId: 't1', workerName: 'Sara K', workerId: 'W-2',
      inductionDate: '2026-01-10', cardExpiry: '2027-01-10',
      certifications: ['First Aid', 'Confined Space'],
    });
    const records = await svc.listSafetyTraining('t1');
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('valid');
    expect(records[0].certifications).toContain('Confined Space');

    const ra = await svc.createRiskAssessment({
      tenantId: 't1', projectId: 'p1', reference: 'RA-9', activity: 'Excavation',
      hazards: [{ hazard: 'Collapse', likelihood: 3, severity: 5, controls: 'Shoring', residualLikelihood: 1, residualSeverity: 5 }],
    });
    const approved = await svc.approveRiskAssessment('t1', ra.id);
    expect(approved.status).toBe('approved');
  });
});
