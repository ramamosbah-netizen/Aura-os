import { describe, it, expect, vi } from 'vitest';
import { SagaOrchestratorService } from './saga-orchestrator.service';
import { InMemorySagaStore } from './in-memory-saga-store';

describe('SagaOrchestratorService', () => {
  it('should execute saga steps in order and complete successfully', async () => {
    const store = new InMemorySagaStore();
    const service = new SagaOrchestratorService(store);

    const step1Forward = vi.fn().mockResolvedValue({ step1Result: 'ok' });
    const step1Compensate = vi.fn().mockResolvedValue(undefined);
    const step2Forward = vi.fn().mockResolvedValue({ step2Result: 'ok' });
    const step2Compensate = vi.fn().mockResolvedValue(undefined);

    service.register({
      sagaType: 'test.successful_saga',
      steps: [
        { name: 'step1', forward: step1Forward, compensate: step1Compensate },
        { name: 'step2', forward: step2Forward, compensate: step2Compensate },
      ],
    });

    const payload = { data: 'test-payload' };
    const saga = await service.execute('test.successful_saga', {
      tenantId: 'tenant-123',
      companyId: 'company-456',
      payload,
    });

    expect(saga.status).toBe('completed');
    expect(step1Forward).toHaveBeenCalledWith(payload, expect.any(Object));
    expect(step2Forward).toHaveBeenCalledWith(payload, expect.any(Object));
    expect(step1Compensate).not.toHaveBeenCalled();
    expect(step2Compensate).not.toHaveBeenCalled();

    const state = await service.getSagaState(saga.id);
    expect(state.saga?.status).toBe('completed');
    expect(state.steps.length).toBe(2);
    expect(state.steps[0].status).toBe('completed');
    expect(state.steps[1].status).toBe('completed');
  });

  it('should fail and compensate completed steps in reverse order on error', async () => {
    const store = new InMemorySagaStore();
    const spyCreate = vi.spyOn(store, 'createSaga');
    const service = new SagaOrchestratorService(store);

    const step1Forward = vi.fn().mockResolvedValue({ step1Result: 'ok' });
    const step1Compensate = vi.fn().mockResolvedValue(undefined);
    const step2Forward = vi.fn().mockRejectedValue(new Error('Step 2 failed'));
    const step2Compensate = vi.fn().mockResolvedValue(undefined);

    service.register({
      sagaType: 'test.failed_saga',
      steps: [
        { name: 'step1', forward: step1Forward, compensate: step1Compensate },
        { name: 'step2', forward: step2Forward, compensate: step2Compensate },
      ],
    });

    const payload = { data: 'error-payload' };
    
    await expect(
      service.execute('test.failed_saga', {
        tenantId: 'tenant-123',
        payload,
      })
    ).rejects.toThrow('Step 2 failed');

    expect(step1Forward).toHaveBeenCalled();
    expect(step2Forward).toHaveBeenCalled();
    expect(step1Compensate).toHaveBeenCalledWith(payload, expect.objectContaining({
      stepResult: { step1Result: 'ok' },
    }));
    expect(step2Compensate).not.toHaveBeenCalled(); // Step 2 failed, so it shouldn't compensate itself

    // Verify step statuses in store
    const sagaId = spyCreate.mock.calls[0][0].id;
    const list = await store.getSagaSteps(sagaId);
    const failedStep = list.find((s) => s.stepName === 'step2');
    const compensatedStep = list.find((s) => s.stepName === 'step1');

    expect(failedStep?.status).toBe('failed');
    expect(compensatedStep?.status).toBe('compensated');
  });
});
