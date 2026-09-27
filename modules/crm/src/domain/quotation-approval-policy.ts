/**
 * EST-17 — THE QUOTATION APPROVAL POLICY, as company configuration (Settings → Company Policies →
 * Quotation Approval). The owner's decisions are the DEFAULT policy, not rules in code: a tenant's
 * Admin changes approvers, thresholds, sequence, quorum, escalation, technical sign-off, triggers,
 * SLA and the manual-quotation exception, previews and validates the change, and activates it as a
 * new VERSION. An approval already started keeps the version it started under.
 *
 * Two things a policy never does:
 *   - GRANT authority. A step names a role; the approver must hold that role AND the
 *     `crm.quotation.approve` permission with enough approval limit. A policy naming a role that
 *     cannot approve is reported by validation as unreachable, never silently made to work.
 *   - Rewrite history. Issued quotations and recorded decisions do not change when a policy does.
 */

export const QUOTATION_APPROVAL_POLICY_KEY = 'quotation-approval';
export const QUOTATION_APPROVE_PERMISSION = 'crm.quotation.approve';
/** An approver must also be able to open the offer — the approve action is reached through it. */
export const QUOTATION_READ_PERMISSION = 'crm.quotation.read';

export type AmountBasis = 'net' | 'gross';
export type ManualQuotationRule = 'allowed' | 'management_required' | 'forbidden';

export interface ApprovalStepPolicy {
  /** Stable within a policy version; decisions are recorded against it. */
  id: string;
  label: string;
  /** The role an approver of this step must hold (e.g. `r-commercial-manager`). */
  role: string;
  /** How many distinct approvers the step needs. */
  quorum: number;
  /** Position in the sequence; steps with the same order may be approved in any order. */
  order: number;
  /**
   * The step applies only above this amount (exclusive), judged on the policy's amount basis.
   * Null: every offer. A management tier is a step with a threshold.
   */
  appliesAbove: number | null;
  /**
   * A value the owner has not decided yet (e.g. the Executive tier's amount). Validation refuses to
   * activate a policy while any step carries one — a missing decision is never filled with a guess.
   */
  pendingDecision?: string | null;
}

export interface QuotationApprovalPolicy {
  currency: string;
  amountBasis: AmountBasis;
  steps: ApprovalStepPolicy[];
  /** An offer below this margin (percent) needs the escalation role's approval as well. */
  minimumMarginPercent: number | null;
  marginEscalationRole: string | null;
  /** An offer discounted above this percent needs the escalation role's approval as well. */
  maximumDiscountPercent: number | null;
  discountEscalationRole: string | null;
  /** A step pending longer than this is escalated to the role named. */
  sla: { hours: number; escalateToRole: string } | null;
  manualQuotations: ManualQuotationRule;
  /** The role a `management_required` manual quotation, or an escalation without a role, goes to. */
  managementRole: string | null;
  segregationOfDuties: {
    /** The person who prepared the offer may not approve any step of it. */
    preparerMayNotApprove: boolean;
    /** One person approves at most one step of the same offer. */
    oneStepPerApprover: boolean;
  };
}

export interface PolicyIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

/** What validation needs to know about the tenant's roles and people — read, never changed. */
export interface PolicyDirectory {
  roles: Array<{ id: string; name?: string; permissions: readonly string[] }>;
  /** Active users holding each role (by role id). */
  holders: Record<string, number>;
  /**
   * Active users holding each role WHO ALSO hold the approve permission through any of their grants.
   * That is who can actually approve a step naming the role: the role says who, the permission says
   * may — and a policy grants neither.
   */
  approvers: Record<string, number>;
}

const known = (d: PolicyDirectory, role: string | null | undefined) => Boolean(role && d.roles.some((r) => r.id === role));

/**
 * Validate a policy BEFORE activation. Errors block activation; warnings are shown. Nothing here
 * changes a role or a grant — a role that cannot approve is reported, not fixed.
 */
