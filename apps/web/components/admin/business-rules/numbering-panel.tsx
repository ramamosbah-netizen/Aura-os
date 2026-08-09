'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Document numbering panel — sequence formulas per entity type. */
export default function NumberingPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🔢 Document Numbering Sequences</h3>
        <p style={st.desc}>
          Auto-generated numbering formulas for business documents. Each entity type has a
          configurable prefix, year placeholder, and sequential counter.
        </p>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Active Numbering Formulas</h4>
          <Link href="/admin/numbering" style={st.link}>Edit Sequences →</Link>
        </div>
        <div style={st.ruleTable}>
          <div style={st.ruleItem}>
            <span>Purchase Orders:</span>
            <code style={st.code}>PO-2026-XXXX</code>
          </div>
          <div style={st.ruleItem}>
            <span>Customer Invoices:</span>
            <code style={st.code}>AR-INV-2026-XXXX</code>
          </div>
          <div style={st.ruleItem}>
            <span>IPC Certificates:</span>
            <code style={st.code}>IPC-2026-XXXX</code>
          </div>
          <div style={st.ruleItem}>
            <span>Quotations:</span>
            <code style={st.code}>QT-2026-XXXX</code>
          </div>
        </div>
        <div style={st.historyRow}>
          <span style={st.historyLabel}>Last modified:</span>
          <span>Admin — 05 Aug 2026</span>
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
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
  } as CSSProperties,
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  link: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  ruleTable: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  ruleItem: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px dashed var(--border)' } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12, background: 'var(--panel-2)', padding: '1px 6px', borderRadius: 4 } as CSSProperties,
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11.5, color: 'var(--muted)',
  } as CSSProperties,
  historyLabel: { fontWeight: 700 } as CSSProperties,
  historyBtn: {
    background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 11, fontWeight: 600, padding: '2px 8px', color: 'var(--accent)', cursor: 'pointer', marginLeft: 'auto',
  } as CSSProperties,
};
