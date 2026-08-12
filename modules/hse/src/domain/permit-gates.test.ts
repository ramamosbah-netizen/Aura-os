import { describe, it, expect } from 'vitest';
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
import {
  PERMIT_TRANSITIONS,
  canTransitionPermit,
  isWithinValidity,
  type PermitToWork,
} from './permit-to-work';
import { INCIDENT_TRANSITIONS, canTransitionIncident } from './hse-incident';

// G-08 residue: HSE was the last delivery-half module still at CRUD, and it is the one where CRUD
// is a safety problem. These cover the gates that make it a permit SYSTEM — the refusals — rather
// than the happy paths, which permit-incident-capa.test.ts already walks.

const mockTx: TxRunner = { run: (fn) => fn(null) };

// These tests exercise the workflow gates, not the access seam — let every permission through so
// a failure here always means a gate behaved wrongly.
const permissiveAccess = { assert: () => {} } as unknown as AccessService;

function build(): HseService {
  const events = { appendWithClient: async (_h: unknown, e: unknown[]) => e } as unknown as EventStore;
  return new HseService(
    new InMemoryHseIncidentStore(),
    new InMemoryPermitToWorkStore(),
    new InMemoryCapaActionStore(),
    new InMemoryToolboxTalkStore(),
    new InMemoryRiskAssessmentStore(),
    new InMemorySafetyTrainingStore(),
    events,
    mockTx,
    permissiveAccess,
  );
}

const openWindow = () => ({
  validFrom: new Date(Date.now() - 3600_000).toISOString(),
  validTo: new Date(Date.now() + 3600_000).toISOString(),
});

async function approvedRa(svc: HseService, tenantId = 't1'): Promise<string> {
  const ra = await svc.createRiskAssessment({
    tenantId, projectId: 'p1', reference: 'RA-1', activity: 'Hot work',
    hazards: [{ hazard: 'Fire', likelihood: 4, severity: 4, controls: 'Fire watch', residualLikelihood: 2, residualSeverity: 2 }],
  });
  await svc.approveRiskAssessment(tenantId, ra.id);
  return ra.id;
}

const requestPermit = (svc: HseService, over: Partial<Parameters<HseService['requestPermit']>[0]> = {}) =>
  svc.requestPermit({
    tenantId: 't1', projectId: 'p1', permitType: 'hot_work',
    ...openWindow(), description: 'Welding', ...over,
  });

describe('permit state machine', () => {
  it('closed and expired are terminal — a permit is never re-opened, a new one is raised', () => {
    expect(PERMIT_TRANSITIONS.closed).toEqual([]);
    expect(PERMIT_TRANSITIONS.expired).toEqual([]);
    expect(canTransitionPermit('closed', 'approved')).toBe(false);
    expect(canTransitionPermit('expired', 'approved')).toBe(false);
  });

  it('refuses the jump straight from requested to closed', () => {
    expect(canTransitionPermit('requested', 'closed')).toBe(false);
    expect(canTransitionPermit('approved', 'closed')).toBe(true);
  });

  it('scopes validity to the authorised window', () => {
    const p = { validFrom: '2026-01-01T00:00:00Z', validTo: '2026-01-02T00:00:00Z' } as PermitToWork;
    expect(isWithinValidity(p, new Date('2026-01-01T12:00:00Z'))).toBe(true);
    expect(isWithinValidity(p, new Date('2026-01-03T00:00:00Z'))).toBe(false);
    expect(isWithinValidity(p, new Date('2025-12-31T23:59:00Z'))).toBe(false);
  });
});

