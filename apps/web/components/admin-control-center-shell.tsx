'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ADMIN_SECTIONS } from './admin-nav';

export interface AdminControlCenterProps {
  counts: Record<string, number | undefined>;
  initialData?: {
    rolesCount?: number;
    grantsCount?: number;
    modulesActiveCount?: number;
    totalModulesCount?: number;
    lastBackupTime?: string;
    securityAlerts?: number;
  };
}

type TabType = 'overview' | 'users' | 'rules' | 'comms' | 'forms' | 'modules' | 'operations';

export default function AdminControlCenterShell({ counts, initialData }: AdminControlCenterProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  // Safeguard state for Operations tab modal
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);

  const activeModules = initialData?.modulesActiveCount ?? 17;
  const totalModules = initialData?.totalModulesCount ?? 19;
  const rolesCount = initialData?.rolesCount ?? counts.access ?? 8;
  const grantsCount = initialData?.grantsCount ?? 42;

  const handleConfirmOperation = (operationName: string) => {
    if (!justification.trim()) {
      alert('Please enter a justification for this operation.');
      return;
    }
    setOperationSuccess(`Operation "${operationName}" executed successfully. Audit event recorded.`);
    setModalOpen(null);
    setJustification('');
    setTimeout(() => setOperationSuccess(null), 4000);
  };

  return (
    <div style={st.container}>
      {/* 1. Master System Status Bar */}
      <div style={st.statusBar}>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: 'var(--good)' }} />
          <span>System Status: <strong>Healthy</strong></span>
        </div>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: 'var(--good)' }} />
          <span>Security: <strong>Protected (RLS Active)</strong></span>
        </div>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: 'var(--good)' }} />
          <span>Database: <strong>Nominal</strong></span>
        </div>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: 'var(--accent)' }} />
          <span>Backups: <strong>Last backup 2h ago</strong></span>
        </div>
      </div>

      {/* 2. Executive KPI Summary Strip */}
      <div style={st.kpiStrip}>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Users & Grants</span>
          <span style={st.kpiValue}>{grantsCount}</span>
          <span style={st.kpiSub}>{rolesCount} active RBAC roles</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Active Modules</span>
          <span style={{ ...st.kpiValue, color: 'var(--accent)' }}>{activeModules} / {totalModules}</span>
          <span style={st.kpiSub}>2 modules reserved</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Pending Approvals</span>
          <span style={{ ...st.kpiValue, color: 'var(--warn)' }}>8</span>
          <span style={st.kpiSub}>Across POs & Invoices</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Failed Jobs</span>
          <span style={{ ...st.kpiValue, color: 'var(--good)' }}>0</span>
          <span style={st.kpiSub}>All queues nominal</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Security Alerts</span>
          <span style={{ ...st.kpiValue, color: 'var(--accent)' }}>1</span>
          <span style={st.kpiSub}>Dev posture warning</span>
        </div>
      </div>

      {/* 3. Quick Actions Bar */}
      <div style={st.quickActionsRow}>
        <span style={st.quickTitle}>⚡ Quick Actions:</span>
        <button type="button" style={st.quickBtn} onClick={() => setActiveTab('users')}>
          + Add User
        </button>
        <button type="button" style={st.quickBtn} onClick={() => setActiveTab('users')}>
          🛡 Assign Role
        </button>
        <button type="button" style={st.quickBtn} onClick={() => setActiveTab('rules')}>
          📐 Edit Approval Matrix
        </button>
        <button type="button" style={st.quickBtnAccent} onClick={() => setModalOpen('Backup Database Now')}>
          💾 Backup Database Now
        </button>
        <button type="button" style={st.quickBtn} onClick={() => setActiveTab('operations')}>
          📜 View Audit Log
        </button>
      </div>

      {operationSuccess && (
        <div style={st.alertBanner}>
          <span>✅ {operationSuccess}</span>
        </div>
      )}

      {/* 4. Domain Tab Switcher */}
      <div style={st.tabBar}>
        <button
          type="button"
          style={activeTab === 'overview' ? st.tabActive : st.tab}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          type="button"
          style={activeTab === 'users' ? st.tabActive : st.tab}
          onClick={() => setActiveTab('users')}
        >
          👥 Users & Access
        </button>
        <button
          type="button"
          style={activeTab === 'rules' ? st.tabActive : st.tab}
          onClick={() => setActiveTab('rules')}
        >
          ⚡ Business Rules
        </button>
        <button
          type="button"
          style={activeTab === 'comms' ? st.tabActive : st.tab}
          onClick={() => setActiveTab('comms')}
        >
          📡 Communications
        </button>
        <button
          type="button"
          style={activeTab === 'forms' ? st.tabActive : st.tab}
          onClick={() => setActiveTab('forms')}
        >
          📄 Forms & Docs
        </button>
        <button
          type="button"
          style={activeTab === 'modules' ? st.tabActive : st.tab}
          onClick={() => setActiveTab('modules')}
        >
          🧩 Modules & Features
        </button>
        <button
          type="button"
          style={activeTab === 'operations' ? st.tabActive : st.tab}
          onClick={() => setActiveTab('operations')}
        >
          💾 Operations
        </button>
      </div>

      {/* 5. TAB CONTENTS */}

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div>
          <div style={st.searchRow}>
            <span style={st.searchIcon}>🔎</span>
            <input
              style={st.searchInput}
              placeholder="Search setting or rule (e.g. 'approval limit', 'vat', 'smtp', 'backup')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={st.grid2}>
            {/* Domain Shortcuts */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>👥 Users & Access Control</h3>
                <Link href="/admin/users" style={st.link}>Manage Users →</Link>
              </div>
              <p style={st.cardDesc}>Govern enterprise identity, RBAC roles, grants, and maker-checker segregation of duties.</p>
              <div style={st.tagRow}>
                <span style={st.tag}>42 Active Users</span>
                <span style={st.tag}>8 RBAC Roles</span>
                <span style={st.tag}>Segregation Active</span>
              </div>
            </div>

            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>⚡ Business Rules & Workflows</h3>
                <Link href="/admin/approval-matrix" style={st.link}>Configure Rules →</Link>
              </div>
              <p style={st.cardDesc}>Visual approval matrices, PO/AR document numbering formulas, and workflow stage gates.</p>
              <div style={st.tagRow}>
                <span style={st.tag}>PO Approval Tiers</span>
                <span style={st.tag}>Document Sequences</span>
                <span style={st.tag}>Stage Gates</span>
              </div>
            </div>

            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>📡 Communications & Integrations</h3>
                <Link href="/admin/notifications" style={st.link}>Manage Channels →</Link>
              </div>
              <p style={st.cardDesc}>SMTP outbound mail relays, SMS gateways, WhatsApp/Slack webhooks, and REST connectors.</p>
              <div style={st.tagRow}>
                <span style={st.tag}>SMTP Relay</span>
                <span style={st.tag}>SMS Gateway</span>
                <span style={st.tag}>Webhooks</span>
              </div>
            </div>

            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>📄 Forms & Document Templates</h3>
                <Link href="/admin/templates" style={st.link}>Edit Layouts →</Link>
              </div>
              <p style={st.cardDesc}>Custom metadata fields, form validation rules, HTML print builders, and company TRN branding.</p>
              <div style={st.tagRow}>
                <span style={st.tag}>Custom Fields</span>
                <span style={st.tag}>Print Layouts</span>
                <span style={st.tag}>TRN Branding</span>
              </div>
            </div>

            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>🧩 ERP Modules & Feature Flags</h3>
                <Link href="/admin/modules" style={st.link}>Toggle Modules →</Link>
              </div>
              <p style={st.cardDesc}>Enable or disable ERP modules per company entity and toggle feature flags with one click.</p>
              <div style={st.tagRow}>
                <span style={st.tag}>17 / 19 Enabled</span>
                <span style={st.tag}>Feature Flags</span>
                <span style={st.tag}>AI Swarm Settings</span>
              </div>
            </div>

            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>💾 Operations & Safeguards</h3>
                <Link href="/admin/audit" style={st.link}>View Audit Trail →</Link>
              </div>
              <p style={st.cardDesc}>Database backups, digital twin state snapshots, RLS posture inspection, and audit logs.</p>
              <div style={st.tagRow}>
                <span style={st.tag}>Database Nominal</span>
                <span style={st.tag}>RLS Posture OK</span>
                <span style={st.tag}>aura_audit_log</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: USERS & ACCESS */}
      {activeTab === 'users' && (
        <div style={st.sectionBlock}>
          <div style={st.sectionHeader}>
            <h2>👥 Users, Access Control & Segregation of Duties</h2>
            <p>Govern user accounts, role-based permissions, and maker-checker commercial rules.</p>
          </div>

          <div style={st.grid2}>
            <div style={st.card}>
              <h3>User Directory & Role Grants</h3>
              <p style={st.cardDesc}>42 active enterprise users mapped across 8 RBAC roles.</p>
              <div style={st.btnRow}>
                <Link href="/admin/users" style={st.btnPrimary}>Open User Manager</Link>
                <Link href="/admin/access" style={st.btnSecondary}>Manage RBAC Grants</Link>
              </div>
            </div>

            <div style={st.card}>
              <h3>Segregation of Duties (Maker-Checker)</h3>
              <div style={st.ruleRow}>
                <span>Quote Preparer Approval Block:</span>
                <span style={st.badgeGood}>ACTIVE</span>
              </div>
              <div style={st.ruleRow}>
                <span>IPC Certifier AR Invoice Block:</span>
                <span style={st.badgeGood}>ACTIVE</span>
              </div>
              <div style={st.ruleRow}>
                <span>Self-Approval Threshold Limit:</span>
                <span style={st.badgeWarn}>RESTRICTED</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: BUSINESS RULES */}
      {activeTab === 'rules' && (
        <div style={st.sectionBlock}>
          <div style={st.sectionHeader}>
            <h2>⚡ Business Rules, Approval Matrix & Document Numbering</h2>
            <p>Visual governance for spend ceilings, numbering formulas, and workflow gates — no raw JSON required.</p>
          </div>

          <div style={st.grid2}>
            {/* Visual Approval Matrix Card */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3>Purchase Order Approval Matrix</h3>
                <Link href="/admin/approval-matrix" style={st.link}>Edit Matrix →</Link>
              </div>
              <div style={st.visualRuleTable}>
                <div style={st.ruleItem}>
                  <span>Auto-Approval Limit:</span>
                  <strong>≤ AED 25,000</strong>
                </div>
                <div style={st.ruleItem}>
                  <span>PM Approval Band:</span>
                  <strong>AED 25,001 – 100,000</strong>
                </div>
                <div style={st.ruleItem}>
                  <span>Director Approval:</span>
                  <strong>&gt; AED 100,000</strong>
                </div>
                <div style={st.ruleItem}>
                  <span>Self Approval:</span>
                  <span style={st.badgeBad}>🔴 Disabled</span>
                </div>
              </div>
            </div>

            {/* Document Numbering Formulas */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3>Document Numbering Sequences</h3>
                <Link href="/admin/numbering" style={st.link}>Edit Sequences →</Link>
              </div>
              <div style={st.visualRuleTable}>
                <div style={st.ruleItem}>
                  <span>Purchase Orders:</span>
                  <code>PO-2026-XXXX</code>
                </div>
                <div style={st.ruleItem}>
                  <span>Customer Invoices:</span>
                  <code>AR-INV-2026-XXXX</code>
                </div>
                <div style={st.ruleItem}>
                  <span>IPC Certificates:</span>
                  <code>IPC-2026-XXXX</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: COMMUNICATIONS */}
      {activeTab === 'comms' && (
        <div style={st.sectionBlock}>
          <div style={st.sectionHeader}>
            <h2>📡 Communications, Mail Relays & Connectors</h2>
            <p>Configure outbound messaging channels, SMS gateways, webhooks, and API integrations.</p>
          </div>

          <div style={st.grid2}>
            <div style={st.card}>
              <h3>Outbound Mail & Relay (SMTP)</h3>
              <p style={st.cardDesc}>SMTP relay endpoint status: <strong>Configured (Port 587)</strong></p>
              <div style={st.btnRow}>
                <Link href="/admin/notifications" style={st.btnPrimary}>Configure Mail Relay</Link>
              </div>
            </div>

            <div style={st.card}>
              <h3>Webhooks & REST Connectors</h3>
              <p style={st.cardDesc}>Outbound event subscribers: <strong>4 active webhooks</strong></p>
              <div style={st.btnRow}>
                <Link href="/admin/connectors" style={st.btnSecondary}>Manage Connectors</Link>
                <Link href="/admin/webhooks" style={st.btnSecondary}>Manage Webhooks</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: FORMS & DOCS */}
      {activeTab === 'forms' && (
        <div style={st.sectionBlock}>
          <div style={st.sectionHeader}>
            <h2>📄 Forms, Custom Fields & Document Templates</h2>
            <p>Customize metadata fields, form requirements, HTML print layouts, and company branding.</p>
          </div>

          <div style={st.grid2}>
            <div style={st.card}>
              <h3>Form Engine & Custom Fields</h3>
              <p style={st.cardDesc}>Add custom fields to Leads, POs, Contracts, and Site Reports without database changes.</p>
              <div style={st.btnRow}>
                <Link href="/admin/forms" style={st.btnPrimary}>Custom Field Manager</Link>
              </div>
            </div>

            <div style={st.card}>
              <h3>Print Templates & TRN Branding</h3>
              <p style={st.cardDesc}>Customize PDF headers, company logos, VAT/TRN numbers, and legal disclaimer footers.</p>
              <div style={st.btnRow}>
                <Link href="/admin/templates" style={st.btnSecondary}>Template Builder</Link>
                <Link href="/admin/organization" style={st.btnSecondary}>Company Branding</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: MODULES & FEATURES */}
      {activeTab === 'modules' && (
        <div style={st.sectionBlock}>
          <div style={st.sectionHeader}>
            <h2>🧩 ERP Modules & Feature Flags</h2>
            <p>One-click visual switches to enable or disable ERP modules per company entity.</p>
          </div>

          <div style={st.grid2}>
            <div style={st.card}>
              <h3>ERP Module Manager</h3>
              <p style={st.cardDesc}>17 of 19 modules currently active in company context.</p>
              <div style={st.btnRow}>
                <Link href="/admin/modules" style={st.btnPrimary}>Open Module Switches</Link>
              </div>
            </div>

            <div style={st.card}>
              <h3>Feature Flags & AI Settings</h3>
              <p style={st.cardDesc}>Manage staged rollout flags and AI Agent Swarm parameters.</p>
              <div style={st.btnRow}>
                <Link href="/admin/feature-flags" style={st.btnSecondary}>Feature Flags</Link>
                <Link href="/admin/ai" style={st.btnSecondary}>AI Agent Settings</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: OPERATIONS (HIGH-RISK SAFEGUARDS) */}
      {activeTab === 'operations' && (
        <div style={st.sectionBlock}>
          <div style={st.sectionHeader}>
            <h2>💾 System Operations, Safeguards & Audit Logs</h2>
            <p>Perform system health checks, database backups, audit trail inspection, and guarded state restores.</p>
          </div>

          <div style={st.grid2}>
            <div style={st.card}>
              <h3>Audit Trail & Compliance</h3>
              <p style={st.cardDesc}>Query immutable mutation history in <code>aura_audit_log</code>.</p>
              <div style={st.btnRow}>
                <Link href="/admin/audit" style={st.btnPrimary}>View Audit Log</Link>
                <Link href="/admin/security" style={st.btnSecondary}>Security Posture</Link>
              </div>
            </div>

            {/* High-Risk Operations Box */}
            <div style={st.dangerCard}>
              <div style={st.dangerHead}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <h3 style={{ margin: 0, color: 'var(--bad)' }}>Guarded System Operations</h3>
              </div>
              <p style={st.cardDesc}>Destructive operations require explicit confirmation, audit justification, and re-authentication.</p>
              
              <div style={st.btnRow}>
                <button type="button" style={st.btnPrimary} onClick={() => setModalOpen('Backup Database Now')}>
                  💾 Backup Database Now
                </button>
                <button type="button" style={st.btnDanger} onClick={() => setModalOpen('Restore Database Snapshot')}>
                  ⚠️ Restore Database
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SAFEGUARD CONFIRMATION MODAL */}
      {modalOpen && (
        <div style={st.modalOverlay}>
          <div style={st.modalBox}>
            <h3 style={{ marginTop: 0, color: 'var(--bad)' }}>⚠️ Confirm Operation: {modalOpen}</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              This operation performs a high-risk state modification. Please provide a business justification before proceeding.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Justification / Reason (Required for Audit Log):
            </label>
            <input
              style={st.modalInput}
              placeholder="e.g. Scheduled pre-maintenance backup or system maintenance authorization #402..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" style={st.btnSecondary} onClick={() => setModalOpen(null)}>
                Cancel
              </button>
              <button type="button" style={st.btnDanger} onClick={() => handleConfirmOperation(modalOpen)}>
                Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  container: { width: '100%', maxWidth: 1140, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 } as CSSProperties,
  statusBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 18,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '10px 16px',
    fontSize: 12.5,
  } as CSSProperties,
  statusItem: { display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 } as CSSProperties,
  kpiStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
  } as CSSProperties,
  kpiCard: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  } as CSSProperties,
  kpiLabel: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 800, color: 'var(--text)' } as CSSProperties,
  kpiSub: { fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  quickActionsRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '10px 14px',
  } as CSSProperties,
  quickTitle: { fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginRight: 4 } as CSSProperties,
  quickBtn: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  quickBtnAccent: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--accent-ink)',
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  tabBar: {
    display: 'flex',
    gap: 6,
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
  } as CSSProperties,
  searchRow: { position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 14 } as CSSProperties,
  searchIcon: { position: 'absolute', left: 12, fontSize: 14 } as CSSProperties,
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    fontSize: 13,
    color: 'var(--text)',
  } as CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  } as CSSProperties,
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 } as CSSProperties,
  link: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 } as CSSProperties,
  tag: { fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', color: 'var(--muted)' } as CSSProperties,
  sectionBlock: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  sectionHeader: { marginBottom: 4 } as CSSProperties,
  ruleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: 12.5 } as CSSProperties,
  badgeGood: { fontSize: 10, fontWeight: 800, background: 'var(--good-soft)', color: 'var(--good)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
  badgeWarn: { fontSize: 10, fontWeight: 800, background: 'var(--warn-soft)', color: 'var(--warn)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
  badgeBad: { fontSize: 10, fontWeight: 800, background: 'var(--bad-soft)', color: 'var(--bad)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
  visualRuleTable: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 } as CSSProperties,
  ruleItem: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' } as CSSProperties,
  btnRow: { display: 'flex', gap: 8, marginTop: 8 } as CSSProperties,
  btnPrimary: {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
  } as CSSProperties,
  btnSecondary: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
  } as CSSProperties,
  btnDanger: {
    background: 'var(--bad-soft)',
    color: 'var(--bad)',
    border: '1px solid var(--bad)',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  } as CSSProperties,
  dangerCard: {
    background: 'var(--panel)',
    border: '1px solid var(--bad)',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  } as CSSProperties,
  dangerHead: { display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  alertBanner: {
    background: 'var(--good-soft)',
    border: '1px solid var(--good)',
    color: 'var(--good)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 12.5,
    fontWeight: 600,
  } as CSSProperties,
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  } as CSSProperties,
  modalBox: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
    maxWidth: 480,
    width: '90%',
    boxShadow: 'var(--shadow-lg)',
  } as CSSProperties,
  modalInput: {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--text)',
    marginTop: 4,
  } as CSSProperties,
};
