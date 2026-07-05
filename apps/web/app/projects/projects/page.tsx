import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ProjectCreate, { ProjectEdit } from '../../../components/project-create';

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

import ProjectDetail from '../../../components/project-detail';

interface WbsNode {
  id: string;
  projectId: string;
  parentId: string | null;
  code: string;
  title: string;
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
}

interface EvmMetrics {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  cpi: number;
  spi: number;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;

  // The end of the deal chain: projects from our own API, and the "from contract" options
  // from the Contracts API (status=active) — each active contract carries its account
  // snapshot, so a project inherits the account transitively (Project ← Contract ← … ← CRM).
  const [projects, activeContracts] = await Promise.all([
    getJson<Project[]>('/api/projects/projects'),
    getJson<ActiveContract[]>('/api/contracts/contracts?status=active'),
  ]);

  let selectedProject: Project | null = null;
  let wbsNodes: WbsNode[] = [];
  let evmMetrics: EvmMetrics | null = null;

  if (projectId && projects) {
    selectedProject = projects.find((p) => p.id === projectId) ?? null;
    if (selectedProject) {
      const [nodes, evm] = await Promise.all([
        getJson<WbsNode[]>(`/api/projects/wbs?projectId=${projectId}`),
        getJson<EvmMetrics>(`/api/projects/projects/${projectId}/evm`),
      ]);
      wbsNodes = nodes ?? [];
      evmMetrics = evm;
    }
  }

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Projects</h1>
      <p style={st.sub}>
        Delivery & execution — the final link in the deal chain. A project is started from an{' '}
        <strong>active contract</strong> and inherits its account and value automatically.
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
                {['Title', 'From contract', 'Account', 'Status', 'Value', 'Created', ''].map((h, i) => (
                  <th key={i} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} style={projectId === p.id ? { background: 'rgba(255,255,255,0.03)' } : undefined}>
                  <td style={st.td}>
                    <a href={`/projects/projects?projectId=${p.id}`} style={st.link}>
                      {p.title}
                    </a>
                  </td>
                  <td style={st.tdMuted}>{p.contractTitle ?? '—'}</td>
                  <td style={st.tdMuted}>{p.accountName ?? '—'}</td>
                  <td style={st.td}>
                    <span style={st.tag}>{p.status}</span>
                  </td>
                  <td style={st.td}>{money(p.value)}</td>
                  <td style={st.tdMuted}>{fmt(p.createdAt)}</td>
                  <td style={st.td}>
                    <ProjectEdit project={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selectedProject && evmMetrics && (
        <ProjectDetail
          projectId={selectedProject.id}
          projectTitle={selectedProject.title}
          nodes={wbsNodes}
          evm={evmMetrics}
        />
      )}
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
  link: {
    color: 'var(--accent)',
    textDecoration: 'none',
    fontWeight: 600,
  } as CSSProperties,
};
