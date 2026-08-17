import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { DomainEvent, Document, WorkspaceConfig, WorkspaceMe } from '@aura/shared';
import { apiBase, currentUser, getJson } from '@/lib/api';
import RoleDashboardShell from './role-dashboard-shell';

/**
 * The role-aware Command Center. It carries the workspace `perspective.*` functions
 * (CEO / CFO / PM), which are declared in shared/src/workspace/functions.ts and assigned
 * per role in config.ts — so this composition is the only renderer of a configurable
 * platform capability, and stays routed even though Home is now a suite launcher.
 */

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
export function displayName(sub: string | undefined): string | null {
  if (!sub) return null;
  const base = sub.replace(/^u-/, '').replace(/[-_.]+/g, ' ').trim();
  if (!base) return null;
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AuraWorkspace({ variant }: { variant: 'home' | 'my-work' }) {
  const [user, events, documents, invoices, bankAccounts, projects, pipelineData, ledgers, inbox, me, workspaceConfig] =
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
      getJson<WorkspaceMe>('/api/workspace/me'),
      getJson<WorkspaceConfig>('/api/workspace/config'),
    ]);

  const online = events !== null || documents !== null;

  return (
    <div style={s.shell} data-testid={variant === 'home' ? 'aura-home' : 'my-work'}>
      <header style={s.hero}>
        <div>
          <p style={s.eyebrow}>{variant === 'home' ? 'AURA OS / HOME' : 'AURA OS / MY WORK'}</p>
          <h1 style={s.heroTitle}>{variant === 'home' ? 'One operating view across the business.' : 'Your decisions, priorities and next actions.'}</h1>
          <p style={s.heroCopy}>{variant === 'home' ? 'Start with what needs attention, enter a project, or choose a suite. Every view stays connected to the same records and permissions.' : 'A role-aware command center built from your live inbox, project signals and permitted actions.'}</p>
        </div>
        <nav style={s.heroActions} aria-label={variant === 'home' ? 'Home actions' : 'My Work actions'}>
          {variant === 'home' ? <Link href="/my-work" style={s.primaryAction}>Open My Work</Link> : <Link href="/workspace?tab=inbox" style={s.primaryAction}>Open inbox</Link>}
          <Link href="/projects/projects" style={s.secondaryAction}>Projects</Link>
          <Link href="/suites" style={s.secondaryAction}>All suites</Link>
        </nav>
      </header>
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
          me={me}
          workspaceConfig={workspaceConfig}
        />
      )}

      <footer style={s.footer}>AURA OS · {variant === 'home' ? 'Enterprise Home' : 'My Work'}</footer>
    </div>
  );
}

const s = {
  shell: { maxWidth: 1080, margin: '0 auto', padding: '24px 28px 64px' } as CSSProperties,
  hero: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 22, padding: '20px 0 24px', borderBottom: '1px solid var(--border)', marginBottom: 18, flexWrap: 'wrap' } as CSSProperties,
  eyebrow: { margin: '0 0 7px', color: 'var(--accent)', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' } as CSSProperties,
  heroTitle: { maxWidth: 720, margin: 0, fontSize: 'clamp(26px, 4vw, 40px)', lineHeight: 1.05, letterSpacing: '-0.045em' } as CSSProperties,
  heroCopy: { maxWidth: 720, margin: '10px 0 0', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 } as CSSProperties,
  heroActions: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  primaryAction: { display: 'inline-flex', alignItems: 'center', minHeight: 42, padding: '0 14px', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', textDecoration: 'none', fontSize: 13, fontWeight: 750 } as CSSProperties,
  secondaryAction: { display: 'inline-flex', alignItems: 'center', minHeight: 42, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', textDecoration: 'none', fontSize: 13, fontWeight: 650 } as CSSProperties,
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
