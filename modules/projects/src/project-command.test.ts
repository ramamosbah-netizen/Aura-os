import { describe, it, expect, vi } from 'vitest';
import {
  CommandBus,
  IdempotencyService,
  LockService,
  NullTxRunner,
  type EventStore,
  type AccessService,
} from '@aura/core';
import { ProjectService } from './project.service';
import { InMemoryProjectStore } from './in-memory-project-store';
import { hashHandoverSnapshot } from './domain/handover';
import { makeProject } from './domain/project';

/** Projects create dispatched through a REAL kernel CommandBus pipeline. */
function buildService() {
  const store = new InMemoryProjectStore();
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  // The lifecycle gates read facts through ports. These harnesses supply a CLEARED project, so the
  // tests below exercise the event and command paths they were written for rather than the gate —
  // which has its own tests. Omitting them would make every one of these assert the refusal instead,
  // which is a real behaviour but not the one they are about.
  const service = new ProjectService(
    store, events, new NullTxRunner(), bus, null, null,
    { readProjectCommissioningReadiness: async () => ({ systems: 1, commissioned: 1 }) },
    { assess: async () => ({ ready: true }) },
  );
  service.onModuleInit();
  return { service, store, events };
}

describe('Projects create via CommandBus', () => {
  it('persists the project and emits its event through the pipeline', async () => {
    const { service, store, events } = buildService();
    const project = await service.create({ tenantId: 't1', title: 'Tower A', createdBy: 'u1' });
    expect(project.title).toBe('Tower A');
    expect(await store.get(project.id)).not.toBeNull();
    expect(events.appendWithClient).toHaveBeenCalledOnce();
  });

  it('runs the validation stage (rejects an empty title)', async () => {
    const { service } = buildService();
    await expect(
      service.create({ tenantId: 't1', title: '  ' } as unknown as Parameters<typeof service.create>[0]),
    ).rejects.toThrow('project title is required');
  });

  it('refuses to create a project already in execution', async () => {
    // Creation was the ungoverned writer of `status`. Until this refusal existed, the activation
    // gate could be walked around by claiming the project had always been active.
    const { service } = buildService();
    await expect(service.create({ tenantId: 't1', title: 'Straight to site', status: 'active' }))
      .rejects.toThrow('a project cannot be created in active');
  });

  it('refuses to create a project already finished or cancelled', async () => {
    const { service } = buildService();
    for (const status of ['completed', 'cancelled'] as const) {
      await expect(service.create({ tenantId: 't1', title: `Born ${status}`, status }))
        .rejects.toThrow(`a project cannot be created in ${status}`);
    }
  });

  it('still allows the two states a project may legitimately start in', async () => {
    const { service } = buildService();
    for (const status of ['planned', 'planning'] as const) {
      expect((await service.create({ tenantId: 't1', title: `Starts ${status}`, status })).status).toBe(status);
    }
  });

  it('blocks generic status updates so completion uses the governed command', async () => {
    const { service } = buildService();
    const project = await service.create({ tenantId: 't1', title: 'Lifecycle proof', contractId: 'contract-1' });

    await expect(service.update(project.id, { status: 'completed' })).rejects.toThrow('governed status command');
  });

  it('preserves the governed completion event path', async () => {
    const { service, store, events } = buildService();
    // Placed in `active` through the store rather than created there: creation may only start a
    // project before execution now. This test is about the event completion emits, not about how
    // the project reached execution — that has its own gate and its own tests.
    const project = makeProject({ tenantId: 't1', title: 'Lifecycle proof', status: 'active', contractId: 'contract-1' });
    await store.create(project);

    const updated = await service.changeStatus(project.id, 'completed');
    expect(updated.status).toBe('completed');
    const appendCalls = (events.append as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastEvent = appendCalls.at(-1)?.[0] as Array<{ type?: string }>;
    expect(lastEvent?.[0]?.type).toBe('projects.project.completed');
  });

  it('rejects original contract value changes after an immutable handover', async () => {
    const { service } = buildService();
    const handoverSnapshot = {
      schemaVersion: 1,
      handoverId: 'handover-1',
      contractId: 'contract-1',
      tenantId: 't1',
      sourceKind: 'DIRECT',
      sourceOpportunityId: null,
      sourceTenderId: null,
      commercialScopeRevisionId: null,
      boqRevisionId: null,
      estimateRevisionId: null,
      acceptedQuotationId: null,
      acceptedQuotationRevisionId: null,
      commercialBaselineId: null,
      originalContractValue: 1_000,
      currency: 'AED',
      awardAcceptanceType: 'quotation_acceptance',
      awardAcceptanceEvidence: null,
      frozenCommercialBaseline: null,
      capturedAt: '2026-08-31T10:00:00.000Z',
    };
    const project = await service.create({
      tenantId: 't1',
      title: 'Handed over project',
      value: 1_000,
      originalContractValue: 1_000,
      origin: 'commercial_handover',
      contractId: 'contract-1',
      handoverId: 'handover-1',
      handoverSnapshotHash: hashHandoverSnapshot(handoverSnapshot),
      handoverLockedAt: new Date().toISOString(),
      handoverSnapshot,
    });

    await expect(service.update(project.id, { value: 1_100 })).rejects.toThrow('immutable after handover');
  });

  it('requires the versioned frozen source envelope for commercial handovers', async () => {
    const { service } = buildService();
    await expect(service.create({
      tenantId: 't1',
      title: 'Unversioned handover',
      origin: 'commercial_handover',
      contractId: 'contract-1',
      handoverLockedAt: new Date().toISOString(),
      handoverSnapshotHash: 'hash-1',
      handoverSnapshot: { contractId: 'contract-1' },
    })).rejects.toThrow('immutable handover evidence');
  });
});
