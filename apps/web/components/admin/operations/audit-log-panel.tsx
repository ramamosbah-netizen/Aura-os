'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Audit log viewer panel — immutable audit trail from aura_audit_log. */
export default function AuditLogPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>📜 Audit Trail & Compliance</h3>
        <p style={st.desc}>
          Query the immutable mutation history in <code>aura_audit_log</code>. Every
          configuration change, user action, and high-risk operation is recorded with
          actor, action, target, timestamp, reason, and source session.
        </p>
      </div>
      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Audit Log Viewer</h4>
          <Link href="/admin/audit" style={st.link}>Open Full Audit Log →</Link>
        </div>
        <p style={st.cardDesc}>
          Search, filter, and export audit entries by actor, entity type, date range, and
          action type. All entries are append-only and tamper-proof.
        </p>
        <div style={st.ruleRow}>
          <span>Audit entries logged:</span>
          <span style={st.badgeGood}>● Active & Recording</span>
        </div>
        <div style={st.ruleRow}>
          <span>Field-level PO diff logging:</span>
          <span style={st.badgeGood}>● Active</span>
        </div>
      </div>
    </div>
  );
}

const st = {
  panel: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  header: { marginBottom: 4 } as CSSProperties,
  title: { fontSize: 18, fontWeight: 700, margin: 0 } as CSSProperties,
  desc: { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.55 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as CSSProperties,
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 } as CSSProperties,
  link: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  ruleRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 } as CSSProperties,
  badgeGood: { fontSize: 10, fontWeight: 800, background: 'var(--good-soft)', color: 'var(--good)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
};
