import type { CSSProperties } from 'react';
import type { DomainEvent, Document } from '@aura/shared';
import { apiBase, getJson } from '@/lib/api';
import RoleDashboardShell from '../components/role-dashboard-shell';

export const dynamic = 'force-dynamic';

interface PurchaseRequest {
  id: string;
  title: string;
  reference: string | null;
  projectName: string | null;
  status: 'draft' | 'approved' | 'rejected';
  value: number;
}

interface Invoice {
  id: string;
  title: string;
  poTitle: string | null;
  projectName: string | null;
  status: string;
  value: number;
}

interface Subcontract {
  id: string;
  title: string;
  subcontractorName: string;
  projectName: string | null;
  status: string;
  value: number;
}

interface Claim {
  id: string;
  subcontractId: string;
  workCompletedValue: number;
  certifiedValue: number | null;
  status: string;
  createdAt: string;
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

export default async function WorkspacePage() {
  const [
    events,
    documents,
    purchaseRequests,
    invoices,
    subcontracts,
    claims,
    bankAccounts,
    projects,
    pipelineData,
    ledgers,
  ] = await Promise.all([
    getJson<DomainEvent[]>('/api/events'),
    getJson<Document[]>('/api/documents'),
    getJson<PurchaseRequest[]>('/api/procurement/purchase-requests'),
    getJson<Invoice[]>('/api/finance/invoices'),
    getJson<Subcontract[]>('/api/subcontracts/subcontracts'),
    getJson<Claim[]>('/api/subcontracts/claims'),
    getJson<BankAccount[]>('/api/finance/accounts?type=asset'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<Pipeline>('/api/intelligence/pipeline'),
    getJson<ProjectLedger[]>('/api/intelligence/projects'),
  ]);

  const online = events !== null || documents !== null;

  return (
    <div style={s.shell}>
      <div style={s.titleRow}>
        <h1 style={s.h1}>My Workspace</h1>
        <div style={s.pill(online)}>
          <span style={s.dot(online)} /> {online ? 'API online' : 'API offline'}
        </div>
      </div>
      <p style={s.sub}>
        Everything happening across your business — approvals, deadlines and live activity,
        all in one place.
      </p>

      {!online ? (
        <section style={s.panel}>
          <h2 style={s.panelTitle}>API offline</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Start the API to populate the Workspace:
            <br />
            <code style={s.code}>pnpm --filter @aura/api start</code> (expected at{' '}
            <code style={s.code}>{apiBase()}</code>)
          </p>
        </section>
      ) : (
        <RoleDashboardShell
          events={events}
          purchaseRequests={purchaseRequests ?? []}
          invoices={invoices ?? []}
          subcontracts={subcontracts ?? []}
          claims={claims ?? []}
          bankAccounts={bankAccounts ?? []}
          projects={projects ?? []}
          funnel={pipelineData?.funnel ?? null}
          winRate={pipelineData?.winRate ?? null}
          ledgers={ledgers ?? []}
        />
      )}

      <footer style={s.footer}>AURA OS · Phase 0c — the experience shell (Workspace v1)</footer>
    </div>
  );
}

const s = {
  shell: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 6,
  } as CSSProperties,
  pill: (ok: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: ok ? 'var(--good)' : 'var(--bad)',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '6px 12px',
  }),
  dot: (ok: boolean): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ok ? 'var(--good)' : 'var(--bad)',
  }),
  h1: { fontSize: 34, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 28px', maxWidth: 620, lineHeight: 1.5 } as CSSProperties,
  cards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  } as CSSProperties,
  cardValue: { fontSize: 30, fontWeight: 700 } as CSSProperties,
  cardLabel: { marginTop: 4, fontSize: 14 } as CSSProperties,
  cardHint: { marginTop: 2, fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  } as CSSProperties,
  panelTitle: { fontSize: 15, margin: '0 0 12px', color: 'var(--text)' } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  areaRow: { display: 'grid', gridTemplateColumns: '110px 1fr 28px', alignItems: 'center', gap: 10 } as CSSProperties,
  areaName: { fontSize: 13, color: 'var(--text)' } as CSSProperties,
  barTrack: { height: 8, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  barFill: { display: 'block', height: '100%', background: 'var(--accent)', borderRadius: 999 } as CSSProperties,
  areaCount: { fontSize: 13, color: 'var(--muted)', textAlign: 'right' } as CSSProperties,
  eventRow: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  eventType: { fontSize: 12.5, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  eventTarget: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  eventTime: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' } as CSSProperties,
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
