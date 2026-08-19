import { describe, expect, it } from 'vitest';
import { makeWorkflowDefinition, makeWorkflowInstance } from '@aura/shared';
import { buildWorkflowEvidence, classifyDecisionAction, dedupeDecisionAssignments, toDecisionAssignment } from './inbox.service';

describe('universal decision assignment contract', () => {
  it.each([
    ['Review', 'REVIEW'],
    ['Approve', 'APPROVAL'],
    ['Pay', 'APPROVAL'],
    ['Activate', 'SIGN_OFF'],
    ['Certify', 'SIGN_OFF'],
    ['Decide', 'DECISION'],
  ] as const)('classifies %s as %s', (verb, expected) => {
    expect(classifyDecisionAction(verb)).toBe(expected);
  });

  it('keeps access, assignment and authority as separate truths', () => {
    const item = toDecisionAssignment({
      id: 'pr-1',
      module: 'Procurement',
      kind: 'Purchase Request',
      title: 'PR-001',
      detail: 'Project: Tower A',
      action: 'Approve',
      href: '/procurement/purchase-requests?record=pr-1',
      value: 24_500,
      createdAt: '2026-08-17T08:00:00.000Z',
    });

    expect(item).toMatchObject({
      actionRequired: 'APPROVAL',
      state: 'PENDING',
      assignment: 'ACCESSIBLE_NOT_ASSIGNED',
      authority: 'SOURCE_DOMAIN',
      source: 'DERIVED_DOMAIN_STATE',
      dueAt: null,
      record: {
        domain: 'Procurement',
        type: 'Purchase Request',
        id: 'pr-1',
        href: '/procurement/purchase-requests?record=pr-1',
      },
      workflowLookup: 'NOT_CHECKED',
      workflow: null,
    });
  });

  it('links a verified workflow state without claiming personal assignment', () => {
    const item = toDecisionAssignment({
      id: 'po-1', module: 'Procurement', kind: 'Purchase Order', title: 'PO-001', detail: '',
      action: 'Approve', href: '/procurement/purchase-orders/po-1', value: 25_000, createdAt: '2026-08-17T08:00:00.000Z',
    });
    const definition = makeWorkflowDefinition({
      key: 'po.approval', name: 'PO approval', initialState: 'submitted', states: ['submitted', 'approved'],
      terminalStates: ['approved'], transitions: [{ from: 'submitted', to: 'approved', action: 'approve', permission: 'procurement.po.approve' }],
    });
    const instance = makeWorkflowInstance(definition, {
      tenantId: 'tenant-a', companyId: 'company-a', aggregateType: 'procurement.po', aggregateId: 'po-1', createdBy: 'creator',
    });
    const access = { can: () => ({ allowed: true, reason: 'allowed' }) };

    const evidence = buildWorkflowEvidence(item, instance, definition, access, 'approver');
    expect(evidence).toMatchObject({
      currentState: 'submitted', linkage: 'VERIFIED_TYPE_AND_ID', historyCount: 0,
      availableDecisions: [{ action: 'approve', eligible: true, authorityCheck: 'PERMISSION_AND_AMOUNT' }],
    });
    expect(item.assignment).toBe('ACCESSIBLE_NOT_ASSIGNED');
  });

  it('does not invent eligibility when the authenticated actor is unavailable', () => {
    const item = toDecisionAssignment({
      id: 'po-1', module: 'Procurement', kind: 'Purchase Order', title: 'PO-001', detail: '',
      action: 'Approve', href: '/procurement/purchase-orders/po-1', value: null, createdAt: null,
    });
    const definition = makeWorkflowDefinition({
      key: 'po.approval', name: 'PO approval', initialState: 'submitted', states: ['submitted', 'approved'],
      transitions: [{ from: 'submitted', to: 'approved', action: 'approve', permission: 'procurement.po.approve' }],
    });
    const instance = makeWorkflowInstance(definition, {
      tenantId: 'tenant-a', companyId: null, aggregateType: 'procurement.po', aggregateId: 'po-1',
    });
    const access = { can: () => { throw new Error('must not be called'); } };
    expect(buildWorkflowEvidence(item, instance, definition, access, null).availableDecisions[0]).toMatchObject({
      eligible: null, authorityCheck: 'ACTOR_NOT_VERIFIED',
    });
  });

  it('deduplicates only repeated projections of the exact same source record', () => {
    const po = toDecisionAssignment({
      id: 'po-1', module: 'Procurement', kind: 'Purchase Order', title: 'PO-001', detail: '',
      action: 'Approve', href: '/procurement/purchase-orders/po-1', value: 1000, createdAt: null,
    });
    const anotherPo = toDecisionAssignment({ ...po, id: 'po-2', title: 'PO-001' });
    expect(dedupeDecisionAssignments([po, po, anotherPo]).map((item) => item.id)).toEqual(['po-1', 'po-2']);
  });
});
