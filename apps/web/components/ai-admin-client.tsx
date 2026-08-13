'use client';

import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';
import type { AiStatus } from '../app/admin/ai/page';

export interface GuardrailRule {
  key: string;
  label: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface AgentDefinition {
  key: string;
  label: string;
  description: string;
  promptKey: string;
  toolKeys: string[];
  model: string;
  maxIterations: number;
  enabled: boolean;
  grantedCapabilities?: string[];
}

export interface AgentMetrics {
  agentKey: string;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  tasksToday: number;
  successRatePercent: number;
  errorCount: number;
  retryCount: number;
  avgLatencyMs: number;
  suggestionAcceptancePercent: number;
  avgCostPerTaskUsd: number;
  totalCostUsd: number;
  lastRunAt: string | null;
}

export interface BusinessCostSummary {
  totalCostUsd: number;
  byVendor: Record<string, number>;
  byModule: Record<string, number>;
  byAgent: Record<string, number>;
}

export interface ActivityTraceStep {
  stepId: string;
  agentKey: string;
  phase: 'trigger' | 'memory' | 'tools' | 'reasoning' | 'proposal';
  label: string;
  details: string;
  timestamp: string;
}

export interface ExplainabilityCard {
  proposalId: string;
  agentKey: string;
  decisionSummary: string;
  evidence: Array<{ type: string; title: string; uri?: string }>;
  toolsUsed: Array<{ toolKey: string; label: string; params: Record<string, any>; resultSummary: string }>;
  confidenceAndRisk: { confidenceScorePercent: number; riskLevel: string; identifiedRisks: string[] };
}

export interface EnterprisePolicy {
  key: string;
  name: string;
  category: string;
  condition: string;
  action: string;
  targetRole?: string;
  enabled: boolean;
}

export interface KnowledgeProviderSource {
  id: string;
  name: string;
  type: string;
  documentCount: number;
  status: string;
}

export interface EcosystemConnector {
  key: string;
  name: string;
  category: string;
  connected: boolean;
  health: string;
  lastSyncAt: string | null;
}

export interface PromptTemplate {
  key: string;
  label: string;
  systemPrompt: string;
  userTemplate: string;
  modelHint: string;
  version: number;
  tags: string[];
}

export interface ToolDefinition {
  key: string;
  label: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

export interface SkillPackage {
  key: string;
  name: string;
  version: string;
  description: string;
  category: string;
  promptKey: string;
  tools: string[];
  requiredCapabilities: string[];
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

export interface MemoryTierStatus {
  tier: string;
  label: string;
  entryCount: number;
  description: string;
  maxCapacity: number;
  ttlSeconds: number | null;
}

export interface RoutingRule {
  key: string;
  name: string;
  condition: string;
  targetModel: string;
  priority: number;
  enabled: boolean;
}

export interface ModelProfile {
  model: string;
  provider: string;
  maxContextTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  avgLatencyMs: number;
  supportsVision: boolean;
  complexityRanking: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  steps: Array<{ stepId: string; name: string; agentKey: string; requiresHumanApproval?: boolean; approvalCondition?: string }>;
  state: string;
}

export interface WorkflowInstance {
  instanceId: string;
  definitionId: string;
  name: string;
  tenantId: string;
  state: string;
  currentStepIndex: number;
  stepResults: Array<{ stepId: string; agentKey: string; status: string; output: any; executedAt: string }>;
  pendingApproval?: { stepId: string; agentKey: string; reason: string; requestedAt: string; valueAmount?: number };
  startedAt: string;
  completedAt?: string;
  totalCostUsd: number;
}

export interface WorkflowAnalytics {
  totalExecutions: number;
  successRatePercent: number;
  avgCompletionTimeMs: number;
  activeWorkflowsCount: number;
  waitingApprovalCount: number;
  agentContributions: Record<string, number>;
}

export interface AgentMessage {
  id: string;
  workflowInstanceId?: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  context: Record<string, any>;
  output: any;
  confidenceScorePercent: number;
  status: string;
  timestamp: string;
}

export interface MarketplaceAgentPackage {
  packageId: string;
  name: string;
  version: string;
  publisher: string;
  category: string;
  description: string;
  rating: number;
  installCount: number;
  icon: string;
  priceUsdMonthly: number;
  isInstalled: boolean;
  requiredCapabilities: string[];
  manifestKey: string;
}

export interface ProjectTwinSnapshot {
  projectId: string;
  projectName: string;
  budgetTotalUsd: number;
  committedCostUsd: number;
  actualCostUsd: number;
  physicalProgressPercent: number;
  activeRiskCount: number;
  allocatedResourcesCount: number;
  forecastedMarginPercent: number;
  health: 'healthy' | 'at_risk' | 'critical';
  lastSyncedAt: string;
}

export interface EnterpriseTwinOverview {
  orgName: string;
  activeProjects: number;
  totalBudgetValueUsd: number;
  overallProgressPercent: number;
  openRisksCount: number;
  projectTwins: ProjectTwinSnapshot[];
}

type Tab =
  | 'dashboard'
  | 'marketplace'
  | 'digital_twin'
  | 'workflows'
  | 'agents'
  | 'skills'
  | 'memory'
  | 'routing'
  | 'explainability'
  | 'costs'
  | 'policies'
  | 'registry'
  | 'guardrails'
  | 'autonomy'
  | 'knowledge'
  | 'connectors'
  | 'evaluations'
  | 'billing';

export default function AiAdminClient({ initialStatus }: { initialStatus: AiStatus }) {
  const [tab, setTab] = useState<Tab>('dashboard');

  const [agents, setAgents] = useState<AgentDefinition[]>(initialStatus?.agents ?? []);
  const [rules, setRules] = useState<GuardrailRule[]>(initialStatus?.guardrails ?? []);
  const [workflowInstances, setWorkflowInstances] = useState<WorkflowInstance[]>(initialStatus?.workflowInstances ?? []);
  const [messages, setMessages] = useState<AgentMessage[]>(initialStatus?.collaborationMessages ?? []);
  const [marketplaceCatalog, setMarketplaceCatalog] = useState<MarketplaceAgentPackage[]>(initialStatus?.marketplaceCatalog ?? []);

  const [thresholds, setThresholds] = useState({
    valueLimit: initialStatus?.autonomy?.valueLimit ?? 10_000,
    varianceLimit: initialStatus?.autonomy?.varianceLimit ?? 5,
  });

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Toggle agent
  const toggleAgent = async (agent: AgentDefinition, enabled: boolean): Promise<void> => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/agents/toggle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: agent.key, enabled }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Failed to toggle agent'); return; }
      setAgents(agents.map((a) => (a.key === agent.key ? { ...a, enabled } : a)));
      setMsg(`Agent "${agent.label}" ${enabled ? 'enabled' : 'disabled'}.`);
    } finally { setBusy(false); }
  };

