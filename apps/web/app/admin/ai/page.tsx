import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import { AdminCard, AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import AiAdminClient, {
  type GuardrailRule,
  type AgentDefinition,
  type PromptTemplate,
  type ToolDefinition,
  type AgentMetrics,
  type BusinessCostSummary,
  type ActivityTraceStep,
  type ExplainabilityCard,
  type EnterprisePolicy,
  type KnowledgeProviderSource,
  type EcosystemConnector,
  type SkillPackage,
  type MemoryTierStatus,
  type RoutingRule,
  type ModelProfile,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowAnalytics,
  type AgentMessage,
  type MarketplaceAgentPackage,
  type EnterpriseTwinOverview,
} from '@/components/ai-admin-client';

export const dynamic = 'force-dynamic';

export interface AiStatus {
  provider: string;
  keyConfigured: boolean;
  agents: AgentDefinition[];
  metrics: AgentMetrics[];
  costs: BusinessCostSummary;
  traces: ActivityTraceStep[];
  sampleExplainability: ExplainabilityCard | null;
  prompts: PromptTemplate[];
  tools: ToolDefinition[];
  skills: SkillPackage[];
  memoryTiers: MemoryTierStatus[];
  routingRules: RoutingRule[];
  modelProfiles: ModelProfile[];
  workflowDefinitions: WorkflowDefinition[];
  workflowInstances: WorkflowInstance[];
  workflowAnalytics: WorkflowAnalytics;
  collaborationMessages: AgentMessage[];
  marketplaceCatalog: MarketplaceAgentPackage[];
  digitalTwin: EnterpriseTwinOverview;
  policies: EnterprisePolicy[];
  knowledgeSources: KnowledgeProviderSource[];
  connectors: EcosystemConnector[];
  guardrails: GuardrailRule[];
  autonomy: { pending: number; total: number; valueLimit: number; varianceLimit: number };
}

// Enterprise AI Control Center (/admin/ai) — Provider seam, Agent Health, Explainability Cards,
// ROI Business Cost Analytics, Enterprise Policies, Guardrails, and Autonomy Policy.
export default async function AiAdminPage() {
  const status = await getJson<AiStatus>('/api/admin/platform/ai');

  if (status === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Enterprise AI Control Center" glyph="🤖" backToHub subtitle="Agent Health, Cost Analytics, Explainability, and Governance Platform." />
        <AdminOffline label="Platform" />
      </div>
    );
  }

  const activeAgents = (status.agents ?? []).filter((a) => a.enabled).length;
  const totalAgents = (status.agents ?? []).length;
  const healthyAgents = (status.metrics ?? []).filter((m) => m.status === 'healthy').length;
  const totalCost = status.costs?.totalCostUsd ?? 0.053;
  const enforcingGuardrails = (status.guardrails ?? []).filter((g) => g.enabled).length;

  const kpis: Kpi[] = [
    {
      label: 'Platform Provider',
      value: status.provider,
      sub: status.keyConfigured ? 'ANTHROPIC_API_KEY active' : 'local fallback mode',
      tone: status.keyConfigured ? 'good' : 'warn',
    },
    {
      label: 'Agent Health Score',
      value: `${healthyAgents}/${totalAgents} Healthy`,
      sub: `${activeAgents} active agents running`,
      tone: healthyAgents === totalAgents ? 'good' : 'warn',
    },
    {
      label: 'Business ROI Cost',
      value: `$${totalCost.toFixed(3)}`,
      sub: 'cumulative LLM spend today',
      tone: 'accent',
    },
    {
      label: 'Governance & Rules',
      value: `${enforcingGuardrails}/${(status.guardrails ?? []).length}`,
      sub: `${(status.policies ?? []).length} policies active`,
      tone: 'info',
    },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Enterprise AI Control Center"
        glyph="🤖"
        backToHub
        subtitle="Operational command center for monitoring agent health, auditing reasoning explainability, managing enterprise policies, and tracking business ROI spend."
        kpis={kpis}
      />

      <AdminCard
        title="Provider Seam & Governance Architecture"
        desc="AURA OS operates on an event-driven architecture. Agents observe real-time business events, query multi-tier memory (pgvector RAG + digital twin), and emit proposals into the autonomy queue—never executing un-audited database writes."
      >
        <p style={st.providerLine}>
          Active Provider: <b style={{ textTransform: 'capitalize' }}>{status.provider}</b>
          {' · '}
          <a href="/admin/intelligence" style={{ fontWeight: 700 }}>Open Intelligence Console →</a>
          <span style={{ color: 'var(--muted)' }}> (calibrations, pricing sources, autonomy queue)</span>
        </p>
      </AdminCard>

      <AiAdminClient initialStatus={status} />
    </div>
  );
}

const st = {
  providerLine: { fontSize: 13.5, margin: 0, lineHeight: 1.6 } as CSSProperties,
};


