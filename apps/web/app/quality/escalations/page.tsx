import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import QualityEscalationsClient, { type EscalationRow } from '../../../components/quality-escalations-client';

export const dynamic = 'force-dynamic';

/**
 * Quality · Escalations from Testing & Commissioning (TC-08).
 *
 * T&C never raises a non-conformance. When a commissioning defect may be one, T&C escalates it and it
 * lands here; Quality decides — raises the NCR from it, or records that it is not one.
 */
export default async function QualityEscalationsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project = '' } = await searchParams;
  const [projects, rows] = await Promise.all([
    getJson<Array<{ id: string; title: string }>>('/api/projects/projects'),
    project ? getJson<EscalationRow[]>(`/api/quality/escalations?projectId=${encodeURIComponent(project)}`) : Promise.resolve(null),
  ]);
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Escalations from Testing &amp; Commissioning</h1>
      <p style={st.sub}>
        Commissioning defects Testing &amp; Commissioning has asked Quality about. Each is Quality&rsquo;s to decide: raise a
        non-conformance from it — linked back to the defect and its failing test — or record why it is not one. The person
        who escalated it may not decide it, and a decision is final.
      </p>
      <form method="get" style={st.pick}>
        <label style={st.label}>Project
          <select name="project" defaultValue={project} style={st.select} data-testid="escalations-project">
            <option value="">Select a project…</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <button type="submit" style={st.go}>Show</button>
      </form>
      {!project ? null : rows === null ? (
        <p style={st.muted} role="alert">The escalation queue could not be read.</p>
      ) : (
        <QualityEscalationsClient rows={rows} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 16px', maxWidth: 780, lineHeight: 1.5 } as CSSProperties,
  pick: { display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  select: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 280 } as CSSProperties,
  go: { padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  muted: { color: 'var(--muted)' } as CSSProperties,
};
