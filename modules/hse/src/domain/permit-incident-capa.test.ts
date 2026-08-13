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

// Coverage for the HSE verticals the QA volume flags as untested: permit-to-work
// lifecycle, incident report→close, and CAPA raise→complete — including the events
// each transition must append (they drive notifications + the command center feed).

const mockTx: TxRunner = { run: (fn) => fn(null) };

function build(): { svc: HseService; emitted: Array<{ type: string; payload: Record<string, unknown> }> } {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const events = {
    appendWithClient: async (_h: unknown, evts: Array<{ type: string; payload: Record<string, unknown> }>) => {
      emitted.push(...evts);
      return evts;
    },
  } as unknown as EventStore;
  const svc = new HseService(
    new InMemoryHseIncidentStore(),
    new InMemoryPermitToWorkStore(),
    new InMemoryCapaActionStore(),
    new InMemoryToolboxTalkStore(),
    new InMemoryRiskAssessmentStore(),
    new InMemorySafetyTrainingStore(),
    events,
    mockTx,
    new AccessService(),
  );
  return { svc, emitted };
}

/** An approved risk assessment + an open validity window — the preconditions for approving a permit. */
async function seedApprovedRa(svc: HseService, tenantId = 't1'): Promise<string> {
  const ra = await svc.createRiskAssessment({
    tenantId, projectId: 'p1', reference: 'RA-100', activity: 'Hot work',
    hazards: [{ hazard: 'Fire', likelihood: 3, severity: 4, controls: 'Fire watch', residualLikelihood: 1, residualSeverity: 2 }],
  });
  await svc.approveRiskAssessment(tenantId, ra.id);
  return ra.id;
}

const OPEN_WINDOW = {
  validFrom: new Date(Date.now() - 3600_000).toISOString(),
  validTo: new Date(Date.now() + 3600_000).toISOString(),
};

describe('Permit to Work lifecycle', () => {
  it('requests then approves a permit, emitting hse.ptw.issued with the permit window', async () => {
    const { svc, emitted } = build();
    const riskAssessmentId = await seedApprovedRa(svc);
    const permit = await svc.requestPermit({
      tenantId: 't1',
      projectId: 'p1',
      permitType: 'hot_work',
      ...OPEN_WINDOW,
      description: '  Welding on level 3  ',
      riskAssessmentId,
    });
    expect(permit.status).toBe('requested');
    expect(permit.description).toBe('Welding on level 3'); // trimmed by the factory
    expect(permit.approvedBy).toBeNull();

    const approved = await svc.approvePermit('t1', null, permit.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).not.toBeNull();

    expect(emitted.map((e) => e.type)).toContain('hse.ptw.issued');
    const issued = emitted.find((e) => e.type === 'hse.ptw.issued')!;
    expect(issued.payload).toMatchObject({ permitType: 'hot_work', projectId: 'p1' });
  });

  it('is tenant-isolated: another tenant cannot see or approve the permit', async () => {
    const { svc } = build();
    const permit = await svc.requestPermit({
      tenantId: 't1', projectId: 'p1', permitType: 'excavation',
      validFrom: '2026-07-11', validTo: '2026-07-12', description: 'Trenching',
    });
    expect(await svc.listPermits('t2')).toHaveLength(0);
    await expect(svc.approvePermit('t2', null, permit.id)).rejects.toThrow(/not found/);
  });
});

describe('Incident report → close', () => {
  it('reports an incident (emits hse.incident.reported) and closes it', async () => {
    const { svc, emitted } = build();
    const incident = await svc.reportIncident({
      tenantId: 't1', projectId: 'p1', severity: 'major',
      date: '2026-07-09', locationDetail: 'Basement B2', description: 'Slip on wet ramp',
    });
    expect(incident.status).not.toBe('closed');
    expect(emitted.map((e) => e.type)).toContain('hse.incident.reported');

    await svc.investigateIncident('t1', null, incident.id);
    const closed = await svc.closeIncident('t1', null, incident.id, 'Ramp not cordoned during washdown');
    expect(closed.status).toBe('closed');
    expect(closed.rootCause).toBe('Ramp not cordoned during washdown');
    await expect(svc.closeIncident('t1', null, 'missing', 'x')).rejects.toThrow(/not found/);
  });
});

describe('CAPA raise → complete', () => {
  it('raises a CAPA against an incident (emits hse.capa.raised) and completes it', async () => {
    const { svc, emitted } = build();
    const capa = await svc.raiseCapa({
      tenantId: 't1', projectId: 'p1', sourceType: 'incident', sourceId: 'inc-1',
      actionRequired: '  Install anti-slip strips  ', dueDate: '2026-07-20',
    });
    expect(capa.status).toBe('pending');
    expect(capa.actionRequired).toBe('Install anti-slip strips');
    expect(capa.completedAt).toBeNull();
    expect(emitted.find((e) => e.type === 'hse.capa.raised')?.payload).toMatchObject({
      sourceType: 'incident',
      sourceId: 'inc-1',
    });

    const done = await svc.completeCapa('t1', null, capa.id);
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
  });
});