export function validateQuotationApprovalPolicy(policy: QuotationApprovalPolicy, directory: PolicyDirectory): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ severity: 'warning', code, message });

  if (!/^[A-Z]{3}$/.test(policy.currency ?? '')) error('currency', 'the currency must be a three-letter code (e.g. AED)');
  if (policy.amountBasis !== 'net' && policy.amountBasis !== 'gross') error('amount-basis', 'thresholds must be judged on the net (before VAT) or gross (after VAT) amount');
  if (!policy.steps?.length) error('no-steps', 'the policy has no approval step, so no offer could ever be approved');

  const ids = new Set<string>();
  for (const step of policy.steps ?? []) {
    const name = step.label || step.id;
    if (!step.id?.trim()) error('step-id', `a step has no id (${name})`);
    else if (ids.has(step.id)) error('step-id', `two steps share the id "${step.id}"`);
    ids.add(step.id);
    if (step.pendingDecision) error('pending-decision', `"${name}" is waiting on a decision: ${step.pendingDecision}`);
    if (!Number.isInteger(step.quorum) || step.quorum < 1) error('quorum', `"${name}" needs a quorum of at least one approver`);
    if (!Number.isInteger(step.order) || step.order < 1) error('order', `"${name}" needs a position in the sequence (1 or more)`);
    if (step.appliesAbove !== null && (!Number.isFinite(step.appliesAbove) || step.appliesAbove < 0)) {
      error('threshold', `"${name}" has a threshold that is not a non-negative amount`);
    }
    if (!known(directory, step.role)) {
      error('missing-approver', `"${name}" names the role "${step.role || '(none)'}", which does not exist`);
      continue;
    }
    const holders = directory.holders[step.role] ?? 0;
    const approvers = directory.approvers[step.role] ?? 0;
    if (approvers === 0) {
      error('unauthorised-approver', `"${name}": no active user holding ${step.role} also holds ${QUOTATION_READ_PERMISSION} and ${QUOTATION_APPROVE_PERMISSION} (${holders} hold the role); a policy does not grant the permission — an administrator must grant it before this step can be approved`);
    } else if (approvers < step.quorum) {
      warn('too-few-approvers', `"${name}" needs ${step.quorum} approver(s); ${approvers} active user(s) holding ${step.role} can approve today`);
    }
  }

  // Overlapping thresholds: two steps at the same position for the same role whose bands overlap
  // make it ambiguous which applies; a management tier must be above the steps that always apply.
  const byPosition = new Map<string, ApprovalStepPolicy[]>();
  for (const step of policy.steps ?? []) {
    const key = `${step.order}:${step.role}`;
    byPosition.set(key, [...(byPosition.get(key) ?? []), step]);
  }
  for (const group of byPosition.values()) {
    if (group.length < 2) continue;
    const thresholds = group.map((s) => s.appliesAbove ?? -1);
    if (new Set(thresholds).size !== thresholds.length) {
      error('overlapping-thresholds', `steps ${group.map((s) => `"${s.label || s.id}"`).join(' and ')} are at the same position for the same role with the same threshold`);
    } else {
      warn('overlapping-thresholds', `steps ${group.map((s) => `"${s.label || s.id}"`).join(' and ')} are at the same position for the same role; above the higher threshold both apply`);
    }
  }

  const escalation = (label: string, role: string | null, needed: boolean) => {
    if (!needed) return;
    if (!known(directory, role)) error('unreachable-escalation', `${label} escalates to "${role || '(none)'}", which is not a role`);
    else if (!(directory.approvers[role!] ?? 0)) error('unreachable-escalation', `${label} escalates to ${role}, but no active user holding it also holds ${QUOTATION_READ_PERMISSION} and ${QUOTATION_APPROVE_PERMISSION}`);
  };
  if (policy.minimumMarginPercent !== null && !Number.isFinite(policy.minimumMarginPercent)) error('margin', 'the minimum margin must be a percentage');
  escalation('the minimum-margin trigger', policy.marginEscalationRole ?? policy.managementRole, policy.minimumMarginPercent !== null);
  if (policy.maximumDiscountPercent !== null && !Number.isFinite(policy.maximumDiscountPercent)) error('discount', 'the maximum discount must be a percentage');
  escalation('the discount trigger', policy.discountEscalationRole ?? policy.managementRole, policy.maximumDiscountPercent !== null);
  // A rule the server cannot yet apply is refused, not stored as a promise: activating it would read
  // as enforced while nothing enforces it.
  if (policy.maximumDiscountPercent !== null) {
    error('not-enforced-yet', 'a discount trigger cannot be activated yet: an offer does not record a discount of its own, so the trigger would never fire');
  }
  if (policy.sla) {
    if (!Number.isFinite(policy.sla.hours) || policy.sla.hours <= 0) error('sla', 'the SLA must be a positive number of hours');
    escalation('the SLA', policy.sla.escalateToRole, true);
    error('not-enforced-yet', 'an SLA cannot be activated yet: an overdue approval step is not escalated automatically (the escalation sweep is unproven)');
  }
  escalation('a manual quotation', policy.managementRole, policy.manualQuotations === 'management_required');
  return issues;
}

export interface OfferFacts {
  net: number;
  gross: number;
  marginPercent: number | null;
  discountPercent: number | null;
  /** Created outside the study/estimate/pricing chain. */
  manual: boolean;
}

export interface PlannedStep {
  id: string;
  label: string;
  role: string;
  quorum: number;
  order: number;
  /** Why this step applies to THIS offer. */
  because: string;
}

