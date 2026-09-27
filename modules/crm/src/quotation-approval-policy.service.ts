import { Inject, Injectable } from '@nestjs/common';
import { type Id, newId } from '@aura/shared';
import { AccessService, TX_RUNNER, type TxRunner, UsersService } from '@aura/core';
import {
  CRM_COMPANY_POLICY_STORE, type CompanyPolicyChange, type CompanyPolicyStore, type CompanyPolicyVersion, type PolicyChangeAction,
} from './company-policy-store';
import {
  type ApprovalStepPolicy, type OfferFacts, type PolicyDirectory, type PolicyIssue, type QuotationApprovalPolicy,
  QUOTATION_APPROVAL_POLICY_KEY, QUOTATION_APPROVE_PERMISSION, QUOTATION_READ_PERMISSION, ownerDefaultQuotationApprovalPolicy,
  planQuotationApproval, validateQuotationApprovalPolicy,
} from './domain/quotation-approval-policy';

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Whatever arrives from the editor becomes a complete policy of the right SHAPE; whether its
 * VALUES make sense is validation's job, so nothing is silently corrected here.
 */
export function normaliseQuotationApprovalPolicy(input: unknown): QuotationApprovalPolicy {
  const p = (input ?? {}) as Record<string, unknown>;
  const sod = (p.segregationOfDuties ?? {}) as Record<string, unknown>;
  const sla = p.sla as Record<string, unknown> | null | undefined;
  return {
    currency: String(p.currency ?? '').trim().toUpperCase(),
    amountBasis: p.amountBasis === 'gross' ? 'gross' : p.amountBasis === 'net' ? 'net' : (String(p.amountBasis ?? '') as 'net'),
    steps: (Array.isArray(p.steps) ? p.steps : []).map((raw): ApprovalStepPolicy => {
      const s = (raw ?? {}) as Record<string, unknown>;
      return {
        id: String(s.id ?? '').trim(), label: String(s.label ?? '').trim(), role: String(s.role ?? '').trim(),
        quorum: Number(s.quorum ?? 1), order: Number(s.order ?? 1), appliesAbove: num(s.appliesAbove),
        pendingDecision: str(s.pendingDecision),
      };
    }),
    minimumMarginPercent: num(p.minimumMarginPercent), marginEscalationRole: str(p.marginEscalationRole),
    maximumDiscountPercent: num(p.maximumDiscountPercent), discountEscalationRole: str(p.discountEscalationRole),
    sla: sla && sla.hours !== undefined && sla.hours !== null && sla.hours !== '' ? { hours: Number(sla.hours), escalateToRole: String(sla.escalateToRole ?? '') } : null,
    manualQuotations: p.manualQuotations === 'allowed' || p.manualQuotations === 'management_required' ? p.manualQuotations : 'forbidden',
    managementRole: str(p.managementRole),
    segregationOfDuties: {
      preparerMayNotApprove: sod.preparerMayNotApprove !== false,
      oneStepPerApprover: sod.oneStepPerApprover !== false,
    },
  };
}

/**
 * Settings → Company Policies → Quotation Approval (EST-17). A tenant's Admin keeps the policy as
 * VERSIONS: one draft is edited, validated and previewed, then activated with a reason; the version
 * it replaces is retired and kept. Every change is logged with who, when, why, before and after.
 * Nothing here grants a role or a permission.
 */
@Injectable()
export class QuotationApprovalPolicyService {
  constructor(
    @Inject(CRM_COMPANY_POLICY_STORE) private readonly store: CompanyPolicyStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    private readonly users: UsersService,
  ) {}

  /** Does this user hold this role in this tenant? (A company-level grant sits inside the tenant.) */
  holdsRole(tenantId: Id, userId: Id, roleId: string): boolean {
    return this.access.grantsOf(userId).some((g) => g.roleId === roleId && g.scope.kind === 'org'
      && (g.scope.level !== 'tenant' || g.scope.id === tenantId));
  }

