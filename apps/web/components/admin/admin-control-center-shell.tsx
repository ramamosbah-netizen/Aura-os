'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';

// Domain panels — modular imports
import AdminOverview, { type AdminOverviewData } from './admin-overview';

// Users & Access
import UsersPanel from './users/users-panel';
import RolesPanel from './users/roles-panel';
import DelegationPanel from './users/delegation-panel';
import SodPanel from './users/sod-panel';

// Business Rules
import ApprovalMatrixPanel from './business-rules/approval-matrix-panel';
import WorkflowPanel from './business-rules/workflow-panel';
import NumberingPanel from './business-rules/numbering-panel';
import ValidationPanel from './business-rules/validation-panel';

// Communications
import MailPanel from './communications/mail-panel';
import SmsWhatsappPanel from './communications/sms-whatsapp-panel';
import WebhooksPanel from './communications/webhooks-panel';
import ConnectorsPanel from './communications/connectors-panel';

// Forms & Documents
import CustomFieldsPanel from './forms/custom-fields-panel';
import FormsPanel from './forms/forms-panel';
import PrintTemplatesPanel from './forms/print-templates-panel';
import BrandingPanel from './forms/branding-panel';

// Modules & Features
import ModuleSwitchesPanel from './modules/module-switches-panel';
import FeatureFlagsPanel from './modules/feature-flags-panel';
import AiSettingsPanel from './modules/ai-settings-panel';

// Operations
import SystemHealthPanel from './operations/system-health-panel';
import BackupRestorePanel from './operations/backup-restore-panel';
import AuditLogPanel from './operations/audit-log-panel';
import SecurityRlsPanel from './operations/security-rls-panel';

// ─── Tab definitions ────────────────────────────────────────────
type TabId = 'overview' | 'users' | 'rules' | 'comms' | 'forms' | 'modules' | 'operations';

interface TabDef {
  id: TabId;
  label: string;
  glyph: string;
  subs?: { id: string; label: string }[];
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', glyph: '📊' },
  {
    id: 'users', label: 'Users & Access', glyph: '👥',
    subs: [
      { id: 'users', label: 'Users' },
      { id: 'roles', label: 'Roles & Grants' },
      { id: 'delegation', label: 'Delegation' },
      { id: 'sod', label: 'Segregation of Duties' },
    ],
  },
  {
    id: 'rules', label: 'Business Rules', glyph: '⚡',
    subs: [
      { id: 'approvals', label: 'Approval Matrix' },
      { id: 'workflows', label: 'Workflows' },
      { id: 'numbering', label: 'Numbering' },
      { id: 'validation', label: 'Validation Rules' },
    ],
  },
  {
    id: 'comms', label: 'Communications', glyph: '📡',
    subs: [
      { id: 'mail', label: 'Email / SMTP' },
      { id: 'sms', label: 'SMS / WhatsApp' },
      { id: 'webhooks', label: 'Webhooks' },
      { id: 'connectors', label: 'API Connectors' },
    ],
  },
  {
    id: 'forms', label: 'Forms & Docs', glyph: '📄',
    subs: [
      { id: 'custom-fields', label: 'Custom Fields' },
      { id: 'forms', label: 'Form Engine' },
      { id: 'print-templates', label: 'Print Templates' },
      { id: 'branding', label: 'Company Branding' },
    ],
  },
  {
    id: 'modules', label: 'Modules & Features', glyph: '🧩',
    subs: [
      { id: 'erp-modules', label: 'ERP Modules' },
      { id: 'feature-flags', label: 'Feature Flags' },
      { id: 'ai', label: 'AI Swarm Settings' },
    ],
  },
  {
    id: 'operations', label: 'Operations', glyph: '💾',
    subs: [
      { id: 'health', label: 'System Health' },
      { id: 'backup', label: 'Backup & Restore' },
      { id: 'audit', label: 'Audit Log' },
      { id: 'security', label: 'Security & RLS' },
    ],
  },
];

// ─── Props ──────────────────────────────────────────────────────
export interface AdminControlCenterProps {
  overviewData: AdminOverviewData;
}

