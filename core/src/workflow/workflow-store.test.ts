import { describe, expect, it } from 'vitest';
import { makeWorkflowDefinition, makeWorkflowInstance } from '@aura/shared';
import { InMemoryWorkflowStore } from './in-memory-workflow-store';

describe('WorkflowStore company scope', () => {
  it('uses exact tenant and company matching, including tenant-global null', async () => {
    const store = new InMemoryWorkflowStore();
    const definition = makeWorkflowDefinition({
      key: 'approval', name: 'Approval', initialState: 'open', states: ['open', 'done'],
      transitions: [{ from: 'open', to: 'done', action: 'approve' }],
    });
    const companyA = makeWorkflowInstance(definition, {
      tenantId: 'tenant-a', companyId: 'company-a', aggregateType: 'record', aggregateId: 'a',
    });
    const companyB = makeWorkflowInstance(definition, {
      tenantId: 'tenant-a', companyId: 'company-b', aggregateType: 'record', aggregateId: 'b',
    });
    const tenantGlobal = makeWorkflowInstance(definition, {
      tenantId: 'tenant-a', companyId: null, aggregateType: 'record', aggregateId: 'global',
    });
    const anotherTenant = makeWorkflowInstance(definition, {
      tenantId: 'tenant-b', companyId: 'company-a', aggregateType: 'record', aggregateId: 'other',
    });
    for (const instance of [companyA, companyB, tenantGlobal, anotherTenant]) await store.createInstance(instance);

    await expect(store.listInstances({ tenantId: 'tenant-a', companyId: 'company-a' }))
      .resolves.toEqual([companyA]);
    await expect(store.listInstances({ tenantId: 'tenant-a', companyId: null }))
      .resolves.toEqual([tenantGlobal]);
  });
});