  async directory(tenantId: Id): Promise<PolicyDirectory> {
    await this.users.ensureTenant(tenantId);
    const active = this.users.list(tenantId).filter((u) => u.active);
    const roles = this.access.listRoles();
    // Both, as the route asks: the approve action is reached by opening the offer.
    const orgPath = [{ level: 'tenant' as const, id: tenantId }];
    const mayApprove = new Set(active.filter((u) => [QUOTATION_READ_PERMISSION, QUOTATION_APPROVE_PERMISSION]
      .every((permission) => this.access.can(u.userId, { permission, orgPath }).allowed)).map((u) => u.userId));
    const holders: Record<string, number> = {};
    const approvers: Record<string, number> = {};
    for (const role of roles) {
      const holding = active.filter((u) => this.holdsRole(tenantId, u.userId, role.id));
      holders[role.id] = holding.length;
      approvers[role.id] = holding.filter((u) => mayApprove.has(u.userId)).length;
    }
    return { roles: roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions })), holders, approvers };
  }

  async active(tenantId: Id): Promise<{ version: number; policy: QuotationApprovalPolicy } | null> {
    const v = await this.store.getActive(tenantId, QUOTATION_APPROVAL_POLICY_KEY);
    return v ? { version: v.version, policy: normaliseQuotationApprovalPolicy(v.body) } : null;
  }

  /** A version as it was activated — versions are frozen once active, so an old run reads its own. */
  async pinned(tenantId: Id, version: number): Promise<QuotationApprovalPolicy> {
    return normaliseQuotationApprovalPolicy((await this.version(tenantId, version)).body);
  }

  /**
   * J1-09 — may a NEW offer be quoted outside the study/estimate/pricing chain? Under an active
   * policy that forbids it, no. Existing offers are untouched: this is asked only where one is born.
   */
  async assertManualQuotingAllowed(tenantId: Id): Promise<void> {
    const active = await this.active(tenantId);
    if (active?.policy.manualQuotations === 'forbidden') {
      throw new Error(`a new offer can only be quoted through the technical study, estimate and pricing — company policy (quotation approval version ${active.version}) forbids manual quotations for new deals`);
    }
  }

  async overview(tenantId: Id) {
    const [versions, changes, directory] = await Promise.all([
      this.store.listVersions(tenantId, QUOTATION_APPROVAL_POLICY_KEY),
      this.store.listChanges(tenantId, QUOTATION_APPROVAL_POLICY_KEY),
      this.directory(tenantId),
    ]);
    return {
      policyKey: QUOTATION_APPROVAL_POLICY_KEY,
      active: versions.find((v) => v.status === 'active') ?? null,
      versions,
      changes,
      ownerDefault: ownerDefaultQuotationApprovalPolicy(),
      roles: directory.roles.map((r) => ({ id: r.id, name: r.name, holders: directory.holders[r.id] ?? 0, approvers: directory.approvers[r.id] ?? 0 })),
    };
  }

  async validate(tenantId: Id, body: unknown): Promise<PolicyIssue[]> {
    return validateQuotationApprovalPolicy(normaliseQuotationApprovalPolicy(body), await this.directory(tenantId));
  }

  async preview(tenantId: Id, body: unknown, offer: OfferFacts) {
    const policy = normaliseQuotationApprovalPolicy(body);
    return { issues: validateQuotationApprovalPolicy(policy, await this.directory(tenantId)), plan: planQuotationApproval(policy, offer) };
  }

  async createDraft(input: { tenantId: Id; actorId: Id; reason: string; from?: 'active' | 'owner-default' }): Promise<CompanyPolicyVersion> {
    const reason = this.reasonOf(input.reason);
    const versions = await this.store.listVersions(input.tenantId, QUOTATION_APPROVAL_POLICY_KEY);
    const open = versions.find((v) => v.status === 'draft');
    if (open) throw new Error(`draft version ${open.version} already exists — edit or activate it before starting another`);
    const active = versions.find((v) => v.status === 'active');
    const body = input.from === 'owner-default' || !active ? ownerDefaultQuotationApprovalPolicy() : normaliseQuotationApprovalPolicy(active.body);
    const now = new Date().toISOString();
    const draft: CompanyPolicyVersion = {
      id: newId(), tenantId: input.tenantId, policyKey: QUOTATION_APPROVAL_POLICY_KEY,
      version: Math.max(0, ...versions.map((v) => v.version)) + 1, status: 'draft', body,
      createdBy: input.actorId, createdAt: now, updatedAt: now, activatedBy: null, activatedAt: null, retiredAt: null,
    };
    await this.tx.run(async (handle) => {
      await this.store.saveVersion(handle, draft);
      await this.store.appendChange(handle, this.change(draft, 'draft_created', input.actorId, reason, active?.body ?? null, body));
    });
    return draft;
  }

  async updateDraft(input: { tenantId: Id; version: number; body: unknown; actorId: Id; reason: string }): Promise<CompanyPolicyVersion> {
    const reason = this.reasonOf(input.reason);
    const draft = await this.version(input.tenantId, input.version);
    if (draft.status !== 'draft') throw new Error(`version ${draft.version} is ${draft.status}; only a draft can be edited — start a new draft`);
    const body = normaliseQuotationApprovalPolicy(input.body);
    const updated: CompanyPolicyVersion = { ...draft, body, updatedAt: new Date().toISOString() };
    await this.tx.run(async (handle) => {
      await this.store.saveVersion(handle, updated);
      await this.store.appendChange(handle, this.change(updated, 'draft_updated', input.actorId, reason, draft.body, body));
    });
    return updated;
  }

  /** Activation takes effect for approvals STARTED from now on; approvals under way keep their version. */
  async activate(input: { tenantId: Id; version: number; actorId: Id; reason: string }): Promise<CompanyPolicyVersion> {
    const reason = this.reasonOf(input.reason);
    const draft = await this.version(input.tenantId, input.version);
    if (draft.status !== 'draft') throw new Error(`version ${draft.version} is ${draft.status}; only a draft can be activated`);
    const errors = (await this.validate(input.tenantId, draft.body)).filter((i) => i.severity === 'error');
    if (errors.length) {
      throw new Error(`validation failed: version ${draft.version} cannot be activated — ${errors.map((e) => e.message).join('; ')}`);
    }
    const previous = await this.store.getActive(input.tenantId, QUOTATION_APPROVAL_POLICY_KEY);
    const now = new Date().toISOString();
    const activated: CompanyPolicyVersion = { ...draft, status: 'active', activatedBy: input.actorId, activatedAt: now, updatedAt: now };
    await this.tx.run(async (handle) => {
      if (previous) await this.store.saveVersion(handle, { ...previous, status: 'retired', retiredAt: now, updatedAt: now });
      await this.store.saveVersion(handle, activated);
      await this.store.appendChange(handle, this.change(activated, 'activated', input.actorId, reason, previous?.body ?? null, activated.body));
    });
    return activated;
  }

  /** Retire the active version: approvals started afterwards follow no policy (a single approval). */
  async retire(input: { tenantId: Id; actorId: Id; reason: string }): Promise<CompanyPolicyVersion> {
    const reason = this.reasonOf(input.reason);
    const active = await this.store.getActive(input.tenantId, QUOTATION_APPROVAL_POLICY_KEY);
    if (!active) throw new Error('no quotation approval policy is active, so there is nothing to retire');
    const now = new Date().toISOString();
    const retired: CompanyPolicyVersion = { ...active, status: 'retired', retiredAt: now, updatedAt: now };
    await this.tx.run(async (handle) => {
      await this.store.saveVersion(handle, retired);
      await this.store.appendChange(handle, this.change(retired, 'retired', input.actorId, reason, active.body, null));
    });
    return retired;
  }

  private async version(tenantId: Id, version: number): Promise<CompanyPolicyVersion> {
    const found = (await this.store.listVersions(tenantId, QUOTATION_APPROVAL_POLICY_KEY)).find((v) => v.version === Number(version));
    if (!found) throw new Error(`quotation approval policy version ${version} not found`);
    return found;
  }

  private reasonOf(reason: string): string {
    const why = (reason ?? '').trim();
    if (why.length < 3) throw new Error('a reason is required to change a company policy');
    return why;
  }

  private change(v: CompanyPolicyVersion, action: PolicyChangeAction, actorId: Id, reason: string, previous: unknown, next: unknown): CompanyPolicyChange {
    return { id: newId(), tenantId: v.tenantId, policyKey: v.policyKey, version: v.version, action, actorId, reason, previous, next, at: new Date().toISOString() };
  }
}