describe('permit approval gates', () => {
  it('refuses a permit that cites no risk assessment', async () => {
    const svc = build();
    const permit = await requestPermit(svc);
    await expect(svc.approvePermit('t1', 'approver', permit.id)).rejects.toThrow(/cites a risk assessment/);
  });

  it('refuses a permit whose risk assessment is still draft', async () => {
    const svc = build();
    const ra = await svc.createRiskAssessment({
      tenantId: 't1', projectId: 'p1', reference: 'RA-draft', activity: 'Hot work',
      hazards: [{ hazard: 'Fire', likelihood: 3, severity: 3, controls: 'x', residualLikelihood: 1, residualSeverity: 1 }],
    });
    const permit = await requestPermit(svc, { riskAssessmentId: ra.id });
    await expect(svc.approvePermit('t1', 'approver', permit.id)).rejects.toThrow(/risk assessment is approved/);
  });

  it('refuses self-authorisation — the requester cannot approve their own permit', async () => {
    const svc = build();
    const riskAssessmentId = await approvedRa(svc);
    const permit = await requestPermit(svc, { riskAssessmentId, createdBy: 'sam' });
    expect(permit.requestedBy).toBe('sam');

    await expect(svc.approvePermit('t1', 'sam', permit.id)).rejects.toThrow(/other than the requester/);

    // Anyone else, with the same permit and the same evidence, may authorise it.
    const approved = await svc.approvePermit('t1', 'alex', permit.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('alex');
  });

  it('refuses a permit outside its validity window', async () => {
    const svc = build();
    const riskAssessmentId = await approvedRa(svc);
    const permit = await requestPermit(svc, {
      riskAssessmentId,
      validFrom: '2026-01-01T00:00:00Z',
      validTo: '2026-01-02T00:00:00Z', // long past
    });
    await expect(svc.approvePermit('t1', 'approver', permit.id)).rejects.toThrow(/validity window/);
  });

  it('approves when every gate is satisfied, and refuses a second approval', async () => {
    const svc = build();
    const riskAssessmentId = await approvedRa(svc);
    const permit = await requestPermit(svc, { riskAssessmentId });

    const approved = await svc.approvePermit('t1', 'approver', permit.id);
    expect(approved.status).toBe('approved');

    // approved is not in PERMIT_TRANSITIONS.approved, so a repeat is a conflict.
    await expect(svc.approvePermit('t1', 'approver', permit.id)).rejects.toThrow(/can only advance/);
  });

  it('rejects with a mandatory reason, then re-opens to draft for correction', async () => {
    const svc = build();
    const riskAssessmentId = await approvedRa(svc);
    const permit = await requestPermit(svc, { riskAssessmentId });

    await expect(svc.rejectPermit('t1', 'approver', permit.id, '  ')).rejects.toThrow(/reason is required/);

    const rejected = await svc.rejectPermit('t1', 'approver', permit.id, 'Fire watch not staffed');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toBe('Fire watch not staffed');

    const reopened = await svc.reopenPermit('t1', 'requester', permit.id);
    expect(reopened.status).toBe('draft');
    expect(reopened.rejectionReason).toBeNull();
  });
});

describe('incident investigation lifecycle', () => {
  const report = (svc: HseService) =>
    svc.reportIncident({
      tenantId: 't1', projectId: 'p1', date: '2026-08-01', severity: 'major',
      description: 'Slip on wet ramp', locationDetail: 'B2',
    });

  it('refuses closing an incident that was never investigated', async () => {
    const svc = build();
    const inc = await report(svc);
    await expect(svc.closeIncident('t1', null, inc.id, 'cause')).rejects.toThrow(/can only advance/);
  });

  it('requires a root cause to close', async () => {
    const svc = build();
    const inc = await report(svc);
    await svc.investigateIncident('t1', null, inc.id);
    await expect(svc.closeIncident('t1', null, inc.id, '   ')).rejects.toThrow(/root cause is required/);
  });

  it('refuses to close while corrective actions are still open — the CAPA gate', async () => {
    const svc = build();
    const inc = await report(svc);
    await svc.investigateIncident('t1', null, inc.id);

    const capa = await svc.raiseCapa({
      tenantId: 't1', projectId: 'p1', sourceType: 'incident', sourceId: inc.id,
      actionRequired: 'Install anti-slip strips', dueDate: '2026-08-20',
    });

    await expect(svc.closeIncident('t1', null, inc.id, 'Ramp not cordoned')).rejects.toThrow(
      /corrective actions are complete \(1 still open\)/,
    );

    // Completing the action releases the gate.
    await svc.completeCapa('t1', null, capa.id);
    const closed = await svc.closeIncident('t1', null, inc.id, 'Ramp not cordoned');
    expect(closed.status).toBe('closed');
    expect(closed.rootCause).toBe('Ramp not cordoned');
  });

  it('does not let another incident’s open CAPA block this one', async () => {
    const svc = build();
    const a = await report(svc);
    const b = await report(svc);
    await svc.raiseCapa({
      tenantId: 't1', projectId: 'p1', sourceType: 'incident', sourceId: a.id,
      actionRequired: 'Unrelated', dueDate: '2026-08-20',
    });

    await svc.investigateIncident('t1', null, b.id);
    const closed = await svc.closeIncident('t1', null, b.id, 'Independent cause');
    expect(closed.status).toBe('closed');
  });

  it('reopens on new evidence rather than spawning a second record', async () => {
    const svc = build();
    const inc = await report(svc);
    await svc.investigateIncident('t1', null, inc.id);
    await svc.closeIncident('t1', null, inc.id, 'First conclusion');

    const reopened = await svc.reopenIncident('t1', 'investigator', inc.id);
    expect(reopened.status).toBe('investigating');
    expect(reopened.closedAt).toBeNull();
    // The original root cause survives the reopen — it is the audit trail of what was concluded.
    expect(reopened.rootCause).toBe('First conclusion');
  });

  it('closed is reversible for incidents, unlike a permit', () => {
    expect(canTransitionIncident('closed', 'investigating')).toBe(true);
    expect(INCIDENT_TRANSITIONS.reported).toEqual(['investigating']);
  });
});

describe('incident 360', () => {
  it('returns the incident with the corrective actions raised against it', async () => {
    const svc = build();
    const inc = await svc.reportIncident({
      tenantId: 't1', projectId: 'p1', date: '2026-08-01', severity: 'minor',
      description: 'Cut hand', locationDetail: 'Riser',
    });
    await svc.raiseCapa({
      tenantId: 't1', projectId: 'p1', sourceType: 'incident', sourceId: inc.id,
      actionRequired: 'Issue gloves', dueDate: '2026-08-15',
    });

    const detail = await svc.getIncidentDetail('t1', inc.id);
    expect(detail?.incident.id).toBe(inc.id);
    expect(detail?.capaActions).toHaveLength(1);
    expect(detail?.capaActions[0].actionRequired).toBe('Issue gloves');

    expect(await svc.getIncidentDetail('t1', 'missing')).toBeNull();
  });
});
