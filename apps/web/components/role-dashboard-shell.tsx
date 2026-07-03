'use client';

import { type CSSProperties, useState } from 'react';
import CommandCenter from './command-center';
import CeoCommandCenter from './ceo-command-center';
import CfoPortal from './cfo-portal';
import PmDashboard from './pm-dashboard';
import type { DomainEvent, Document } from '@aura/shared';

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

type RoleType = 'command' | 'ceo' | 'cfo' | 'pm';

const ROLES: Array<{ id: RoleType; label: string }> = [
  { id: 'command', label: '✦ Command Center' },
  { id: 'ceo', label: '👔 CEO Command Center' },
  { id: 'cfo', label: '📈 CFO Finance Portal' },
  { id: 'pm', label: '🏗️ PM WBS Dashboard' },
];

export default function RoleDashboardShell({
  events,
  documents,
  invoices,
  bankAccounts,
  projects,
  funnel,
  winRate,
  ledgers,
  inbox,
  userName,
}: {
  events: DomainEvent[] | null;
  documents: Document[] | null;
  invoices: Invoice[];
  bankAccounts: BankAccount[];
  projects: Project[];
  funnel: Funnel | null;
  winRate: number | null;
  ledgers: ProjectLedger[];
  inbox: InboxItem[];
  userName?: string | null;
}) {
  const [role, setRole] = useState<RoleType>('command');

  return (
    <div>
      {/* Role Switcher */}
      <div style={s.switcherContainer}>
        <div style={s.switcherLabel}>Command Perspective:</div>
        <div style={s.tabBar}>
          {ROLES.map((r) => (
            <button key={r.id} type="button" onClick={() => setRole(r.id)} style={s.tabButton(role === r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={s.contentArea}>
        {role === 'command' && (
          <CommandCenter
            inbox={inbox}
            ledgers={ledgers}
            funnel={funnel}
            winRate={winRate}
            invoices={invoices}
            documentsCount={documents?.length ?? 0}
            eventsCount={events?.length ?? 0}
            userName={userName}
          />
        )}

        {role === 'ceo' && (
          <CeoCommandCenter
            funnel={funnel}
            winRate={winRate}
            ledgers={ledgers}
            bankAccounts={bankAccounts}
            invoices={invoices}
          />
        )}

        {role === 'cfo' && <CfoPortal bankAccounts={bankAccounts} invoices={invoices} />}

        {role === 'pm' && <PmDashboard projects={projects} ledgers={ledgers} />}
      </div>
    </div>
  );
}

const s = {
  switcherContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 22,
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
  tabBar: { display: 'flex', flexWrap: 'wrap', gap: 10 } as CSSProperties,
  tabButton: (active: boolean): CSSProperties => ({
    background: active ? 'var(--accent)' : 'var(--panel-2)',
    color: active ? '#fff' : 'var(--text)',
    fontWeight: 600,
    fontSize: 13,
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }),
  contentArea: { minHeight: 300 } as CSSProperties,
};
