import { describe, expect, it } from 'vitest';
import {
  approvalProgress, ownerDefaultQuotationApprovalPolicy, planQuotationApproval, validateQuotationApprovalPolicy,
  type PolicyDirectory, type QuotationApprovalPolicy,
} from './domain/quotation-approval-policy';

/** `canApprove`: the roles whose holders ALSO hold the approve permission (one each, unless `holders` says otherwise). */
const directory = (canApprove: string[], holders: Record<string, number> = {}): PolicyDirectory => {
  const all = ['r-technical-manager', 'r-commercial-manager', 'r-sales-manager', 'r-executive'];
  const held = Object.fromEntries(all.map((id) => [id, holders[id] ?? 1]));
  return {
    roles: all.map((id) => ({ id, permissions: [] })),
    holders: held,
    approvers: Object.fromEntries(all.map((id) => [id, canApprove.includes(id) ? held[id] : 0])),
  };
};
const ALL = ['r-technical-manager', 'r-commercial-manager', 'r-sales-manager', 'r-executive'];
const policy = (over: Partial<QuotationApprovalPolicy> = {}): QuotationApprovalPolicy => {
  const base = ownerDefaultQuotationApprovalPolicy();
  return { ...base, steps: base.steps.map((s) => (s.id === 'executive' ? { ...s, appliesAbove: 1_000_000, pendingDecision: null } : s)), ...over };
};
const codes = (p: QuotationApprovalPolicy, d = directory(ALL)) => validateQuotationApprovalPolicy(p, d).map((i) => `${i.severity}:${i.code}`);

describe("the owner's default policy (2026-09-27)", () => {
  it('is TM → Commercial → Sales, net of VAT, in AED, with manual quotes forbidden', () => {
    const d = ownerDefaultQuotationApprovalPolicy();
    expect(d.steps.map((s) => [s.order, s.role])).toEqual([[1, 'r-technical-manager'], [2, 'r-commercial-manager'], [3, 'r-sales-manager'], [4, 'r-executive']]);
    expect(d).toMatchObject({ amountBasis: 'net', currency: 'AED', manualQuotations: 'forbidden', minimumMarginPercent: null, maximumDiscountPercent: null, sla: null });
  });

  it('cannot be activated until the owner sets the Executive amount — the gap is reported, not guessed', () => {
    expect(codes(ownerDefaultQuotationApprovalPolicy())).toContain('error:pending-decision');
    // And a pending step survives JSON storage as pending (no NaN turning into "every offer").
    const stored = JSON.parse(JSON.stringify(ownerDefaultQuotationApprovalPolicy())) as QuotationApprovalPolicy;
    expect(codes(stored)).toContain('error:pending-decision');
    expect(planQuotationApproval(stored, { net: 10, gross: 10.5, marginPercent: null, discountPercent: null, manual: false }).steps.map((s) => s.id)).not.toContain('executive');
  });
});

describe('validation before activation', () => {
  it('passes a complete policy whose roles can approve', () => {
    expect(codes(policy()).filter((c) => c.startsWith('error'))).toEqual([]);
  });

  it('reports a role that cannot approve — a policy never grants the permission', () => {
    // The shipped Technical Manager and Executive roles do not hold crm.quotation.approve today.
    expect(codes(policy(), directory(['r-commercial-manager', 'r-sales-manager']))).toEqual(
      expect.arrayContaining(['error:unauthorised-approver']),
    );
    expect(validateQuotationApprovalPolicy(policy(), directory(['r-commercial-manager', 'r-sales-manager']))
      .filter((i) => i.code === 'unauthorised-approver').map((i) => i.message.split(':')[0])).toEqual(['"Technical Manager"', '"Executive"']);
  });

  it('reports a missing approver, an empty sequence, overlapping thresholds and unreachable escalation', () => {
    expect(codes(policy({ steps: [] }))).toContain('error:no-steps');
    expect(codes(policy({ steps: [{ id: 'x', label: 'Ghost', role: 'r-ghost', quorum: 1, order: 1, appliesAbove: null }] }))).toContain('error:missing-approver');
    expect(codes(policy({ steps: [
      { id: 'a', label: 'Sales A', role: 'r-sales-manager', quorum: 1, order: 1, appliesAbove: 100 },
      { id: 'b', label: 'Sales B', role: 'r-sales-manager', quorum: 1, order: 1, appliesAbove: 100 },
    ] }))).toContain('error:overlapping-thresholds');
    expect(codes(policy({ minimumMarginPercent: 12, marginEscalationRole: 'r-ghost' }))).toContain('error:unreachable-escalation');
    expect(codes(policy({ sla: { hours: 24, escalateToRole: 'r-technical-manager' } }), directory(['r-commercial-manager', 'r-sales-manager', 'r-executive']))).toContain('error:unreachable-escalation');
    expect(codes(policy(), directory(ALL, { 'r-sales-manager': 0 }))).toContain('error:unauthorised-approver');
    expect(codes(policy({ steps: [{ id: 'q', label: 'Two approvers', role: 'r-sales-manager', quorum: 2, order: 1, appliesAbove: null }] }))).toContain('warning:too-few-approvers');
  });
});

describe('rules the server cannot yet apply', () => {
  it('refuses a discount trigger and an SLA rather than store them as promises', () => {
    expect(codes(policy({ maximumDiscountPercent: 10, discountEscalationRole: 'r-executive' }))).toContain('error:not-enforced-yet');
    expect(codes(policy({ sla: { hours: 24, escalateToRole: 'r-executive' } }))).toContain('error:not-enforced-yet');
    expect(codes(policy())).not.toContain('error:not-enforced-yet');
  });
});

describe('the plan for one offer', () => {
  const offer = { net: 400_000, gross: 420_000, marginPercent: 18, discountPercent: null, manual: false };

  it('applies the management tier only above its threshold, judged net of VAT', () => {
    const p = policy({ steps: policy().steps.map((s) => (s.id === 'executive' ? { ...s, appliesAbove: 410_000 } : s)) });
    expect(planQuotationApproval(p, offer).steps.map((s) => s.id)).toEqual(['technical', 'commercial', 'sales']);
    expect(planQuotationApproval({ ...p, amountBasis: 'gross' }, offer).steps.map((s) => s.id)).toEqual(['technical', 'commercial', 'sales', 'executive']);
  });

  it('adds an escalation for a low margin, once — and for a margin nobody can know', () => {
    const p = policy({ minimumMarginPercent: 20, marginEscalationRole: 'r-executive' });
    expect(planQuotationApproval(p, offer).steps.map((s) => s.id)).toEqual(['technical', 'commercial', 'sales', 'margin-escalation']);
    expect(planQuotationApproval(p, { ...offer, marginPercent: 25 }).steps.map((s) => s.id)).not.toContain('margin-escalation');
    const unknown = planQuotationApproval(p, { ...offer, marginPercent: null }).steps.find((s) => s.id === 'margin-escalation');
    expect(unknown?.because).toContain('not known');
  });

  it('keeps the sequence: a later step waits until the earlier ones have their quorum', () => {
    const { steps } = planQuotationApproval(policy(), offer);
    expect(approvalProgress(steps, []).open.map((s) => s.id)).toEqual(['technical']);
    expect(approvalProgress(steps, [{ stepId: 'technical', approverId: 'tm', decidedAt: '' }]).open.map((s) => s.id)).toEqual(['commercial']);
    const done = approvalProgress(steps, ['technical', 'commercial', 'sales'].map((stepId, i) => ({ stepId, approverId: `u${i}`, decidedAt: '' })));
    expect(done.complete).toBe(true);
  });
});
