import type { CSSProperties } from 'react';
import type { DomainEvent, Document } from '@aura/shared';
import { apiBase, currentUser, getJson } from '@/lib/api';
import RoleDashboardShell from '../components/role-dashboard-shell';

export const dynamic = 'force-dynamic';

interface Invoice {
  id: string;
  title: string;
  poTitle: string | null;
  projectName: string | null;
  status: string;
  value: number;
}

interface BankAccount {
  id: string;
  code: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  code: string;
}

interface Pipeline {
  funnel: {
    accounts: number;
    tenders: number;
    contracts: number;
    projects: number;
    tenderValue: number;
    contractValue: number;
    projectValue: number;
  };
  winRate: number | null;
}

interface ProjectLedger {
  projectId: string;
  projectName: string | null;
  budget: number;
  committed: number;
  invoiced: number;
  variance: number;
}

interface InboxItem {
  id: string;
  module: string;
  kind: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  value: number | null;
  createdAt: string | null;
}

/** Turn a session subject like "u-admin" into a friendly display name. */
function displayName(sub: string | undefined): string | null {
  if (!sub) return null;
  const base = sub.replace(/^u-/, '').replace(/[-_.]+/g, ' ').trim();
  if (!base) return null;
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function WorkspacePage() {
  const [user, events, documents, invoices, bankAccounts, projects, pipelineData, ledgers, inbox] =
    await Promise.all([
      currentUser(),
      getJson<DomainEvent[]>('/api/events'),
      getJson<Document[]>('/api/documents'),
      getJson<Invoice[]>('/api/finance/invoices'),
      getJson<BankAccount[]>('/api/finance/accounts?type=asset'),
      getJson<Project[]>('/api/projects/projects'),
      getJson<Pipeline>('/api/intelligence/pipeline'),
      getJson<ProjectLedger[]>('/api/intelligence/projects'),
      getJson<InboxItem[]>('/api/inbox'),
    ]);

  const online = events !== null || documents !== null;

  return (
    <div style={s.shell}>
      {!online ? (
        <section style={s.panel}>
          <h1 style={s.h1}>Command Center</h1>
          <h2 style={s.panelTitle}>API offline</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Start the API to populate the Command Center:
            <br />
            <code style={s.code}>pnpm --filter @aura/api start</code> (expected at{' '}
            <code style={s.code}>{apiBase()}</code>)
          </p>
        </section>
      ) : (
        <RoleDashboardShell
          events={events}
          documents={documents}
          invoices={invoices ?? []}
          bankAccounts={bankAccounts ?? []}
          projects={projects ?? []}
          funnel={pipelineData?.funnel ?? null}
          winRate={pipelineData?.winRate ?? null}
          ledgers={ledgers ?? []}
          inbox={inbox ?? []}
          userName={displayName(user?.sub)}
        />
      )}

      <footer style={s.footer}>AURA OS · Enterprise Command Center</footer>
    </div>
  );
}

const s = {
  shell: { maxWidth: 1080, margin: '0 auto', padding: '24px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 12px', letterSpacing: -0.5 } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  } as CSSProperties,
  panelTitle: { fontSize: 15, margin: '0 0 12px', color: 'var(--text)' } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 6px',
  } as CSSProperties,
  footer: { marginTop: 40, color: 'var(--muted)', fontSize: 12, textAlign: 'center' } as CSSProperties,
};