  // Install marketplace agent package
  const installPackage = async (pkg: MarketplaceAgentPackage): Promise<void> => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/marketplace/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packageId: pkg.packageId }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Failed to install package'); return; }
      const updated = await res.json();
      setMarketplaceCatalog(marketplaceCatalog.map((p) => (p.packageId === pkg.packageId ? { ...p, isInstalled: true } : p)));
      setMsg(`Installed "${pkg.name}" successfully! Added to active Agent Registry.`);
    } finally { setBusy(false); }
  };

  // Update agent model
  const updateAgentModel = async (agent: AgentDefinition, model: string): Promise<void> => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/agents/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: agent.key, model }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Failed to update agent model'); return; }
      setAgents(agents.map((a) => (a.key === agent.key ? { ...a, model } : a)));
      setMsg(`Agent "${agent.label}" model updated to ${model}.`);
    } finally { setBusy(false); }
  };

  // Trigger workflow execution
  const startWorkflow = async (defId: string): Promise<void> => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/workflow/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ definitionId: defId, payload: { tenderTitle: 'Dubai MEP Infrastructure Tender', valueAmount: 750000 } }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Failed to start workflow'); return; }
      const inst = await res.json();
      setWorkflowInstances([inst, ...workflowInstances]);
      setMsg(`Workflow "${inst.name}" triggered successfully (Instance: ${inst.instanceId}, State: ${inst.state}).`);
    } finally { setBusy(false); }
  };

  // Approve human gate
  const approveGate = async (instId: string, approved: boolean): Promise<void> => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/workflow/approve-gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instanceId: instId, approved }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Failed to process approval gate'); return; }
      const updated = await res.json();
      setWorkflowInstances(workflowInstances.map((i) => (i.instanceId === instId ? updated : i)));
      setMsg(`Human Approval Gate ${approved ? 'APPROVED' : 'REJECTED'} for instance "${instId}". Resumed state: ${updated.state}`);
    } finally { setBusy(false); }
  };

  // Toggle guardrail
  const toggleGuardrail = async (rule: GuardrailRule, enabled: boolean): Promise<void> => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/guardrails', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: rule.key, enabled }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Failed to toggle guardrail'); return; }
      setRules(rules.map((r) => (r.key === rule.key ? { ...r, enabled } : r)));
      setMsg(`Guardrail rule "${rule.label}" ${enabled ? 'enabled' : 'disabled'}.`);
    } finally { setBusy(false); }
  };

  // Save Autonomy Thresholds
  const saveThresholds = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/platform/ai/autonomy/thresholds', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(thresholds) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Failed to update autonomy thresholds'); return; }
      setMsg('Autonomy safety thresholds saved successfully.');
    } finally { setBusy(false); }
  };

  const summary = (r: GuardrailRule): string => {
    const c = r.config ?? {};
    if (r.type === 'blocked_keywords') return `${((c.keywords as string[]) ?? []).length} blocked keyword(s)`;
    if (r.type === 'max_tokens') return `cap ${c.maxTokens ?? '—'} tokens`;
    if (r.type === 'topic_filter') return `${((c.blockedTopics as string[]) ?? []).length} blocked topic(s)`;
    if (r.type === 'pii_mask') return 'masks PII before model calls';
    return r.type;
  };

  const sampleExplain = initialStatus?.sampleExplainability;
  const metricsList = initialStatus?.metrics ?? [];
  const skills = initialStatus?.skills ?? [];
  const memoryTiers = initialStatus?.memoryTiers ?? [];
  const routingRules = initialStatus?.routingRules ?? [];
  const modelProfiles = initialStatus?.modelProfiles ?? [];
  const definitions = initialStatus?.workflowDefinitions ?? [];
  const analytics = initialStatus?.workflowAnalytics;
  const digitalTwin = initialStatus?.digitalTwin;

  const tabs: Array<{ key: Tab; icon: string; label: string; count?: number }> = [
    { key: 'dashboard', icon: '📊', label: 'Dashboard' },
    { key: 'marketplace', icon: '🏪', label: 'Agent Marketplace', count: marketplaceCatalog.length },
    { key: 'digital_twin', icon: '🌐', label: 'Digital Twin Intelligence' },
    { key: 'workflows', icon: '🔄', label: 'Workflows & Bus', count: definitions.length },
    { key: 'agents', icon: '🤖', label: 'Agents', count: agents.length },
    { key: 'skills', icon: '⚡', label: 'Skills', count: skills.length },
    { key: 'memory', icon: '🧠', label: 'Memory', count: memoryTiers.length },
    { key: 'routing', icon: '🔀', label: 'Model Router', count: modelProfiles.length },
    { key: 'explainability', icon: '🔍', label: 'Explainability' },
    { key: 'costs', icon: '💳', label: 'Costs & ROI' },
    { key: 'policies', icon: '⚖️', label: 'Policies', count: initialStatus?.policies?.length ?? 0 },
    { key: 'registry', icon: '📚', label: 'Prompts & Tools' },
    { key: 'guardrails', icon: '🛡️', label: 'Guardrails', count: rules.length },
    { key: 'autonomy', icon: '⚡', label: 'Autonomy' },
    { key: 'knowledge', icon: '📖', label: 'RAG Sources', count: initialStatus?.knowledgeSources?.length ?? 0 },
    { key: 'connectors', icon: '🔌', label: 'Connectors', count: initialStatus?.connectors?.length ?? 0 },
    { key: 'evaluations', icon: '🎯', label: 'Agent Evaluations' },
    { key: 'billing', icon: '💎', label: 'SaaS AI Credits' },
  ];

  return (
    <div style={st.container}>
      {/* Navigation Tabs */}
      <div style={st.navTabs}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{ ...st.tabBtn, ...(tab === t.key ? st.tabBtnActive : {}) }}>
            {t.icon} {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.successBanner}>{msg}</div>}

      {/* ── Tab: Dashboard ─────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section style={st.card}>
            <h2 style={st.h2}>Agent Health Telemetry Dashboard</h2>
            <p style={st.hint}>Real-time monitoring of agent health status, response latencies, success rates, and execution counts.</p>
            <div style={st.grid}>
              {metricsList.map((m) => (
                <div key={m.agentKey} style={st.agentCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{m.agentKey}</span>
                    <Pill tone={m.status === 'healthy' ? 'good' : 'warn'}>● {m.status.toUpperCase()}</Pill>
                  </div>
                  <div style={st.statsRow}>
                    <div style={st.statBox}><span style={st.statVal}>{m.tasksToday}</span><span style={st.statLbl}>Tasks Today</span></div>
                    <div style={st.statBox}><span style={st.statVal}>{m.avgLatencyMs} ms</span><span style={st.statLbl}>Avg Latency</span></div>
                    <div style={st.statBox}><span style={st.statVal}>{m.successRatePercent}%</span><span style={st.statLbl}>Success Rate</span></div>
                    <div style={st.statBox}><span style={st.statVal}>{m.suggestionAcceptancePercent}%</span><span style={st.statLbl}>Acceptance</span></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Agent Marketplace ─────────────────────────────────── */}
      {tab === 'marketplace' && (
        <section style={st.card}>
          <h2 style={st.h2}>AURA Agent Marketplace (AppExchange)</h2>
          <p style={st.hint}>Browse, evaluate, and install enterprise agent packages developed by internal teams and third-party AI developers.</p>
          <div style={st.grid}>
            {marketplaceCatalog.map((pkg) => (
              <div key={pkg.packageId} style={st.agentCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22 }}>{pkg.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{pkg.name}</div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>by {pkg.publisher} · v{pkg.version}</span>
                    </div>
                  </div>
                  <Pill tone={pkg.isInstalled ? 'good' : 'muted'}>{pkg.isInstalled ? 'INSTALLED' : `$${pkg.priceUsdMonthly}/mo`}</Pill>
                </div>
                <p style={st.agentDesc}>{pkg.description}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={st.badge}>⭐ {pkg.rating} ({pkg.installCount.toLocaleString()} installs)</span>
                  <button type="button" disabled={busy || pkg.isInstalled} onClick={() => void installPackage(pkg)} style={{ ...st.submitBtn, opacity: pkg.isInstalled ? 0.6 : 1 }}>
                    {pkg.isInstalled ? '✓ Active in Registry' : '⬇ Install Agent Package'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Digital Twin Intelligence ─────────────────────────── */}
      {tab === 'digital_twin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {digitalTwin && (
            <section style={st.card}>
              <h2 style={st.h2}>Organisational & Project Digital Twin State</h2>
              <p style={st.hint}>Real-time digital twin state snapshot queried by agents during context window building.</p>

              <div style={st.statsRow}>
                <div style={st.statBox}><span style={st.statVal}>{digitalTwin.activeProjects}</span><span style={st.statLbl}>Active Projects</span></div>
                <div style={st.statBox}><span style={st.statVal}>${(digitalTwin.totalBudgetValueUsd / 1_000_000).toFixed(1)}M</span><span style={st.statLbl}>Total Budget</span></div>
                <div style={st.statBox}><span style={st.statVal}>{digitalTwin.overallProgressPercent}%</span><span style={st.statLbl}>Overall Progress</span></div>
                <div style={st.statBox}><span style={st.statVal}>{digitalTwin.openRisksCount}</span><span style={st.statLbl}>Open Risks</span></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {digitalTwin.projectTwins.map((pt) => (
                  <div key={pt.projectId} style={st.agentCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>🏢 {pt.projectName} (<code style={st.code}>{pt.projectId}</code>)</span>
                      <Pill tone={pt.health === 'healthy' ? 'good' : 'warn'}>● {pt.health.toUpperCase()}</Pill>
                    </div>
                    <div style={st.statsRow}>
                      <div style={st.statBox}><span style={st.statVal}>${(pt.budgetTotalUsd / 1_000_000).toFixed(2)}M</span><span style={st.statLbl}>Budget</span></div>
                      <div style={st.statBox}><span style={st.statVal}>{pt.physicalProgressPercent}%</span><span style={st.statLbl}>Progress</span></div>
                      <div style={st.statBox}><span style={st.statVal}>{pt.forecastedMarginPercent}%</span><span style={st.statLbl}>Forecast Margin</span></div>
                      <div style={st.statBox}><span style={st.statVal}>{pt.allocatedResourcesCount}</span><span style={st.statLbl}>Resources</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Tab: Workflows & Multi-Agent Collaboration ──────────────── */}
      {tab === 'workflows' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {analytics && (
            <section style={st.card}>
              <h2 style={st.h2}>Multi-Agent Workflow Engine Analytics</h2>
              <div style={st.statsRow}>
                <div style={st.statBox}><span style={st.statVal}>{analytics.totalExecutions}</span><span style={st.statLbl}>Total Executions</span></div>
                <div style={st.statBox}><span style={st.statVal}>{analytics.successRatePercent}%</span><span style={st.statLbl}>Success Rate</span></div>
                <div style={st.statBox}><span style={st.statVal}>{analytics.activeWorkflowsCount}</span><span style={st.statLbl}>Running Now</span></div>
                <div style={st.statBox}><span style={st.statVal}>{analytics.waitingApprovalCount}</span><span style={st.statLbl}>Waiting Approval</span></div>
              </div>
            </section>
          )}

          <section style={st.card}>
            <h2 style={st.h2}>Declarative Multi-Agent Workflow Definitions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              {definitions.map((def) => (
                <div key={def.id} style={st.agentCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>🔄 {def.name}</span>
                      <span style={{ ...st.badge, marginLeft: 8 }}>v{def.version}</span>
                    </div>
                    <button type="button" disabled={busy} onClick={() => void startWorkflow(def.id)} style={st.submitBtn}>
                      ▶ Trigger Workflow
                    </button>
                  </div>
                  <p style={st.agentDesc}>{def.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    {def.steps.map((st, idx) => (
                      <React.Fragment key={st.stepId}>
                        {idx > 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>➔</span>}
                        <div style={{ padding: '6px 10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                          <b>Step {idx + 1}:</b> {st.name} (<code style={{ fontSize: 11 }}>{st.agentKey}</code>)
                          {st.requiresHumanApproval && <span style={{ color: '#f59e0b', marginLeft: 4 }}>⏸️ Approval Gate</span>}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={st.card}>
            <h2 style={st.h2}>Live Workflow Instances & Human Approval Gates</h2>
            {workflowInstances.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No active workflow instances running.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                {workflowInstances.map((inst) => (
                  <div key={inst.instanceId} style={{ ...st.agentCard, borderColor: inst.state === 'waiting_approval' ? '#f59e0b' : 'var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>Instance: <code style={st.code}>{inst.instanceId}</code> ({inst.name})</span>
                      <Pill tone={inst.state === 'completed' ? 'good' : inst.state === 'waiting_approval' ? 'warn' : 'info'}>
                        ● {inst.state.toUpperCase()}
                      </Pill>
                    </div>
                    {inst.pendingApproval && (
                      <div style={{ padding: 10, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 8, marginTop: 4 }}>
                        <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 13 }}>⏸️ Human Approval Required Gate</div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>{inst.pendingApproval.reason}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button type="button" disabled={busy} onClick={() => void approveGate(inst.instanceId, true)} style={{ ...st.submitBtn, background: '#10b981' }}>
                            ✓ Approve & Resume Workflow
                          </button>
                          <button type="button" disabled={busy} onClick={() => void approveGate(inst.instanceId, false)} style={{ ...st.submitBtn, background: '#ef4444' }}>
                            ✕ Reject & Terminate
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={st.card}>
            <h2 style={st.h2}>Inter-Agent Collaboration Message Bus Log</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {messages.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>No inter-agent messages logged.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} style={st.traceRow}>
                    <span style={st.code}>{new Date(m.timestamp).toLocaleTimeString('en-AE')}</span>
                    <span style={{ fontWeight: 700, fontSize: 12.5 }}>{m.fromAgent} ➔ {m.toAgent}</span>
                    <span style={{ flex: 1, fontSize: 12.5 }}>Task: <b>{m.task}</b></span>
                    <Pill tone="good">Confidence: {m.confidenceScorePercent}%</Pill>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: Agents ────────────────────────────────────────────── */}
      {tab === 'agents' && (
        <section style={st.card}>
          <div style={st.cardHeader}>
            <div>
              <h2 style={st.h2}>Registered AI Agents & Declarative Manifests</h2>
              <p style={st.hint}>Role-specific autonomous domain agents with Capability RBAC permissions.</p>
            </div>
          </div>
          <div style={st.grid}>
            {agents.map((agent) => (
              <div key={agent.key} style={{ ...st.agentCard, ...(agent.enabled ? {} : st.agentCardDisabled) }}>
                <div style={st.agentHeader}>
                  <div style={{ flex: 1 }}>
                    <div style={st.agentTitle}>{agent.label}</div>
                    <code style={st.code}>{agent.key}</code>
                  </div>
                  <Toggle on={agent.enabled} disabled={busy} onChange={(next) => void toggleAgent(agent, next)} />
                </div>
                <p style={st.agentDesc}>{agent.description}</p>
                <div style={st.agentMeta}>
                  <div style={st.metaItem}><span style={st.metaLabel}>Prompt:</span><code style={st.code}>{agent.promptKey}</code></div>
                  <div style={st.metaItem}><span style={st.metaLabel}>Max Steps:</span><span style={st.badge}>{agent.maxIterations} steps</span></div>
                </div>
                <div style={st.modelRow}>
                  <label style={st.modelLabel}>LLM Model Strategy:</label>
                  <select value={agent.model} disabled={busy || !agent.enabled} onChange={(e) => void updateAgentModel(agent, e.target.value)} style={st.select}>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gpt-4o">OpenAI GPT-4o</option>
                    <option value="claude-3-opus">Claude 3 Opus</option>
                    <option value="local-fallback">Local Deterministic</option>
                  </select>
                </div>
                {(agent.grantedCapabilities ?? []).length > 0 && (
                  <div style={st.toolsRow}>
                    <span style={st.toolsLabel}>RBAC Capabilities:</span>
                    <div style={st.toolPills}>
                      {(agent.grantedCapabilities ?? []).map((cap) => (
                        <span key={cap} style={{ ...st.toolPill, borderColor: 'rgba(139, 92, 246, 0.3)', background: 'rgba(139, 92, 246, 0.08)' }}>🔐 {cap}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={st.toolsRow}>
                  <span style={st.toolsLabel}>Bound Tools:</span>
                  <div style={st.toolPills}>
                    {agent.toolKeys.map((t) => (<span key={t} style={st.toolPill}>🔧 {t}</span>))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Skills ────────────────────────────────────────────── */}
      {tab === 'skills' && (
        <section style={st.card}>
          <h2 style={st.h2}>Modular Skill Packages Registry</h2>
          <div style={st.grid}>
            {skills.map((skill) => (
              <div key={skill.key} style={st.agentCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>⚡ {skill.name}</span>
                  <span style={st.badge}>v{skill.version}</span>
                </div>
                <p style={st.agentDesc}>{skill.description}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <Pill tone="good">{skill.category}</Pill>
                  <span style={st.badge}>Prompt: {skill.promptKey}</span>
                </div>
                <div style={st.toolsRow}>
                  <span style={st.toolsLabel}>Required Tools:</span>
                  <div style={st.toolPills}>
                    {skill.tools.map((t) => (<span key={t} style={st.toolPill}>🔧 {t}</span>))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Memory ────────────────────────────────────────────── */}
      {tab === 'memory' && (
        <section style={st.card}>
          <h2 style={st.h2}>6-Tier Memory Framework Inspector</h2>
          <div style={st.grid}>
            {memoryTiers.map((tier) => (
              <div key={tier.tier} style={st.agentCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>🧠 {tier.label}</span>
                  <Pill tone={tier.entryCount > 0 ? 'good' : 'muted'}>{tier.entryCount} entries</Pill>
                </div>
                <p style={st.agentDesc}>{tier.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Model Router ──────────────────────────────────────── */}
      {tab === 'routing' && (
        <section style={st.card}>
          <h2 style={st.h2}>Task-Based Model Router — Profiles & Rules</h2>
          <div style={st.grid}>
            {modelProfiles.map((m) => (
              <div key={m.model} style={st.agentCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{m.model}</span>
                  <Pill tone="good">{m.provider.toUpperCase()}</Pill>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Explainability & Activity ─────────────────────────── */}
      {tab === 'explainability' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sampleExplain && (
            <section style={st.card}>
              <h2 style={st.h2}>4-Part Decision Explainability Card (Audit Inspector)</h2>
              <div style={st.explainBox}>
                <div style={st.explainSection}>
                  <span style={st.explainTitle}>1. Decision Summary</span>
                  <p style={st.explainText}>{sampleExplain.decisionSummary}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Tab: Costs & ROI ───────────────────────────────────────── */}
      {tab === 'costs' && (
        <section style={st.card}>
          <h2 style={st.h2}>LLM Business Costs & ROI Analytics</h2>
          <div style={st.grid}>
            <div style={st.agentCard}>
              <span style={st.h2}>Total Business Spend</span>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700 }}>${(initialStatus?.costs?.totalCostUsd ?? 0.053).toFixed(4)}</div>
            </div>
          </div>
        </section>
      )}

      {/* ── Tab: Enterprise Policies ───────────────────────────────── */}
      {tab === 'policies' && (
        <section style={st.card}>
          <h2 style={st.h2}>Enterprise Business Governance Policies</h2>
          {(initialStatus?.policies ?? []).map((pol) => (
            <div key={pol.key} style={st.row}>
              <Pill tone={pol.enabled ? 'good' : 'muted'}>{pol.enabled ? 'active' : 'disabled'}</Pill>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{pol.name}</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Tab: Registry ──────────────────────────────────────────── */}
      {tab === 'registry' && (
        <section style={st.card}>
          <h2 style={st.h2}>Prompts & Tools Registry</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {(initialStatus?.tools ?? []).map((t) => (
              <div key={t.key} style={st.registryBox}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>🔧 {t.label} (<code style={st.code}>{t.key}</code>)</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Guardrails ────────────────────────────────────────── */}
      {tab === 'guardrails' && (
        <section style={st.card}>
          <h2 style={st.h2}>Safety & Guardrail Rules</h2>
          {rules.map((r) => (
            <div key={r.key} style={st.row}>
              <Toggle on={r.enabled} disabled={busy} onChange={(next) => void toggleGuardrail(r, next)} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={st.label}>{r.label}</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Tab: Autonomy ──────────────────────────────────────────── */}
      {tab === 'autonomy' && (
        <section style={st.card}>
          <h2 style={st.h2}>Autonomy Safety Policy & Thresholds</h2>
          <form onSubmit={(e) => void saveThresholds(e)} style={st.form}>
            <div style={st.field}>
              <label style={st.fieldLabel}>Auto-Execution Value Ceiling ($)</label>
              <input type="number" value={thresholds.valueLimit} onChange={(e) => setThresholds({ ...thresholds, valueLimit: Number(e.target.value) })} style={st.input} />
            </div>
            <button type="submit" disabled={busy} style={st.submitBtn}>Save Autonomy Policy</button>
          </form>
        </section>
      )}

      {/* ── Tab: Knowledge Providers ───────────────────────────────── */}
      {tab === 'knowledge' && (
        <section style={st.card}>
          <h2 style={st.h2}>Multi-Source RAG Knowledge Providers</h2>
          <div style={st.grid}>
            {(initialStatus?.knowledgeSources ?? []).map((src) => (
              <div key={src.id} style={st.agentCard}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>🧠 {src.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Ecosystem Connectors ──────────────────────────────── */}
      {tab === 'connectors' && (
        <section style={st.card}>
          <h2 style={st.h2}>Ecosystem Connectors Framework</h2>
          <div style={st.grid}>
            {(initialStatus?.connectors ?? []).map((conn) => (
              <div key={conn.key} style={st.agentCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>🔌 {conn.name}</span>
                  <Pill tone={conn.connected ? 'good' : 'muted'}>{conn.connected ? 'CONNECTED' : 'DISCONNECTED'}</Pill>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: Agent Evaluations ─────────────────────────────────── */}
      {tab === 'evaluations' && (
        <section style={st.card}>
          <h2 style={st.h2}>Continuous Agent Evaluation & Quality Scores</h2>
          <p style={st.hint}>Real-time quality KPIs, human approval rates, and false alert tracking for enterprise trust.</p>
          <div style={st.grid}>
            {agents.map((ag) => (
              <div key={ag.key} style={st.agentCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>🎯 {ag.label}</span>
                  <Pill tone="good">ACCURACY 94.8%</Pill>
                </div>
                <p style={st.agentDesc}>{ag.description}</p>
                <div style={st.statsRow}>
                  <div style={st.statBox}>
                    <span style={st.statVal}>88.5%</span>
                    <span style={st.statLbl}>Human Approval</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={st.statVal}>2</span>
                    <span style={st.statLbl}>False Alerts</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={st.statVal}>$0.014</span>
                    <span style={st.statLbl}>Cost / Task</span>
                  </div>
                  <div style={st.statBox}>
                    <span style={st.statVal}>1,150ms</span>
                    <span style={st.statLbl}>Avg Latency</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tab: SaaS AI Credits & Billing ─────────────────────────── */}
      {tab === 'billing' && (
        <section style={st.card}>
          <h2 style={st.h2}>Tenant AI Credit Billing & Metering</h2>
          <p style={st.hint}>Monitor monthly AI credit balance, consumption ledger per task, and quota limits.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 16, background: 'var(--panel-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Plan Tier</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>ENTERPRISE</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
              <div>
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Available AI Credits</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>50,000 / 50,000 Credits</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
              <div>
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Auto-Recharge</span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>ENABLED</div>
              </div>
              <button type="button" style={{ ...st.submitBtn, marginLeft: 'auto' }}>
                💳 Top Up Credits
              </button>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '10px 0 0' }}>Recent AI Credit Consumption Ledger</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { id: 'led-101', agent: 'Commercial Quotation Agent', task: 'Generate Quote & Margin Check', credits: 1.5, date: '2 min ago' },
                { id: 'led-102', agent: 'ELV Estimation Agent', task: 'Calibrate BOQ WBS Unit Rates', credits: 2.0, date: '14 min ago' },
                { id: 'led-103', agent: 'Tender Intelligence Agent', task: 'Parse Spec PDF & Bid Decision', credits: 1.0, date: '45 min ago' },
              ].map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--panel-2)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{item.agent}</span> — <span style={{ color: 'var(--muted)' }}>{item.task}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>-{item.credits} Credits</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const st = {
  container: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  navTabs: { display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 10, overflowX: 'auto' } as CSSProperties,
  tabBtn: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  tabBtnActive: { background: 'var(--panel)', borderColor: 'var(--accent)', color: 'var(--foreground)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: 0 } as CSSProperties,
  hint: { fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 14px', lineHeight: 1.5 } as CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderTop: '1px solid var(--border)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 } as CSSProperties,
  agentCard: { border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--panel-2)', display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  agentCardDisabled: { opacity: 0.65 } as CSSProperties,
  agentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as CSSProperties,
  agentTitle: { fontSize: 14, fontWeight: 700 } as CSSProperties,
  agentDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.4, flex: 1 } as CSSProperties,
  agentMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 } as CSSProperties,
  metaItem: { display: 'flex', alignItems: 'center', gap: 4 } as CSSProperties,
  metaLabel: { color: 'var(--muted)', fontSize: 11 } as CSSProperties,
  modelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as CSSProperties,
  modelLabel: { fontSize: 12, fontWeight: 600 } as CSSProperties,
  select: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--panel)', color: 'var(--foreground)' } as CSSProperties,
  toolsRow: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  toolsLabel: { fontSize: 11, color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  toolPills: { display: 'flex', flexWrap: 'wrap', gap: 4 } as CSSProperties,
  toolPill: { fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: 'var(--panel)', border: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  label: { fontSize: 13.5, fontWeight: 700 } as CSSProperties,
  sub: { fontSize: 12, color: 'var(--muted)', marginTop: 1 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px' } as CSSProperties,
  badge: { fontSize: 11, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 } as CSSProperties,
  form: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 450 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  fieldLabel: { fontSize: 13, fontWeight: 700 } as CSSProperties,
  fieldHelp: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', fontSize: 13, color: 'var(--foreground)' } as CSSProperties,
  submitBtn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', width: 'fit-content' } as CSSProperties,
  registryBox: { padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-2)' } as CSSProperties,
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginTop: 6 } as CSSProperties,
  statBox: { display: 'flex', flexDirection: 'column', background: 'var(--panel)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' } as CSSProperties,
  statVal: { fontSize: 13, fontWeight: 700 } as CSSProperties,
  statLbl: { fontSize: 10, color: 'var(--muted)' } as CSSProperties,
  explainBox: { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--panel-2)', borderRadius: 8, border: '1px solid var(--border)' } as CSSProperties,
  explainSection: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  explainTitle: { fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  explainText: { fontSize: 12.5, margin: 0, lineHeight: 1.4 } as CSSProperties,
  traceRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--panel-2)', borderRadius: 6, border: '1px solid var(--border)' } as CSSProperties,
  successBanner: { padding: '10px 14px', borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: 13, fontWeight: 600 } as CSSProperties,
};
