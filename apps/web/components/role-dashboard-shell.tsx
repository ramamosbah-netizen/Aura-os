'use client';

import { type CSSProperties, useState } from 'react';
import Link from 'next/link';
import CeoCommandCenter from './ceo-command-center';
import CfoPortal from './cfo-portal';
import PmDashboard from './pm-dashboard';
import WorkCenter from './work-center';
import ActivityFeed from './activity-feed';
import type { DomainEvent } from '@aura/shared';

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

type RoleType = 'general' | 'ceo' | 'cfo' | 'pm';

export default function RoleDashboardShell({
  events,
  purchaseRequests,
  invoices,
  subcontracts,
  claims,
  bankAccounts,
  projects,
  funnel,
  winRate,
  ledgers,
}: {
  events: DomainEvent[] | null;
  purchaseRequests: PurchaseRequest[];
  invoices: Invoice[];
  subcontracts: Subcontract[];
  claims: Claim[];
  bankAccounts: BankAccount[];
  projects: Project[];
  funnel: Funnel | null;
  winRate: number | null;
  ledgers: ProjectLedger[];
}) {
  const [selectedRole, setSelectedRole] = useState<RoleType>('general');

  // Compute activity variables
  const byArea = new Map<string, number>();
  for (const e of events ?? []) {
    const area = e.type.split('.')[0];
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
  }
  const areas = [...byArea.entries()].sort((a, b) => b[1] - a[1]);
  const maxArea = areas.length ? areas[0][1] : 1;

  // ── "Today" hub metrics ──────────────────────────────────────────────────
  const pendingApprovals =
    purchaseRequests.filter((p) => p.status === 'draft').length +
    invoices.filter((i) => i.status === 'draft' || i.status === 'approved').length +
    subcontracts.filter((s) => s.status === 'draft').length +
    claims.filter((c) => c.status === 'draft' || c.status === 'certified').length;
  const invoicesToPay = invoices.filter((i) => i.status === 'draft' || i.status === 'approved');
  const invoicesDueValue = invoicesToPay.reduce((sum, i) => sum + (i.value ?? 0), 0);
  const openTenders = funnel?.tenders ?? 0;
  const activeProjects = funnel?.projects ?? projects.length;
  const money0 = (n: number) => 'AED ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

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
            <section style={s.today}>
              <TodayCard
                href="/inbox"
                value={pendingApprovals}
                label="Pending approvals"
                hint="awaiting your action"
                accent
              />
              <TodayCard
                href="/finance/invoices"
                value={invoicesToPay.length}
                label="Invoices to pay"
                hint={invoicesDueValue > 0 ? money0(invoicesDueValue) : 'none due'}
              />
              <TodayCard
                href="/tendering/tenders"
                value={openTenders}
                label="Open tenders"
                hint="in the pipeline"
              />
              <TodayCard
                href="/projects/projects"
                value={activeProjects}
                label="Active projects"
                hint="in delivery"
              />
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
                    No activity yet — it will appear here as your team works.
                  </p>
                ) : (
                  <ul style={s.list}>
                    {areas.map(([area, n]) => (
                      <li key={area} style={s.areaRow}>
                        <span style={s.areaName}>{area}</span>
                        <span style={s.barTrack}>
                          <span style={{ ...s.barFill, width: `${(n / maxArea) * 100}%` }} />
                        </span>
                        <span style={s.areaCount}>{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ActivityFeed events={events ?? []} />
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

function TodayCard({
  href,
  value,
  label,
  hint,
  accent,
}: {
  href: string;
  value: number;
  label: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} style={{ ...s.todayCard, ...(accent && value > 0 ? s.todayCardAccent : {}) }}>
      <div style={{ ...s.cardValue, ...(accent && value > 0 ? { color: 'var(--accent)' } : {}) }}>{value}</div>
      <div style={s.cardLabel}>{label}</div>
      <div style={s.cardHint}>{hint}</div>
      <span style={s.todayArrow}>→</span>
    </Link>
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
  today: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 } as CSSProperties,
  todayCard: {
    position: 'relative',
    display: 'block',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px 18px',
    color: 'var(--text)',
  } as CSSProperties,
  todayCardAccent: { border: '1px solid var(--accent)', background: 'var(--panel-2)' } as CSSProperties,
  todayArrow: { position: 'absolute', top: 14, right: 14, color: 'var(--muted)', fontSize: 14 } as CSSProperties,
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
};
