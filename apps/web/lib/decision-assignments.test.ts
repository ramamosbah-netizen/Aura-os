import { describe, expect, it } from 'vitest';
import { composeDecisionQueue, normalizeApiDecision, normalizeSharedDocument } from './decision-assignments';

describe('Approvals & Reviews projection', () => {
  it('keeps the source record as the navigation owner', () => {
    const item = normalizeApiDecision({
      id: 'mir-45', module: 'Quality', kind: 'Material Approval', title: 'MIR-0045', detail: 'Tower A',
      action: 'Review', href: '/quality/material-approvals?record=mir-45', value: null, createdAt: null,
    });
    expect(item.actionRequired).toBe('REVIEW');
    expect(item.href).toBe('/quality/material-approvals?record=mir-45');
    expect(item.isFormalAssignment).toBe(true);
  });

  it('does not pretend a DMS permission is a pending workflow assignment', () => {
    const item = normalizeSharedDocument({
      document: { id: 'doc-1', title: 'Datasheet', kind: 'datasheet', aggregateType: 'crm.quotation', aggregateId: 'q-1', currentVersion: 2 },
      permissions: [{ permission: 'APPROVE' }, { permission: 'DOWNLOAD' }],
      currentVersionFile: { version: 2, fileName: 'datasheet.pdf', contentType: 'application/pdf', sizeBytes: 1200 },
    });
    expect(item).toMatchObject({
      state: 'AVAILABLE', isFormalAssignment: false, source: 'DMS_PERMISSION',
      href: '/documents/doc-1/pdf?version=2', tabKey: 'document-pdf:doc-1',
    });
  });

  it('does not turn APPROVE permission into PDF byte access', () => {
    const item = normalizeSharedDocument({
      document: { id: 'doc-2', title: 'Restricted PDF', kind: 'drawing', aggregateType: 'engineering.drawing', aggregateId: 'dwg-1', currentVersion: 1 },
      permissions: [{ permission: 'APPROVE' }],
      currentVersionFile: { version: 1, fileName: 'drawing.pdf', contentType: 'application/pdf', sizeBytes: 500 },
    });
    expect(item?.href).toBe('/documents?record=doc-2');
    expect(item?.tabKey).toBeUndefined();
  });

  it('creates no duplicate Task or My Day record', () => {
    const queue = composeDecisionQueue([{
      id: 'pr-1', module: 'Procurement', kind: 'Purchase Request', title: 'PR-001', detail: '',
      action: 'Approve', href: '/procurement/purchase-requests?record=pr-1', value: 1000, createdAt: null,
    }], []);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.key).toBe('domain:Procurement:Purchase Request:pr-1');
  });

  it('surfaces exact workflow evidence without claiming personal assignment', () => {
    const item = normalizeApiDecision({
      id: 'po-1', module: 'Procurement', kind: 'Purchase Order', title: 'PO-001', detail: '',
      action: 'Approve', href: '/procurement/purchase-orders/po-1', value: 25_000, createdAt: null,
      workflowLookup: 'VERIFIED_LINK',
      workflow: {
        instanceId: 'wf-1', definitionKey: 'po.approval', definitionName: 'PO approval', aggregateType: 'procurement.po',
        currentState: 'submitted', status: 'open', updatedAt: '2026-08-17T08:00:00.000Z', linkage: 'VERIFIED_TYPE_AND_ID',
        historyCount: 1, latestHistory: { action: 'submit', at: '2026-08-17T08:00:00.000Z' },
        availableDecisions: [{ action: 'approve', to: 'approved', permission: 'procurement.po.approve', eligible: true, authorityCheck: 'PERMISSION_AND_AMOUNT' }],
      },
    });
    expect(item.workflowLabel).toContain('permission + amount verified');
    expect(item.assignmentLabel).toContain('personal assignment not verified');
  });
});
