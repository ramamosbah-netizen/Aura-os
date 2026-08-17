import { NotFoundException } from '@nestjs/common';
import { PERMISSIONS_KEY, type TenantContext, type WorkflowService } from '@aura/core';
import type { WorkflowInstance } from '@aura/shared';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowController } from './workflow.controller';

const scopedInstance = (overrides: Partial<WorkflowInstance> = {}): WorkflowInstance => ({
  id: 'wf-1',
  definitionKey: 'po.approval',
  tenantId: 'tenant-a',
  companyId: 'company-a',
  aggregateType: 'procurement.po',
  aggregateId: 'po-1',
  currentState: 'pending',
  status: 'open',
  history: [],
  createdBy: 'actor-a',
  createdAt: '2026-08-17T08:00:00.000Z',
  updatedAt: '2026-08-17T08:00:00.000Z',
  ...overrides,
});

function setup(instance: WorkflowInstance | null = scopedInstance()) {
  const workflow = {
    start: vi.fn().mockResolvedValue(instance),
    transition: vi.fn().mockResolvedValue(instance),
    listInstances: vi.fn().mockResolvedValue(instance ? [instance] : []),
    getInstance: vi.fn().mockResolvedValue(instance),
  } as unknown as WorkflowService;
  const tenant = {
    get: () => ({ tenantId: 'tenant-a', companyId: 'company-a', actorId: 'actor-a' }),
  } as unknown as TenantContext;
  return { controller: new WorkflowController(workflow, tenant), workflow };
}

describe('WorkflowController request identity and scope', () => {
  it('reserves direct engine endpoints for workflow administrators', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkflowController)).toEqual(['admin.workflows.manage']);
  });
  it('stamps a new instance from request context and ignores spoofed identity fields', async () => {
    const { controller, workflow } = setup();
    await controller.start('po.approval', {
      aggregateType: 'procurement.po', aggregateId: 'po-1', companyId: 'company-b', userId: 'attacker',
    });

    expect(workflow.start).toHaveBeenCalledWith('po.approval', {
      tenantId: 'tenant-a', companyId: 'company-a', aggregateType: 'procurement.po', aggregateId: 'po-1', createdBy: 'actor-a',
    });
  });

  it('always scopes list queries to the request tenant and company', async () => {
    const { controller, workflow } = setup();
    await controller.list('po.approval', 'open');
    expect(workflow.listInstances).toHaveBeenCalledWith({
      tenantId: 'tenant-a', companyId: 'company-a', definitionKey: 'po.approval', status: 'open', limit: 100,
    });
  });

  it.each([
    ['another tenant', { tenantId: 'tenant-b' }],
    ['another company', { companyId: 'company-b' }],
  ])('conceals an instance belonging to %s', async (_label, overrides) => {
    const { controller } = setup(scopedInstance(overrides));
    await expect(controller.get('wf-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not transition an out-of-scope instance', async () => {
    const { controller, workflow } = setup(scopedInstance({ tenantId: 'tenant-b' }));
    await expect(controller.transition('wf-1', { action: 'approve' })).rejects.toBeInstanceOf(NotFoundException);
    expect(workflow.transition).not.toHaveBeenCalled();
  });

  it('uses the authenticated actor for a scoped transition and ignores spoofed userId', async () => {
    const { controller, workflow } = setup();
    await controller.transition('wf-1', { action: 'approve', userId: 'attacker', note: 'Reviewed', amount: 25_000 });
    expect(workflow.transition).toHaveBeenCalledWith('wf-1', 'approve', 'actor-a', { note: 'Reviewed', amount: 25_000 });
  });
});
