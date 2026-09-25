import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import EngineeringCorrectionsClient, { type RoutedDefect } from '../../../components/engineering-corrections-client';

export const dynamic = 'force-dynamic';

/**
 * Engineering · Commissioning corrections (TC-08).
 *
 * The commissioning defects Testing & Commissioning routed to this engineer for a design correction.
 * The engineer records what changed; T&C retests and closes. Nothing else of commissioning is done here.
 */
export default async function EngineeringCorrectionsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project = '' } = await searchParams;
  const [projects, defects] = await Promise.all([
    getJson<Array<{ id: string; title: string }>>('/api/projects/projects'),
    project ? getJson<RoutedDefect[]>(`/api/commissioning/records/engineering-corrections?projectId=${encodeURIComponent(project)}`) : Promise.resolve(null),
  ]);
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Engineering · Commissioning corrections</h1>
      <p style={st.sub}>
        Defects Testing &amp; Commissioning routed to you because the design has to change. Record what was changed and the
        revised drawing or RFI it rests on; T&amp;C retests the system and closes the defect.
      </p>
      <form method="get" style={st.pick}>
        <label style={st.label}>Project
          <select name="project" defaultValue={project} style={st.select} data-testid="corrections-project">
            <option value="">Select a project…</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <button type="submit" style={st.go}>Show</button>
      </form>
      {!project ? null : defects === null ? (
        <p style={st.muted} role="alert">The corrections routed to you could not be read.</p>
      ) : (
        <EngineeringCorrectionsClient defects={defects} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 16px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  pick: { display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  select: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 280 } as CSSProperties,
  go: { padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  muted: { color: 'var(--muted)' } as CSSProperties,
};
