'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import CommandCenter from './command-center';
import ActivityFeed from './activity-feed';
import CeoCommandCenter from './ceo-command-center';
import CfoPortal from './cfo-portal';
import PmDashboard from './pm-dashboard';
import {
  visibleFunctionIds,
  allFunctionIds,
  WORKSPACE_ROLES,
  type DomainEvent,
  type Document,
  type WorkspaceConfig,
  type WorkspaceMe,
  type WorkspaceRoleId,
} from '@aura/shared';

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

const PERSPECTIVES: Array<{ id: RoleType; label: string; fn?: string }> = [
  { id: 'command', label: '✦ Command Center' },
  { id: 'ceo', label: '👔 CEO Command Center', fn: 'perspective.ceo' },
  { id: 'cfo', label: '📈 CFO Finance Portal', fn: 'perspective.cfo' },
  { id: 'pm', label: '🏗️ PM WBS Dashboard', fn: 'perspective.pm' },
];

const VIEW_AS_KEY = 'aura-view-as-role';

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
  me,
  workspaceConfig,
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
  me: WorkspaceMe | null;
  workspaceConfig: WorkspaceConfig | null;
}) {
  const [role, setRole] = useState<RoleType>('command');
  const isAdmin = me?.isAdmin ?? false;
  const [viewAs, setViewAs] = useState<WorkspaceRoleId | ''>('');

  // Admins may preview any role's workspace (set from the Administrator Center
  // "Preview →" or the in-hero switch). Persisted so it survives navigation.
  useEffect(() => {
    if (!isAdmin) return;
    try {
      const stored = window.localStorage.getItem(VIEW_AS_KEY);
      if (stored) setViewAs(stored as WorkspaceRoleId);
    } catch {
      /* ignore */
    }
  }, [isAdmin]);

  function applyViewAs(next: WorkspaceRoleId | '') {
    setViewAs(next);
    try {
      if (next) window.localStorage.setItem(VIEW_AS_KEY, next);
      else window.localStorage.removeItem(VIEW_AS_KEY);
    } catch {
      /* ignore */
    }
  }

  // Effective allowed functions: an admin previewing a role sees that role's
  // set; otherwise the signed-in user's own set. If the workspace API is down,
  // fall back to everything (backward compatible).
  const functions = useMemo(() => {
    if (isAdmin && viewAs && workspaceConfig) return new Set(visibleFunctionIds(workspaceConfig, viewAs));
    if (me?.functions) return new Set(me.functions);
    return new Set(allFunctionIds());
  }, [isAdmin, viewAs, workspaceConfig, me]);

  const perspectives = PERSPECTIVES.filter((p) => !p.fn || functions.has(p.fn));
  // if the current tab got filtered out (e.g. after switching view-as), fall back
  const activeRole = perspectives.some((p) => p.id === role) ? role : 'command';

  const previewRoleLabel = viewAs ? WORKSPACE_ROLES.find((r) => r.id === viewAs)?.label ?? viewAs : null;

  return (
    <div>
      {/* Admin bar: preview any role + jump to the Administrator Center */}
      {isAdmin ? (
        <div style={s.adminBar}>
          <span style={s.adminBadge}>ADMIN</span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>View workspace as</span>
          <select
            style={s.viewAsSelect}
            value={viewAs}
            onChange={(e) => applyViewAs(e.target.value as WorkspaceRoleId | '')}
            aria-label="Preview workspace as role"
          >
            <option value="">Administrator (full)</option>
            {WORKSPACE_ROLES.filter((r) => !r.admin).map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          {viewAs ? (
            <button type="button" style={s.exitPreview} onClick={() => applyViewAs('')}>Exit preview</button>
          ) : null}
          <a href="/admin/workspace" style={s.adminLink}>🛠 Administrator Center →</a>
        </div>
      ) : null}

      {viewAs && previewRoleLabel ? (
        <div style={s.previewBanner}>
          👁 Previewing the workspace as <strong>{previewRoleLabel}</strong> — this is exactly what that role sees.
        </div>
      ) : null}

      {/* Perspective switcher (gated by role) */}
      {perspectives.length > 1 ? (
        <div style={s.switcherContainer}>
          <div style={s.switcherLabel}>Command Perspective:</div>
          <div style={s.tabBar}>
            {perspectives.map((p) => (
              <button key={p.id} type="button" onClick={() => setRole(p.id)} style={s.tabButton(activeRole === p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={s.contentArea}>
        {activeRole === 'command' && (
          <CommandCenter
            inbox={inbox}
            ledgers={ledgers}
            funnel={funnel}
            winRate={winRate}
            invoices={invoices}
            documentsCount={documents?.length ?? 0}
            eventsCount={events?.length ?? 0}
            userName={userName}
            functions={[...functions]}
            roleLabel={viewAs ? previewRoleLabel : me?.roleLabel ?? null}
          />
        )}

        {activeRole === 'command' && <ActivityFeed events={events ?? []} />}

        {activeRole === 'ceo' && (
          <CeoCommandCenter funnel={funnel} winRate={winRate} ledgers={ledgers} bankAccounts={bankAccounts} invoices={invoices} />
        )}

        {activeRole === 'cfo' && <CfoPortal bankAccounts={bankAccounts} invoices={invoices} />}

        {activeRole === 'pm' && <PmDashboard projects={projects} ledgers={ledgers} />}
      </div>
    </div>
  );
}

const s = {
  adminBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '9px 14px',
    marginBottom: 14,
  } as CSSProperties,
  adminBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.5,
    color: '#8b5cf6',
    background: 'rgba(139,92,246,0.14)',
    borderRadius: 5,
    padding: '3px 7px',
  } as CSSProperties,
  viewAsSelect: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12.5,
    padding: '5px 9px',
    cursor: 'pointer',
  } as CSSProperties,
  exitPreview: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12,
    padding: '5px 10px',
    cursor: 'pointer',
  } as CSSProperties,
  adminLink: { marginLeft: 'auto', color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600 } as CSSProperties,
  previewBanner: {
    background: 'var(--accent-soft)',
    color: 'var(--text)',
    borderRadius: 10,
    padding: '9px 14px',
    fontSize: 13,
    marginBottom: 14,
  } as CSSProperties,
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