/** The steps THIS offer needs under THIS policy, in sequence. Pure: the same inputs, the same plan. */
export function planQuotationApproval(policy: QuotationApprovalPolicy, offer: OfferFacts): { amount: number; steps: PlannedStep[] } {
  const amount = policy.amountBasis === 'net' ? offer.net : offer.gross;
  const basis = policy.amountBasis === 'net' ? 'before VAT' : 'after VAT';
  const steps: PlannedStep[] = policy.steps
    .filter((s) => !s.pendingDecision)
    .filter((s) => s.appliesAbove === null || amount > s.appliesAbove)
    .map((s) => ({
      id: s.id, label: s.label, role: s.role, quorum: s.quorum, order: s.order,
      because: s.appliesAbove === null ? 'every offer' : `${policy.currency} ${amount} ${basis} is above ${policy.currency} ${s.appliesAbove}`,
    }));
  const last = Math.max(0, ...policy.steps.map((s) => s.order));
  const escalate = (id: string, label: string, role: string | null, because: string) => {
    if (!role || steps.some((s) => s.role === role)) return;
    steps.push({ id, label, role, quorum: 1, order: last + 1, because });
  };
  // An offer whose margin cannot be known (it carries no cost) is escalated, not waved through.
  if (policy.minimumMarginPercent !== null && (offer.marginPercent === null || offer.marginPercent < policy.minimumMarginPercent)) {
    escalate('margin-escalation', 'Margin escalation', policy.marginEscalationRole ?? policy.managementRole,
      offer.marginPercent === null ? `the margin is not known (the offer carries no cost) and the minimum is ${policy.minimumMarginPercent}%`
        : `margin ${offer.marginPercent}% is below ${policy.minimumMarginPercent}%`);
  }
  if (policy.maximumDiscountPercent !== null && offer.discountPercent !== null && offer.discountPercent > policy.maximumDiscountPercent) {
    escalate('discount-escalation', 'Discount escalation', policy.discountEscalationRole ?? policy.managementRole,
      `discount ${offer.discountPercent}% is above ${policy.maximumDiscountPercent}%`);
  }
  if (offer.manual && policy.manualQuotations === 'management_required') {
    escalate('manual-escalation', 'Manual quotation', policy.managementRole, 'the offer was quoted outside the governed chain');
  }
  return { amount, steps: steps.sort((a, b) => a.order - b.order) };
}

export interface StepDecision { stepId: string; approverId: string; decidedAt: string }

/**
 * Where an approval stands: the first position in the sequence whose steps are not all satisfied is
 * the current one; later positions wait. `complete` when every planned step has its quorum.
 */
export function approvalProgress(plan: PlannedStep[], decisions: StepDecision[]) {
  const got = (step: PlannedStep) => new Set(decisions.filter((d) => d.stepId === step.id).map((d) => d.approverId)).size;
  const positions = [...new Set(plan.map((s) => s.order))].sort((a, b) => a - b);
  const current = positions.find((order) => plan.filter((s) => s.order === order).some((s) => got(s) < s.quorum)) ?? null;
  return {
    complete: current === null,
    currentOrder: current,
    open: current === null ? [] : plan.filter((s) => s.order === current && got(s) < s.quorum),
    steps: plan.map((s) => ({ ...s, approvals: got(s), satisfied: got(s) >= s.quorum })),
  };
}

/**
 * The owner's initial decisions (2026-09-27), as the tenant's first DRAFT — never activated here.
 * The Executive tier's amount was left to the owner, so the draft carries no threshold for it and
 * validation reports that until the owner sets it.
 */
export function ownerDefaultQuotationApprovalPolicy(): QuotationApprovalPolicy {
  return {
    currency: 'AED',
    amountBasis: 'net',
    steps: [
      { id: 'technical', label: 'Technical Manager', role: 'r-technical-manager', quorum: 1, order: 1, appliesAbove: null },
      { id: 'commercial', label: 'Commercial Manager', role: 'r-commercial-manager', quorum: 1, order: 2, appliesAbove: null },
      { id: 'sales', label: 'Sales Manager', role: 'r-sales-manager', quorum: 1, order: 3, appliesAbove: null },
      // Executive tier above an amount the owner has not set: the step says so, validation refuses
      // it, and the draft cannot be activated until the owner enters the amount.
      { id: 'executive', label: 'Executive', role: 'r-executive', quorum: 1, order: 4, appliesAbove: null, pendingDecision: 'the owner has not yet set the net AED amount above which the Executive approves' },
    ],
    minimumMarginPercent: null, marginEscalationRole: null,
    maximumDiscountPercent: null, discountEscalationRole: null,
    sla: null,
    manualQuotations: 'forbidden',
    managementRole: 'r-executive',
    segregationOfDuties: { preparerMayNotApprove: true, oneStepPerApprover: true },
  };
}
