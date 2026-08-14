import { describe, expect, it, beforeEach } from 'vitest';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentGovernanceService } from './agent-governance.service';
import { SaasCreditBillingService } from './saas-credit-billing.service';
import { AiPlatformService } from './ai-platform.service';
import { AgentTracerService } from './agent-tracer.service';
import { AgentMetricsService } from './agent-metrics.service';
import { PolicyEngineService } from './policy-engine.service';
import { AiContextEngine } from './ai-context.engine';

/**
 * P7-01 acceptance: every agent execution is policy-checked, budget-checked, idempotently metered,
 * and reported with a durable outcome. These run entirely in-memory (no DB pool) with a fake
 * AutonomyService — the runtime only calls `propose()` — so the governance + metering logic is
 * isolated, deterministic, and fast.
 */
describe('P7-01 — Governed & Metered Agent Runtime', () => {
  let runtime: AgentRuntimeService;
  let governance: AgentGovernanceService;
  let billing: SaasCreditBillingService;

  // The runtime's only touchpoint on autonomy is propose(); a stub keeps DB/event-store out of the test.
  const fakeAutonomy = {
    propose: async () => ({ id: `prop-${Math.random().toString(36).slice(2, 8)}`, title: 'Proposed action' }),
  } as any;

  beforeEach(() => {
    governance = new AgentGovernanceService();
    billing = new SaasCreditBillingService(); // no pool ⇒ in-memory path
    const aiPlatform = new AiPlatformService();
    aiPlatform.onModuleInit(); // seeds the default agent roster (getAgent is otherwise empty)
    runtime = new AgentRuntimeService(
      aiPlatform,
      fakeAutonomy,
      new AgentTracerService(),
      new AgentMetricsService(),
      new PolicyEngineService(),
      new AiContextEngine(),
      governance,
      billing,
    );
  });

  const run = (agentId: string, tenantId: string, payload: Record<string, any> = {}, idempotencyKey?: string) =>
    runtime.execute({ agentId, tenantId, actorId: 'user-1', payload, idempotencyKey });

  it('debits credits and completes a non-gated operational agent', async () => {
    const before = (await billing.getTenantBalance('t-ops')).balanceCredits;
    const res = await run('site_safety_supervisor', 't-ops', { valueAmount: 2500 });

    expect(res.status).toBe('completed');
    expect(res.approvalRequired).toBe(false);
    expect(res.approvalStatus).toBe('not_required');
    expect(res.creditsConsumed).toBe(5); // proposed default price
    expect((await billing.getTenantBalance('t-ops')).balanceCredits).toBe(before - 5);
  });

  it('proposes (not executes) a financial agent behind a human gate', async () => {
    const res = await run('cost_variance_agent', 't-fin', { valueAmount: 2500 });

    expect(res.status).toBe('proposal_generated');
    expect(res.approvalRequired).toBe(true);
    expect(res.approvalStatus).toBe('pending');
    expect(res.creditsConsumed).toBe(12); // gated work is still metered — the reasoning was spent
    expect(res.proposalId).toBeDefined();
  });

  it('forces approval for a high-value action even on a non-gated agent', async () => {
    const res = await run('site_safety_supervisor', 't-hv', { valueAmount: 25_000 });
    expect(res.approvalRequired).toBe(true);
    expect(res.status).toBe('proposal_generated');
  });

  it('denies at the kill switch without charging', async () => {
    governance.setKillSwitch('site_safety_supervisor', true);
    const before = (await billing.getTenantBalance('t-kill')).balanceCredits;
    const res = await run('site_safety_supervisor', 't-kill');

    expect(res.status).toBe('rejected_by_policy');
    expect(res.deniedGate).toBe('kill_switch');
    expect(res.creditsConsumed).toBe(0);
    expect((await billing.getTenantBalance('t-kill')).balanceCredits).toBe(before);
  });

  it('denies when a required tool is off the allow-list', async () => {
    governance.setPolicy('procurement_auditor', { allowedTools: [] }); // agent declares fetch_po_matching_data
    const res = await run('procurement_auditor', 't-tool');
    expect(res.status).toBe('rejected_by_policy');
    expect(res.deniedGate).toBe('tool_permission');
    expect(res.creditsConsumed).toBe(0);
  });

  it('denies when the execution price exceeds the spend ceiling', async () => {
    governance.setPolicy('site_safety_supervisor', { creditPrice: 100, maxSpendCreditsPerExecution: 50 });
    const res = await run('site_safety_supervisor', 't-spend');
    expect(res.status).toBe('rejected_by_policy');
    expect(res.deniedGate).toBe('spend_limit');
  });

  it('denies on insufficient budget and leaves the balance untouched', async () => {
    // Drain the tenant down to 1 credit, then try to run a 5-credit agent.
    const start = (await billing.getTenantBalance('t-broke')).balanceCredits;
    await billing.consumeCredits('t-broke', 'drain', start - 1);
    const res = await run('site_safety_supervisor', 't-broke', { valueAmount: 2500 });

    expect(res.status).toBe('rejected_by_policy');
    expect(res.deniedGate).toBe('insufficient_budget');
    expect(res.creditsConsumed).toBe(0);
    expect((await billing.getTenantBalance('t-broke')).balanceCredits).toBe(1);
  });

  it('meters an idempotent replay exactly once', async () => {
    const before = (await billing.getTenantBalance('t-idem')).balanceCredits;
    const first = await run('site_safety_supervisor', 't-idem', { valueAmount: 2500 }, 'EX-2026-000123');
    const second = await run('site_safety_supervisor', 't-idem', { valueAmount: 2500 }, 'EX-2026-000123');

    expect(first.creditsConsumed).toBe(5);
    expect(second.creditsConsumed).toBe(0); // replay is not charged again
    expect(first.executionId).toBe(second.executionId);
    expect((await billing.getTenantBalance('t-idem')).balanceCredits).toBe(before - 5);
  });
});
