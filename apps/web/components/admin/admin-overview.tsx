'use client';

import React from 'react';
import type { CSSProperties } from 'react';

export interface AdminOverviewData {
  usersCount: number;
  activeModulesCount: number;
  totalModulesCount: number;
  pendingApprovals: number;
  failedJobs: number;
  securityAlerts: number;
  lastBackup: string;
  securityPosture: {
    status: 'protected' | 'warning';
    healthyCount: number;
    totalCount: number;
    checks: {
      authRequired: boolean;
      rlsEnabled: boolean;
      forceRls: boolean;
      dbRoleSafe: boolean;
      rateLimiting: boolean;
      auditLogging: boolean;
      corsPosture: boolean;
    };
  };
}

export default function AdminOverview({
  data,
  onNavigateTab,
  onTriggerBackup,
}: {
  data: AdminOverviewData;
  onNavigateTab: (tab: string, sub?: string) => void;
  onTriggerBackup: () => void;
}) {
  const { securityPosture } = data;
  const isSecurityGood = securityPosture.status === 'protected';

  return (
    <div style={st.container}>
      {/* 1. Master System Status Bar */}
      <div style={st.statusBar}>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: 'var(--good)' }} />
          <span>System: <strong>Healthy</strong></span>
        </div>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: isSecurityGood ? 'var(--good)' : 'var(--warn)' }} />
          <span>
            Security:{' '}
            <strong>
              {isSecurityGood ? '● Protected' : '⚠ Attention Required'} ({securityPosture.healthyCount}/{securityPosture.totalCount} controls)
            </strong>
          </span>
        </div>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: 'var(--good)' }} />
          <span>Database: <strong>Nominal</strong></span>
        </div>
        <div style={st.statusItem}>
          <span style={{ ...st.statusDot, background: 'var(--accent)' }} />
          <span>Backups: <strong>{data.lastBackup}</strong></span>
        </div>
      </div>

      {/* Itemized Security Posture Breakdown Drawer/Strip */}
      <div style={st.securityCheckStrip}>
        <span style={st.securityCheckTitle}>🛡 Security Posture Breakdown:</span>
        <span style={data.securityPosture.checks.authRequired ? st.badgeGood : st.badgeBad}>
          Auth: {data.securityPosture.checks.authRequired ? '✓ Enforced' : '✗ Off'}
        </span>
        <span style={data.securityPosture.checks.rlsEnabled ? st.badgeGood : st.badgeBad}>
          RLS: {data.securityPosture.checks.rlsEnabled ? '✓ Active' : '✗ Off'}
        </span>
        <span style={data.securityPosture.checks.forceRls ? st.badgeGood : st.badgeBad}>
          FORCE RLS: {data.securityPosture.checks.forceRls ? '✓ Enforced' : '✗ Off'}
        </span>
        <span style={data.securityPosture.checks.dbRoleSafe ? st.badgeGood : st.badgeBad}>
          DB Role: {data.securityPosture.checks.dbRoleSafe ? '✓ aura_app Safe' : '⚠ Bypass'}
        </span>
        <span style={data.securityPosture.checks.rateLimiting ? st.badgeGood : st.badgeBad}>
          Rate Limit: {data.securityPosture.checks.rateLimiting ? '✓ Active' : '✗ Off'}
        </span>
        <span style={data.securityPosture.checks.auditLogging ? st.badgeGood : st.badgeBad}>
          Audit Trail: {data.securityPosture.checks.auditLogging ? '✓ Active' : '✗ Off'}
        </span>
        <span style={data.securityPosture.checks.corsPosture ? st.badgeGood : st.badgeBad}>
          CORS: {data.securityPosture.checks.corsPosture ? '✓ Verified' : '✗ Off'}
        </span>
      </div>

      {/* 2. Executive KPI Summary Strip */}
      <div style={st.kpiStrip}>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Users & Grants</span>
          <span style={st.kpiValue}>{data.usersCount}</span>
          <span style={st.kpiSub}>Active Enterprise Accounts</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Active Modules</span>
          <span style={{ ...st.kpiValue, color: 'var(--accent)' }}>
            {data.activeModulesCount} / {data.totalModulesCount}
          </span>
          <span style={st.kpiSub}>ERP Modules Active</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Pending Approvals</span>
          <span style={{ ...st.kpiValue, color: 'var(--warn)' }}>{data.pendingApprovals}</span>
          <span style={st.kpiSub}>Across POs & Invoices</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Failed Jobs</span>
          <span style={{ ...st.kpiValue, color: 'var(--good)' }}>{data.failedJobs}</span>
          <span style={st.kpiSub}>All Queues Nominal</span>
        </div>
        <div style={st.kpiCard}>
          <span style={st.kpiLabel}>Security Alerts</span>
          <span style={{ ...st.kpiValue, color: data.securityAlerts > 0 ? 'var(--warn)' : 'var(--good)' }}>
            {data.securityAlerts}
          </span>
          <span style={st.kpiSub}>{data.securityAlerts > 0 ? 'Review Required' : 'Zero Alerts'}</span>
        </div>
      </div>

      {/* 3. Quick Actions Bar */}
      <div style={st.quickActionsRow}>
        <span style={st.quickTitle}>⚡ Quick Actions:</span>
        <button type="button" style={st.quickBtn} onClick={() => onNavigateTab('users', 'users')}>
          + Add User
        </button>
        <button type="button" style={st.quickBtn} onClick={() => onNavigateTab('users', 'roles')}>
          🛡 Assign Role
        </button>
        <button type="button" style={st.quickBtn} onClick={() => onNavigateTab('rules', 'approvals')}>
          📐 Edit Approval Matrix
        </button>
        <button type="button" style={st.quickBtnAccent} onClick={onTriggerBackup}>
          💾 Backup Database Now
        </button>
        <button type="button" style={st.quickBtn} onClick={() => onNavigateTab('operations', 'audit')}>
          📜 View Audit Log
        </button>
      </div>

      {/* 4. Domain Navigation Shortcuts */}
      <div style={st.grid2}>
        <div style={st.card}>
          <div style={st.cardHeader}>
            <h3 style={st.cardTitle}>👥 Users & Access Control</h3>
            <button type="button" style={st.linkBtn} onClick={() => onNavigateTab('users')}>
              Open Panel →
            </button>
          </div>
          <p style={st.cardDesc}>Manage enterprise identity, RBAC roles, grants, authority delegation, and SoD matrix.</p>
        </div>

        <div style={st.card}>
          <div style={st.cardHeader}>
            <h3 style={st.cardTitle}>⚡ Business Rules & Workflows</h3>
            <button type="button" style={st.linkBtn} onClick={() => onNavigateTab('rules')}>
              Open Panel →
            </button>
          </div>
          <p style={st.cardDesc}>Visual approval matrices, PO/AR document numbering, and workflow stage gates.</p>
        </div>

        <div style={st.card}>
          <div style={st.cardHeader}>
            <h3 style={st.cardTitle}>📡 Communications & Integrations</h3>
            <button type="button" style={st.linkBtn} onClick={() => onNavigateTab('comms')}>
              Open Panel →
            </button>
          </div>
          <p style={st.cardDesc}>SMTP outbound mail relays, SMS gateways, WhatsApp webhooks, and REST connectors.</p>
        </div>

        <div style={st.card}>
          <div style={st.cardHeader}>
            <h3 style={st.cardTitle}>📄 Forms & Document Templates</h3>
            <button type="button" style={st.linkBtn} onClick={() => onNavigateTab('forms')}>
              Open Panel →
            </button>
          </div>
          <p style={st.cardDesc}>Custom metadata fields, dynamic forms, HTML print builders, and company TRN branding.</p>
        </div>

        <div style={st.card}>
          <div style={st.cardHeader}>
            <h3 style={st.cardTitle}>🧩 ERP Modules & Feature Flags</h3>
            <button type="button" style={st.linkBtn} onClick={() => onNavigateTab('modules')}>
              Open Panel →
            </button>
          </div>
          <p style={st.cardDesc}>Enable or disable ERP business modules per company entity and toggle staged feature flags.</p>
        </div>

        <div style={st.card}>
          <div style={st.cardHeader}>
            <h3 style={st.cardTitle}>💾 Operations & Safeguards</h3>
            <button type="button" style={st.linkBtn} onClick={() => onNavigateTab('operations')}>
              Open Panel →
            </button>
          </div>
          <p style={st.cardDesc}>Database backups, digital twin state snapshots, security posture, and audit logs.</p>
        </div>
      </div>
    </div>
  );
}

const st = {
  container: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%' } as CSSProperties,
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
  securityCheckStrip: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 12,
  } as CSSProperties,
  securityCheckTitle: { fontWeight: 700, color: 'var(--text)', marginRight: 4 } as CSSProperties,
  badgeGood: { fontSize: 10.5, fontWeight: 700, background: 'var(--good-soft)', color: 'var(--good)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
  badgeBad: { fontSize: 10.5, fontWeight: 700, background: 'var(--bad-soft)', color: 'var(--bad)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
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
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 } as CSSProperties,
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
};
