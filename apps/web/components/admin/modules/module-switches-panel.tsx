'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** ERP module switches panel — one-click enable/disable per company entity. */
export default function ModuleSwitchesPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🧩 ERP Module Manager</h3>
        <p style={st.desc}>
          Enable or disable ERP business modules per company entity with one-click visual
          switches. Disabled modules are enforced at UI (route guard), API (403 MODULE_DISABLED),
          and service layers — not just hidden from the sidebar.
        </p>
      </div>
      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Module Activation Status</h4>
          <Link href="/admin/modules" style={st.link}>Open Module Switches →</Link>
        </div>
        <p style={st.cardDesc}>
          Toggle module availability across the entire tenant. Changes take effect
          immediately on the next request — no restart required.
        </p>
        <div style={st.historyRow}>
          <span style={st.historyLabel}>Last modified:</span>
          <span>Admin — 08 Aug 2026</span>
          <button type="button" style={st.historyBtn}>View History</button>
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
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 } as CSSProperties,
  link: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  historyRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  historyLabel: { fontWeight: 700 } as CSSProperties,
  historyBtn: {
    background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 11, fontWeight: 600, padding: '2px 8px', color: 'var(--accent)', cursor: 'pointer', marginLeft: 'auto',
  } as CSSProperties,
};
