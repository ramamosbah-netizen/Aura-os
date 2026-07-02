'use client';

import { type CSSProperties, useState } from 'react';
import CeoCommandCenter from './ceo-command-center';
import CfoPortal from './cfo-portal';
import PmDashboard from './pm-dashboard';
import WorkCenter from './work-center';
import { areaLabel, humanizeEventType } from '@/lib/event-labels';
import type { DomainEvent, Document } from '@aura/shared';

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

interface Funnel {
  accounts: number;
  tenders: number;
  contracts: number;
  projects: number;
  tenderValue: number;
  contractValue: number;
  projectValue: number;
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

type RoleType = 'general' | 'ceo' | 'cfo' | 'pm';

type Period = 'all' | '24h' | '7d' | '30d';

const PERIODS: Array<{ id: Period; label: string; ms: number | null }> = [
  { id: 'all', label: 'All time', ms: null },
  { id: '24h', label: 'Last 24 hours', ms: 24 * 3600_000 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 24 * 3600_000 },
  { id: '30d', label: 'Last 30 days', ms: 30 * 24 * 3600_000 },
];

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function RoleDashboardShell({
  events,
  documents,
  purchaseRequests,
  invoices,
  subcontracts,
  claims,
  bankAccounts,
  projects,
  funnel,
  winRate,
  ledgers,
  inbox,
}: {
  events: DomainEvent[] | null;
  documents: Document[] | null;
  purchaseRequests: PurchaseRequest[];
  invoices: Invoice[];
  subcontracts: Subcontract[];
  claims: Claim[];
  bankAccounts: BankAccount[];
  projects: Project[];
  funnel: Funnel | null;
  winRate: number | null;
  ledgers: ProjectLedger[];
  inbox: InboxItem[];
}) {
  const [selectedRole, setSelectedRole] = useState<RoleType>('general');
  const [feedArea, setFeedArea] = useState('all');
  const [feedPeriod, setFeedPeriod] = useState<Period>('all');

  // Compute activity variables
  const byArea = new Map<string, number>();
  for (const e of events ?? []) {
    const area = e.type.split('.')[0];
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
  }
  const areas = [...byArea.entries()].sort((a, b) => b[1] - a[1]);
  const maxArea = areas.length ? areas[0][1] : 1;

  const periodMs = PERIODS.find((p) => p.id === feedPeriod)?.ms ?? null;
  const cutoff = periodMs === null ? null : Date.now() - periodMs;
  const recent = (events ?? [])
    .filter((e) => feedArea === 'all' || e.type.split('.')[0] === feedArea)
    .filter((e) => cutoff === null || new Date(e.occurredAt).getTime() >= cutoff)
    .slice(0, 30);

  return (
    <div>
      {/* Role Switcher tabs */}
      <div style={s.switcherContainer}>
        <div style={s.switcherLabel}>Command Perspective:</div>
        <div style={s.tabBar}>
          <button
            type="button"
            onClick={() => setSelectedRole('general')}
            style={s.tabButton(selectedRole === 'general')}
          >
            ✦ Workspace Work Center
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('ceo')}
            style={s.tabButton(selectedRole === 'ceo')}
          >
            👔 CEO Command Center
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('cfo')}
            style={s.tabButton(selectedRole === 'cfo')}
          >
            📈 CFO Finance Portal
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('pm')}
            style={s.tabButton(selectedRole === 'pm')}
          >
            🏗️ PM WBS Dashboard
          </button>
        </div>
      </div>

      {/* Conditionally Render Custom Widgets */}
      <div style={s.contentArea}>
        {selectedRole === 'general' && (
          <>
            {/* Today — the decisions and dues waiting on you right now */}
            <section style={{ marginBottom: 24 }}>
              <div style={s.todayHeader}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Today</h2>
                <a href="/inbox" style={s.todayLink}>
                  Open Inbox →
                </a>
              </div>
              <div style={s.todayCards}>
                <Stat label="Pending decisions" value={inbox.length} hint="across all modules" />
                <Stat
                  label="Invoices to pay"
                  value={inbox.filter((i) => i.action === 'Pay').length}
                  hint="approved & waiting"
                />
                <Stat
                  label="Tenders to decide"
                  value={inbox.filter((i) => i.kind === 'Tender').length}
                  hint="submitted bids"
                />
                <Stat
                  label="HR approvals"
                  value={inbox.filter((i) => i.module === 'HR').length}
                  hint="leave · time · expenses"
                />
              </div>
              {inbox.length > 0 ? (
                <div style={{ ...s.panel, marginTop: 12 }}>
                  <ul style={s.list}>
                    {inbox.slice(0, 5).map((item) => (
                      <li key={`${item.kind}-${item.id}`} style={s.todayRow}>
                        <span style={s.todayAction}>{item.action}</span>
                        <a href={item.href} style={s.todayTitle}>
                          {item.title}
                        </a>
                        <span style={s.todayMeta}>
                          {item.module} · {item.kind}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section style={s.cards}>
              <Stat label="Recent events" value={events?.length ?? 0} hint="on the spine" />
              <Stat label="Documents" value={documents?.length ?? 0} hint="in the DMS" />
              <Stat label="Active areas" value={areas.length} hint="modules emitting" />
            </section>

            {/* Unified Approvals / Tasks Inbox */}
            <section style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Unified Work Center Queue</h2>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'var(--accent)',
                    color: '#0b0e14',
                    borderRadius: 999,
                    padding: '2px 8px',
                  }}
                >
                  In-box
                </span>
              </div>
              <WorkCenter
                purchaseRequests={purchaseRequests}
                invoices={invoices}
                subcontracts={subcontracts}
                claims={claims}
                bankAccounts={bankAccounts}
              />
            </section>

            <section style={s.grid}>
              <div style={s.panel}>
                <h2 style={s.panelTitle}>Activity by area</h2>
                {areas.length === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
                    No events yet — emit one via the API to see it here.
                  </p>
                ) : (
                  <ul style={s.list}>
                    {areas.map(([area, n]) => (
                      <li key={area} style={s.areaRow}>
                        <span style={s.areaName}>{areaLabel(area)}</span>
                        <span style={s.barTrack}>
                          <span style={{ ...s.barFill, width: `${(n / maxArea) * 100}%` }} />
                        </span>
                        <span style={s.areaCount}>{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={s.panel}>
                <div style={s.feedHeader}>
                  <h2 style={{ ...s.panelTitle, margin: 0 }}>Recent activity</h2>
                  <div style={s.feedFilters}>
                    <select
                      style={s.feedSelect}
                      value={feedArea}
                      onChange={(e) => setFeedArea(e.target.value)}
                      aria-label="Filter by module"
                    >
                      <option value="all">All modules</option>
                      {areas.map(([area]) => (
                        <option key={area} value={area}>
                          {areaLabel(area)}
                        </option>
                      ))}
                    </select>
                    <select
                      style={s.feedSelect}
                      value={feedPeriod}
                      onChange={(e) => setFeedPeriod(e.target.value as Period)}
                      aria-label="Filter by period"
                    >
                      {PERIODS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {recent.length === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
                    No activity matches these filters yet.
                  </p>
                ) : (
                  <ul style={s.list}>
                    {recent.map((e) => {
                      const h = humanizeEventType(e.type);
                      return (
                        <li key={e.id} style={s.eventRow} title={e.type}>
                          <span style={s.eventArea}>{h.area}</span>
                          <span style={s.eventLabel}>{h.label}</span>
                          <span style={s.eventTime}>{timeAgo(e.occurredAt)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}

        {selectedRole === 'ceo' && (
          <CeoCommandCenter
            funnel={funnel}
            winRate={winRate}
            ledgers={ledgers}
            bankAccounts={bankAccounts}
            invoices={invoices}
          />
        )}

        {selectedRole === 'cfo' && (
          <CfoPortal bankAccounts={bankAccounts} invoices={invoices} />
        )}

        {selectedRole === 'pm' && (
          <PmDashboard projects={projects} ledgers={ledgers} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div style={s.card}>
      <div style={s.cardValue}>{value}</div>
      <div style={s.cardLabel}>{label}</div>
      <div style={s.cardHint}>{hint}</div>
    </div>
  );
}

const s = {
  switcherContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 26,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '12px 16px',
  } as CSSProperties,
  switcherLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--muted)',
    fontWeight: 600,
  } as CSSProperties,
  tabBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  } as CSSProperties,
  tabButton: (active: boolean): CSSProperties => ({
    background: active ? 'var(--accent)' : 'var(--panel-2)',
    color: active ? '#0b0e14' : 'var(--text)',
    fontWeight: 600,
    fontSize: 13,
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }),
  contentArea: {
    minHeight: 300,
  } as CSSProperties,
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
  eventArea: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--accent)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '1px 7px',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  eventLabel: { fontSize: 13, color: 'var(--text)' } as CSSProperties,
  eventTime: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' } as CSSProperties,
  feedHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 12,
  } as CSSProperties,
  feedFilters: { display: 'flex', gap: 8 } as CSSProperties,
  feedSelect: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12,
    padding: '4px 8px',
    cursor: 'pointer',
  } as CSSProperties,
  todayHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  } as CSSProperties,
  todayLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 } as CSSProperties,
  todayCards: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 } as CSSProperties,
  todayRow: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 } as CSSProperties,
  todayAction: {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--accent)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
    whiteSpace: 'nowrap',
    minWidth: 58,
    textAlign: 'center',
  } as CSSProperties,
  todayTitle: {
    color: 'var(--text)',
    textDecoration: 'none',
    fontSize: 13.5,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  todayMeta: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto', whiteSpace: 'nowrap' } as CSSProperties,
};
