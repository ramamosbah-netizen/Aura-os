import { describe, expect, it } from 'vitest';
import {
  type WorkflowDefinition,
  applyTransition,
  availableActions,
  checkTransition,
  isTerminal,
  makeWorkflowDefinition,
  makeWorkflowInstance,
} from './workflow';

function poApproval(): WorkflowDefinition {
  return makeWorkflowDefinition({
    key: 'po.approval',
    name: 'PO Approval',
    initialState: 'draft',
    states: ['draft', 'submitted', 'approved', 'rejected'],
    terminalStates: ['approved', 'rejected'],
    transitions: [
      { from: 'draft', to: 'submitted', action: 'submit' },
      { from: 'submitted', to: 'approved', action: 'approve', permission: 'procurement.po.approve' },
      { from: 'submitted', to: 'rejected', action: 'reject', permission: 'procurement.po.approve' },
    ],
  });
}

const newInstance = () =>
  makeWorkflowInstance(poApproval(), { tenantId: 't1', companyId: 'c1', aggregateType: 'procurement.po', aggregateId: 'po-1' });

describe('workflow model', () => {
  it('starts an instance at the initial state, open, with no history', () => {
    const i = newInstance();
    expect(i.currentState).toBe('draft');
    expect(i.status).toBe('open');
    expect(i.history).toHaveLength(0);
  });

  it('checkTransition accepts a valid action from the current state', () => {
    const c = checkTransition(poApproval(), newInstance(), 'submit');
    expect(c.ok).toBe(true);
    expect(c.transition?.to).toBe('submitted');
  });

  it('checkTransition rejects an action not valid from the current state', () => {
    expect(checkTransition(poApproval(), newInstance(), 'approve').ok).toBe(false); // can't approve a draft
    expect(checkTransition(poApproval(), newInstance(), 'nope').ok).toBe(false);
  });

  it('applyTransition advances state and records history', () => {
    const def = poApproval();
    const submitted = applyTransition(def, newInstance(), checkTransition(def, newInstance(), 'submit').transition!, 'u1');
    expect(submitted.currentState).toBe('submitted');
    expect(submitted.status).toBe('open');
    expect(submitted.history).toHaveLength(1);
    expect(submitted.history[0]).toMatchObject({ from: 'draft', to: 'submitted', action: 'submit', actorId: 'u1' });
  });

  it('completes the instance when reaching a terminal state', () => {
    const def = poApproval();
    let i = applyTransition(def, newInstance(), checkTransition(def, newInstance(), 'submit').transition!, 'u1');
    i = applyTransition(def, i, checkTransition(def, i, 'approve').transition!, 'u2');
    expect(i.currentState).toBe('approved');
    expect(i.status).toBe('completed');
    expect(i.history).toHaveLength(2);
  });

  it('refuses any transition once the instance is closed', () => {
    const def = poApproval();
    let i = applyTransition(def, newInstance(), checkTransition(def, newInstance(), 'submit').transition!, 'u1');
    i = applyTransition(def, i, checkTransition(def, i, 'approve').transition!, 'u2');
    expect(checkTransition(def, i, 'reject').ok).toBe(false); // already completed
    expect(availableActions(def, i)).toHaveLength(0);
  });

  it('isTerminal reflects the declared terminal states', () => {
    const def = poApproval();
    expect(isTerminal(def, 'approved')).toBe(true);
    expect(isTerminal(def, 'draft')).toBe(false);
  });

  it('availableActions lists outgoing transitions from the current state', () => {
    const def = poApproval();
    const submitted = applyTransition(def, newInstance(), checkTransition(def, newInstance(), 'submit').transition!, 'u1');
    expect(availableActions(def, submitted).map((t) => t.action).sort()).toEqual(['approve', 'reject']);
  });
});
