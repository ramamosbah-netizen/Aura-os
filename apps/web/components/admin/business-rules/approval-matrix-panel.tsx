'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Visual approval matrix panel — zero-JSON visual spend tier cards. */
export default function ApprovalMatrixPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>⚖ Approval Matrix</h3>
        <p style={st.desc}>
          Ordered approval rules per entity type. The first rule whose conditions all match
          decides who must approve and how many. Lower order is evaluated first.
        </p>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Purchase Order Approval Tiers</h4>
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
        <div style={st.historyRow}>
          <span style={st.historyLabel}>Last modified:</span>
          <span>Admin — 09 Aug 2026</span>
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
  visualRuleTable: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  ruleItem: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px dashed var(--border)' } as CSSProperties,
  badgeBad: { fontSize: 10, fontWeight: 800, color: 'var(--bad)' } as CSSProperties,
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    fontSize: 11.5,
    color: 'var(--muted)',
  } as CSSProperties,
  historyLabel: { fontWeight: 700 } as CSSProperties,
  historyBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    color: 'var(--accent)',
    cursor: 'pointer',
    marginLeft: 'auto',
  } as CSSProperties,
};