// ─── Component ──────────────────────────────────────────────────
export default function AdminControlCenterShell({ overviewData }: AdminControlCenterProps) {
  // Parse URL params for tab/sub deep-linking
  const getInitialTab = (): { tab: TabId; sub: string } => {
    if (typeof window === 'undefined') return { tab: 'overview', sub: '' };
    const params = new URLSearchParams(window.location.search);
    const tab = (params.get('tab') as TabId) || 'overview';
    const sub = params.get('sub') || '';
    return { tab, sub };
  };

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [activeSub, setActiveSub] = useState('');

  useEffect(() => {
    const { tab, sub } = getInitialTab();
    setActiveTab(tab);
    if (sub) setActiveSub(sub);
    else {
      const tabDef = TABS.find((t) => t.id === tab);
      setActiveSub(tabDef?.subs?.[0]?.id ?? '');
    }
  }, []);

  // Sync URL params when tab changes
  const navigateTo = useCallback((tab: TabId, sub?: string) => {
    setActiveTab(tab);
    const tabDef = TABS.find((t) => t.id === tab);
    const resolvedSub = sub ?? tabDef?.subs?.[0]?.id ?? '';
    setActiveSub(resolvedSub);

    // Update URL without full page reload
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    if (resolvedSub) url.searchParams.set('sub', resolvedSub);
    else url.searchParams.delete('sub');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const currentTabDef = TABS.find((t) => t.id === activeTab);

  return (
    <div style={st.container}>
      {/* Primary Tab Bar */}
      <div style={st.tabBar}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            style={activeTab === t.id ? st.tabActive : st.tab}
            onClick={() => navigateTo(t.id)}
          >
            {t.glyph} {t.label}
          </button>
        ))}
      </div>

      {/* Sub-navigation pills (when domain has sub-panels) */}
      {currentTabDef?.subs && (
        <div style={st.subNav}>
          {currentTabDef.subs.map((s) => (
            <button
              key={s.id}
              type="button"
              style={activeSub === s.id ? st.subActive : st.subPill}
              onClick={() => { setActiveSub(s.id); const url = new URL(window.location.href); url.searchParams.set('sub', s.id); window.history.replaceState({}, '', url.toString()); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Panel content area */}
      <div style={st.content}>
        {/* Overview */}
        {activeTab === 'overview' && (
          <AdminOverview
            data={overviewData}
            onNavigateTab={(tab, sub) => navigateTo(tab as TabId, sub)}
            onTriggerBackup={() => navigateTo('operations', 'backup')}
          />
        )}

        {/* Users & Access */}
        {activeTab === 'users' && activeSub === 'users' && <UsersPanel />}
        {activeTab === 'users' && activeSub === 'roles' && <RolesPanel />}
        {activeTab === 'users' && activeSub === 'delegation' && <DelegationPanel />}
        {activeTab === 'users' && activeSub === 'sod' && <SodPanel />}

        {/* Business Rules */}
        {activeTab === 'rules' && activeSub === 'approvals' && <ApprovalMatrixPanel />}
        {activeTab === 'rules' && activeSub === 'workflows' && <WorkflowPanel />}
        {activeTab === 'rules' && activeSub === 'numbering' && <NumberingPanel />}
        {activeTab === 'rules' && activeSub === 'validation' && <ValidationPanel />}

        {/* Communications */}
        {activeTab === 'comms' && activeSub === 'mail' && <MailPanel />}
        {activeTab === 'comms' && activeSub === 'sms' && <SmsWhatsappPanel />}
        {activeTab === 'comms' && activeSub === 'webhooks' && <WebhooksPanel />}
        {activeTab === 'comms' && activeSub === 'connectors' && <ConnectorsPanel />}

        {/* Forms & Documents */}
        {activeTab === 'forms' && activeSub === 'custom-fields' && <CustomFieldsPanel />}
        {activeTab === 'forms' && activeSub === 'forms' && <FormsPanel />}
        {activeTab === 'forms' && activeSub === 'print-templates' && <PrintTemplatesPanel />}
        {activeTab === 'forms' && activeSub === 'branding' && <BrandingPanel />}

        {/* Modules & Features */}
        {activeTab === 'modules' && activeSub === 'erp-modules' && <ModuleSwitchesPanel />}
        {activeTab === 'modules' && activeSub === 'feature-flags' && <FeatureFlagsPanel />}
        {activeTab === 'modules' && activeSub === 'ai' && <AiSettingsPanel />}

        {/* Operations */}
        {activeTab === 'operations' && activeSub === 'health' && <SystemHealthPanel />}
        {activeTab === 'operations' && activeSub === 'backup' && <BackupRestorePanel />}
        {activeTab === 'operations' && activeSub === 'audit' && <AuditLogPanel />}
        {activeTab === 'operations' && activeSub === 'security' && <SecurityRlsPanel />}
      </div>
    </div>
  );
}

const st = {
  container: { width: '100%', display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  tabBar: {
    display: 'flex',
    gap: 4,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 2,
    overflowX: 'auto',
  } as CSSProperties,
  tab: {
    background: 'transparent',
    border: 'none',
    color: 'var(--muted)',
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: '8px 8px 0 0',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  tabActive: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderBottom: '2px solid var(--accent)',
    color: 'var(--accent)',
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    borderRadius: '8px 8px 0 0',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  subNav: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    padding: '4px 0',
  } as CSSProperties,
  subPill: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--muted)',
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  subActive: {
    background: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 8,
    color: 'var(--accent-ink)',
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  } as CSSProperties,
  content: { minHeight: 300 } as CSSProperties,
};
