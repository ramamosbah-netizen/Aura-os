import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PlannedStep, StepDecision } from './domain/quotation-approval-policy';

export const CRM_COMPANY_POLICY_STORE = Symbol('CRM_COMPANY_POLICY_STORE');
export const CRM_QUOTATION_APPROVAL_RUN_STORE = Symbol('CRM_QUOTATION_APPROVAL_RUN_STORE');

export type PolicyStatus = 'draft' | 'active' | 'retired';
export type PolicyChangeAction = 'draft_created' | 'draft_updated' | 'activated' | 'retired';

export interface CompanyPolicyVersion<T = unknown> {
  id: Id; tenantId: Id; policyKey: string; version: number; status: PolicyStatus; body: T;
  createdBy: Id; createdAt: string; updatedAt: string;
  activatedBy: Id | null; activatedAt: string | null; retiredAt: string | null;
}

export interface CompanyPolicyChange {
  id: Id; tenantId: Id; policyKey: string; version: number; action: PolicyChangeAction;
  actorId: Id; reason: string; previous: unknown; next: unknown; at: string;
}

/** Versions of a tenant's company policies, and the append-only log of every change to them. */
export interface CompanyPolicyStore {
  listVersions(tenantId: Id, policyKey: string): Promise<CompanyPolicyVersion[]>;
  getActive(tenantId: Id, policyKey: string): Promise<CompanyPolicyVersion | null>;
  saveVersion(tx: TxHandle | null, v: CompanyPolicyVersion): Promise<void>;
  appendChange(tx: TxHandle | null, c: CompanyPolicyChange): Promise<void>;
  listChanges(tenantId: Id, policyKey: string): Promise<CompanyPolicyChange[]>;
}

export type ApprovalRunStatus = 'open' | 'completed' | 'returned' | 'closed';

/** One offer's approval, pinned to the policy version it started under and the plan it produced. */
export interface QuotationApprovalRun {
  id: Id; tenantId: Id; quotationId: Id; policyKey: string; policyVersion: number;
  amount: number; amountBasis: 'net' | 'gross'; currency: string; plan: PlannedStep[];
  status: ApprovalRunStatus; startedBy: Id; startedAt: string; closedAt: string | null;
}

export interface StepApprovalRecord extends StepDecision { id: Id; tenantId: Id; runId: Id }

