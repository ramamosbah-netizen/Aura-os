import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import { AdminCard, AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import AiAdminClient, { type GuardrailRule } from '@/components/ai-admin-client';

export const dynamic = 'force-dynamic';

interface AiStatus {
  provider: string;
  keyConfigured: boolean;
  guardrails: GuardrailRule[];
  autonomy: { pending: number; total: number };
}

// Admin Center phase 2 (Vol 15 §2.7): AI administration — the provider seam,
// guardrail toggles, and the autonomy queue at a glance. Deep IEC work
// (calibrations, proposals) stays on /admin/intelligence.
export default async function AiAdminPage() {
  const status = await getJson<AiStatus>('/api/admin/platform/ai');

  if (status === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="AI Administration" glyph="🤖" backToHub subtitle="Provider seam, guardrails, and autonomy scope." />
        <AdminOffline label="Platform" />
      </div>
    );
  }

  const enforcing = status.guardrails.filter((g) => g.enabled).length;
  const kpis: Kpi[] = [
    {
      label: 'Provider',
      value: status.provider,
      sub: status.keyConfigured ? 'ANTHROPIC_API_KEY configured' : 'local fallback — no model calls',
      tone: status.keyConfigured ? 'good' : 'warn',
    },
    { label: 'Guardrails', value: `${enforcing}/${status.guardrails.length}`, sub: 'rules enforcing', tone: enforcing ? 'accent' : 'warn' },
    {
      label: 'Autonomy Queue',
      value: status.autonomy.pending,
      sub: `${status.autonomy.total} proposal(s) total`,
      tone: status.autonomy.pending ? 'info' : 'good',
    },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="AI Administration"
        glyph="🤖"
        backToHub
        subtitle="The platform AI seam: which provider answers, what the guardrails block, and how much autonomy is waiting on human approval."
        kpis={kpis}
      />

      <AdminCard
        title="Provider seam"
        desc="Claude answers when ANTHROPIC_API_KEY is set; otherwise a deterministic local fallback keeps every AI feature functional (degraded but working). Keys are env-only — never stored or shown here."
      >
        <p style={st.providerLine}>
          Active provider: <b style={{ textTransform: 'capitalize' }}>{status.provider}</b>
          {' · '}
          <a href="/admin/intelligence" style={{ fontWeight: 700 }}>Open the Intelligence Console →</a>
          <span style={{ color: 'var(--muted)' }}> (calibrations, pricing sources, autonomy proposals)</span>
        </p>
      </AdminCard>

      <AiAdminClient initialRules={status.guardrails} />
    </div>
  );
}

const st = {
  providerLine: { fontSize: 13.5, margin: 0, lineHeight: 1.6 } as CSSProperties,
};
