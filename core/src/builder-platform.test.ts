import { describe, expect, it, beforeEach } from 'vitest';
import { FormRegistryService } from './builder/form-registry.service';
import { EntityRegistryService } from './builder/entity-registry.service';
import { ApprovalMatrixService } from './builder/approval-matrix.service';
import { WorkflowOrchestratorService } from './builder/workflow-orchestrator.service';

describe('Builder Platform — Phase 6', () => {
  // ── Form Registry ────────────────────────────────────────────────────────────
  describe('FormRegistryService', () => {
    let svc: FormRegistryService;
    beforeEach(() => { svc = new FormRegistryService(); });

    it('should register a form definition and retrieve it by key', async () => {
      await svc.register({
        tenantId: 't1',
        formKey: 'purchase-order-form',
        label: 'Purchase Order',
        entityType: 'purchase_order',
        fields: [
          { key: 'supplier', label: 'Supplier Name', type: 'text', required: true },
          { key: 'value', label: 'Order Value (AED)', type: 'number', required: true,
            validation: { min: 1, max: 10_000_000 } },
        ],
        version: 1,
        isActive: true,
      });

      const form = await svc.get('t1', 'purchase-order-form');
      expect(form).not.toBeNull();
      expect(form!.fields).toHaveLength(2);
    });

    it('should validate data and return errors for missing required fields', async () => {
      const form = await svc.register({
        tenantId: 't1', formKey: 'inv-form', label: 'Invoice', entityType: 'invoice',
        fields: [{ key: 'amount', label: 'Amount', type: 'number', required: true, validation: { min: 1 } }],
        version: 1, isActive: true,
      });

      const errors = svc.validate(form, {});
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Amount');
    });

    it('should pass validation for valid data', async () => {
      const form = await svc.register({
        tenantId: 't1', formKey: 'valid-form', label: 'Test', entityType: 'test',
        fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
        version: 1, isActive: true,
      });

      const errors = svc.validate(form, { name: 'ACME Corp' });
      expect(errors).toHaveLength(0);
    });
  });

  // ── Entity Registry ──────────────────────────────────────────────────────────
  describe('EntityRegistryService', () => {
    let svc: EntityRegistryService;
    beforeEach(() => { svc = new EntityRegistryService(); });

    it('should register an entity schema and list by module', async () => {
      await svc.register({
        tenantId: 't1', entityKey: 'invoice', label: 'Invoice', module: 'finance',
        schema: {
          labelField: 'invoiceNumber',
          fields: [
            { key: 'invoiceNumber', label: 'Invoice #', type: 'text', required: true, searchable: true },
            { key: 'amount', label: 'Amount', type: 'number', required: true, searchable: false },
          ],
        },
      });

      const entities = await svc.list('t1', 'finance');
      expect(entities).toHaveLength(1);
      expect(entities[0].entityKey).toBe('invoice');
    });

    it('should return only searchable fields', async () => {
      await svc.register({
        tenantId: 't1', entityKey: 'project', label: 'Project', module: 'projects',
        schema: {
          labelField: 'name',
          fields: [
            { key: 'name', label: 'Name', type: 'text', required: true, searchable: true },
            { key: 'budget', label: 'Budget', type: 'number', required: false, searchable: false },
            { key: 'status', label: 'Status', type: 'text', required: true, searchable: true },
          ],
        },
      });

      const searchable = await svc.getSearchableFields('t1', 'project');
      expect(searchable).toHaveLength(2);
      expect(searchable.map((f) => f.key)).toEqual(['name', 'status']);
    });
  });

  // ── Approval Matrix ──────────────────────────────────────────────────────────
  describe('ApprovalMatrixService', () => {
    let svc: ApprovalMatrixService;
    beforeEach(() => { svc = new ApprovalMatrixService(); });

    it('should route high-value POs to CFO and escalate to CEO', async () => {
      await svc.configure({
        tenantId: 't1',
        entityType: 'purchase_order',
        rules: [
          {
            id: 'r1', label: 'Standard (<50K)', order: 1,
            conditions: [{ field: 'value', operator: 'lt', value: 50_000 }],
            approvers: ['procurement-manager'], minApprovals: 1,
          },
          {
            id: 'r2', label: 'High Value (>=50K)', order: 2,
            conditions: [{ field: 'value', operator: 'gte', value: 50_000 }],
            approvers: ['cfo', 'vp-operations'], minApprovals: 2,
            escalateTo: 'ceo',
          },
        ],
      });

      const standard = await svc.resolve('t1', 'purchase_order', { value: 25_000 });
      expect(standard?.ruleLabel).toBe('Standard (<50K)');
      expect(standard?.approvers).toContain('procurement-manager');

      const highValue = await svc.resolve('t1', 'purchase_order', { value: 250_000 });
      expect(highValue?.ruleLabel).toBe('High Value (>=50K)');
      expect(highValue?.minApprovals).toBe(2);
      expect(highValue?.escalateTo).toBe('ceo');
    });

    it('should return null when no rule matches', async () => {
      await svc.configure({
        tenantId: 't1', entityType: 'invoice',
        rules: [{ id: 'r1', label: 'High', order: 1,
          conditions: [{ field: 'value', operator: 'gt', value: 100_000 }],
          approvers: ['cfo'], minApprovals: 1 }],
      });

      const result = await svc.resolve('t1', 'invoice', { value: 500 });
      expect(result).toBeNull();
    });
  });

  // ── BPMN Workflow Orchestrator ───────────────────────────────────────────────
  describe('WorkflowOrchestratorService', () => {
    let svc: WorkflowOrchestratorService;
    beforeEach(() => { svc = new WorkflowOrchestratorService(); });

    it('should start a workflow and advance through nodes to completion', async () => {
      await svc.define({
        tenantId: 't1',
        workflowKey: 'invoice-approval',
        label: 'Invoice Approval Workflow',
        version: 1,
        nodes: [
          { id: 'start', type: 'start', label: 'Start', transitions: [{ to: 'review' }] },
          { id: 'review', type: 'task', label: 'Finance Review', assignee: 'finance-team',
            transitions: [{ to: 'approve-gate' }] },
          { id: 'approve-gate', type: 'gateway', label: 'Approval Decision',
            transitions: [
              { to: 'approved', condition: 'approved === true', label: 'Approved' },
              { to: 'rejected', condition: 'approved === false', label: 'Rejected' },
            ] },
          { id: 'approved', type: 'end', label: 'Invoice Approved', transitions: [] },
          { id: 'rejected', type: 'end', label: 'Invoice Rejected', transitions: [] },
        ],
      });

      // Start instance
      const instance = await svc.start({
        tenantId: 't1', workflowKey: 'invoice-approval',
        entityId: 'inv-001', entityType: 'invoice',
      });

      // After start, auto-advanced to 'review' task node
      expect(instance.currentNodeId).toBe('review');
      expect(instance.status).toBe('running');

      // Finance team approves
      const approved = await svc.advance(instance.id, { approved: true }, 'finance-manager');
      // Advances through gateway → 'approved' end node
      expect(approved.currentNodeId).toBe('approved');
      expect(approved.status).toBe('completed');
      expect(approved.history.length).toBeGreaterThanOrEqual(3);
    });

    it('should follow the rejection branch on negative gateway condition', async () => {
      await svc.define({
        tenantId: 't1', workflowKey: 'po-approval', label: 'PO Approval', version: 1,
        nodes: [
          { id: 'start', type: 'start', label: 'Start', transitions: [{ to: 'review' }] },
          { id: 'review', type: 'task', label: 'Review', assignee: 'manager',
            transitions: [{ to: 'gate' }] },
          { id: 'gate', type: 'gateway', label: 'Gate',
            transitions: [
              { to: 'done', condition: 'approved === true' },
              { to: 'cancel', condition: 'approved === false' },
            ] },
          { id: 'done', type: 'end', label: 'Approved', transitions: [] },
          { id: 'cancel', type: 'end', label: 'Rejected', transitions: [] },
        ],
      });

      const instance = await svc.start({ tenantId: 't1', workflowKey: 'po-approval', entityId: 'po-999', entityType: 'purchase_order' });
      const rejected = await svc.advance(instance.id, { approved: false }, 'manager');
      expect(rejected.currentNodeId).toBe('cancel');
      expect(rejected.status).toBe('completed');
    });
  });
});