export interface QuotationApprovalRunStore {
  openRunFor(tenantId: Id, quotationId: Id): Promise<QuotationApprovalRun | null>;
  listRuns(tenantId: Id, quotationId: Id): Promise<QuotationApprovalRun[]>;
  saveRun(tx: TxHandle | null, run: QuotationApprovalRun): Promise<void>;
  appendDecision(tx: TxHandle | null, d: StepApprovalRecord): Promise<void>;
  listDecisions(tenantId: Id, runId: Id): Promise<StepApprovalRecord[]>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class InMemoryCompanyPolicyStore implements CompanyPolicyStore {
  private readonly versions = new Map<string, CompanyPolicyVersion>();
  private readonly changes: CompanyPolicyChange[] = [];
  async listVersions(tenantId: Id, policyKey: string) {
    return [...this.versions.values()].filter((v) => v.tenantId === tenantId && v.policyKey === policyKey).sort((a, b) => a.version - b.version).map(clone);
  }
  async getActive(tenantId: Id, policyKey: string) {
    return clone([...this.versions.values()].find((v) => v.tenantId === tenantId && v.policyKey === policyKey && v.status === 'active') ?? null);
  }
  async saveVersion(_tx: TxHandle | null, v: CompanyPolicyVersion) {
    const before = this.versions.get(v.id);
    if (before && before.status !== 'draft' && JSON.stringify(before.body) !== JSON.stringify(v.body)) {
      throw new Error(`company policy version ${before.version} of ${before.policyKey} is ${before.status}; a version can only be edited while it is a draft — start a new draft`);
    }
    if (v.status === 'active' && [...this.versions.values()].some((o) => o.id !== v.id && o.tenantId === v.tenantId && o.policyKey === v.policyKey && o.status === 'active')) {
      throw new Error(`${v.policyKey} already has an active version`);
    }
    this.versions.set(v.id, clone(v));
  }
  async appendChange(_tx: TxHandle | null, c: CompanyPolicyChange) { this.changes.push(clone(c)); }
  async listChanges(tenantId: Id, policyKey: string) {
    return this.changes.filter((c) => c.tenantId === tenantId && c.policyKey === policyKey).map(clone);
  }
}

export class InMemoryQuotationApprovalRunStore implements QuotationApprovalRunStore {
  private readonly runs = new Map<string, QuotationApprovalRun>();
  private readonly decisions: StepApprovalRecord[] = [];
  async openRunFor(tenantId: Id, quotationId: Id) {
    return clone([...this.runs.values()].find((r) => r.tenantId === tenantId && r.quotationId === quotationId && r.status === 'open') ?? null);
  }
  async listRuns(tenantId: Id, quotationId: Id) {
    return [...this.runs.values()].filter((r) => r.tenantId === tenantId && r.quotationId === quotationId).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map(clone);
  }
  async saveRun(_tx: TxHandle | null, run: QuotationApprovalRun) { this.runs.set(run.id, clone(run)); }
  async appendDecision(_tx: TxHandle | null, d: StepApprovalRecord) {
    if (this.decisions.some((x) => x.runId === d.runId && x.stepId === d.stepId && x.approverId === d.approverId)) {
      throw new Error(`${d.approverId} has already approved this step`);
    }
    this.decisions.push(clone(d));
  }
  async listDecisions(tenantId: Id, runId: Id) {
    return this.decisions.filter((d) => d.tenantId === tenantId && d.runId === runId).map(clone);
  }
}

type VersionRow = {
  id: string; tenant_id: string; policy_key: string; version: number; status: PolicyStatus; body: unknown;
  created_by: string; created_at: Date; updated_at: Date; activated_by: string | null; activated_at: Date | null; retired_at: Date | null;
};
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const versionOf = (r: VersionRow): CompanyPolicyVersion => ({
  id: r.id, tenantId: r.tenant_id, policyKey: r.policy_key, version: r.version, status: r.status, body: r.body,
  createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  activatedBy: r.activated_by, activatedAt: iso(r.activated_at), retiredAt: iso(r.retired_at),
});
const exec = (pool: Pool, tx: TxHandle | null): Pool | PoolClient => (tx ? (tx as PoolClient) : pool);

export class PostgresCompanyPolicyStore implements CompanyPolicyStore {
  constructor(private readonly pool: Pool) {}
  async listVersions(tenantId: Id, policyKey: string) {
    const r = await this.pool.query<VersionRow>('select * from public.aura_company_policies where tenant_id=$1 and policy_key=$2 order by version', [tenantId, policyKey]);
    return r.rows.map(versionOf);
  }
  async getActive(tenantId: Id, policyKey: string) {
    const r = await this.pool.query<VersionRow>("select * from public.aura_company_policies where tenant_id=$1 and policy_key=$2 and status='active'", [tenantId, policyKey]);
    return r.rows[0] ? versionOf(r.rows[0]) : null;
  }
  async saveVersion(tx: TxHandle | null, v: CompanyPolicyVersion) {
    await exec(this.pool, tx).query(
      `insert into public.aura_company_policies (id,tenant_id,policy_key,version,status,body,created_by,created_at,updated_at,activated_by,activated_at,retired_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do update set status=excluded.status, body=excluded.body, updated_at=excluded.updated_at,
         activated_by=excluded.activated_by, activated_at=excluded.activated_at, retired_at=excluded.retired_at`,
      [v.id, v.tenantId, v.policyKey, v.version, v.status, JSON.stringify(v.body), v.createdBy, v.createdAt, v.updatedAt, v.activatedBy, v.activatedAt, v.retiredAt],
    );
  }
  async appendChange(tx: TxHandle | null, c: CompanyPolicyChange) {
    await exec(this.pool, tx).query(
      `insert into public.aura_company_policy_changes (id,tenant_id,policy_key,version,action,actor_id,reason,previous,next,at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [c.id, c.tenantId, c.policyKey, c.version, c.action, c.actorId, c.reason, c.previous === undefined ? null : JSON.stringify(c.previous), c.next === undefined ? null : JSON.stringify(c.next), c.at],
    );
  }
  async listChanges(tenantId: Id, policyKey: string) {
    const r = await this.pool.query<{ id: string; tenant_id: string; policy_key: string; version: number; action: PolicyChangeAction; actor_id: string; reason: string; previous: unknown; next: unknown; at: Date }>(
      'select * from public.aura_company_policy_changes where tenant_id=$1 and policy_key=$2 order by at', [tenantId, policyKey]);
    return r.rows.map((c) => ({ id: c.id, tenantId: c.tenant_id, policyKey: c.policy_key, version: c.version, action: c.action, actorId: c.actor_id, reason: c.reason, previous: c.previous, next: c.next, at: c.at.toISOString() }));
  }
}

type RunRow = {
  id: string; tenant_id: string; quotation_id: string; policy_key: string; policy_version: number; amount: string;
  amount_basis: 'net' | 'gross'; currency: string; plan: PlannedStep[]; status: ApprovalRunStatus; started_by: string; started_at: Date; closed_at: Date | null;
};
const runOf = (r: RunRow): QuotationApprovalRun => ({
  id: r.id, tenantId: r.tenant_id, quotationId: r.quotation_id, policyKey: r.policy_key, policyVersion: r.policy_version,
  amount: Number(r.amount), amountBasis: r.amount_basis, currency: r.currency, plan: r.plan ?? [], status: r.status,
  startedBy: r.started_by, startedAt: r.started_at.toISOString(), closedAt: iso(r.closed_at),
});

export class PostgresQuotationApprovalRunStore implements QuotationApprovalRunStore {
  constructor(private readonly pool: Pool) {}
  async openRunFor(tenantId: Id, quotationId: Id) {
    const r = await this.pool.query<RunRow>("select * from public.aura_crm_quotation_approval_runs where tenant_id=$1 and quotation_id=$2 and status='open'", [tenantId, quotationId]);
    return r.rows[0] ? runOf(r.rows[0]) : null;
  }
  async listRuns(tenantId: Id, quotationId: Id) {
    const r = await this.pool.query<RunRow>('select * from public.aura_crm_quotation_approval_runs where tenant_id=$1 and quotation_id=$2 order by started_at', [tenantId, quotationId]);
    return r.rows.map(runOf);
  }
  async saveRun(tx: TxHandle | null, run: QuotationApprovalRun) {
    await exec(this.pool, tx).query(
      `insert into public.aura_crm_quotation_approval_runs (id,tenant_id,quotation_id,policy_key,policy_version,amount,amount_basis,currency,plan,status,started_by,started_at,closed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do update set status=excluded.status, closed_at=excluded.closed_at`,
      [run.id, run.tenantId, run.quotationId, run.policyKey, run.policyVersion, run.amount, run.amountBasis, run.currency, JSON.stringify(run.plan), run.status, run.startedBy, run.startedAt, run.closedAt],
    );
  }
  async appendDecision(tx: TxHandle | null, d: StepApprovalRecord) {
    await exec(this.pool, tx).query(
      'insert into public.aura_crm_quotation_step_approvals (id,tenant_id,run_id,step_id,approver_id,decided_at) values ($1,$2,$3,$4,$5,$6)',
      [d.id, d.tenantId, d.runId, d.stepId, d.approverId, d.decidedAt],
    );
  }
  async listDecisions(tenantId: Id, runId: Id) {
    const r = await this.pool.query<{ id: string; tenant_id: string; run_id: string; step_id: string; approver_id: string; decided_at: Date }>(
      'select * from public.aura_crm_quotation_step_approvals where tenant_id=$1 and run_id=$2 order by decided_at', [tenantId, runId]);
    return r.rows.map((d) => ({ id: d.id, tenantId: d.tenant_id, runId: d.run_id, stepId: d.step_id, approverId: d.approver_id, decidedAt: d.decided_at.toISOString() }));
  }
}
