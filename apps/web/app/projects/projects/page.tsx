import type { CSSProperties } from 'react';
import { getJson } from '../../../lib/api';
import ProjectCreate from '../../../components/project-create';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
  contractTitle: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface ActiveContract {
  id: string;
  title: string;
  accountId: string | null;
  accountName: string | null;
  value: number;
}

function money(n: number): string {
  return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default async function ProjectsPage() {
  // The end of the deal chain: projects from our own API, and the "from contract" options
  // from the Contracts API (status=active) — each active contract carries its account
  // snapshot, so a project inherits the account transitively (Project ← Contract ← … ← CRM).
  const [projects, activeContracts] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<ActiveContract[]>('/api/contracts/contracts?status=active'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Projects</h1>
      <p style={st.sub}>
        Delivery & execution — the final link in the deal chain. A project is started from an{' '}
        <strong>active contract</strong>, inheriting its account + value, and emits{' '}
        <code style={st.code}>projects.project.created</code> on the spine.
      </p>

      <ProjectCreate
        contracts={(activeContracts ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          accountId: c.accountId,
          accountName: c.accountName,
          value: c.value,
        }))}
      />

      <section style={st.panel}>
        {projects === null ? (
          <p style={st.muted}>API offline.</p>
        ) : projects.length === 0 ? (
          <p style={st.muted}>No projects yet — start one from an active contract above.</p>
        ) : (
          <table style={st.table}>
            <thead>
              <tr>
                {['Title', 'From contract', 'Account', 'Status', 'Value', 'Created'].map((h) => (
                  <th key={h} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td style={st.td}>{p.title}</td>
                  <td style={st.tdMuted}>{p.contractTitle ?? '—'}</td>
                  <td style={st.tdMuted}>{p.accountName ?? '—'}</td>
                  <td style={st.td}>
                    <span style={st.tag}>{p.status}</span>
                  </td>
                  <td style={st.td}>{money(p.value)}</td>
                  <td style={st.tdMuted}>{fmt(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 660, lineHeight: 1.5 } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
  } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tag: {
    fontSize: 12,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
    textTransform: 'capitalize',
  } as CSSProperties,
};
