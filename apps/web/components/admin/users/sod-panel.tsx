'use client';

import React from 'react';
import type { CSSProperties } from 'react';

/** Segregation of Duties panel — maker-checker commercial rules. */
export default function SodPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>⚔️ Segregation of Duties</h3>
        <p style={st.desc}>
          Maker-checker rules preventing the same user from preparing and approving the same
          financial document. Enforcement is at the API guard level — the UI simply reflects status.
        </p>
      </div>

      <div style={st.card}>
        <h4 style={st.cardTitle}>Active SoD Rules</h4>
        <div style={st.ruleRow}>
          <span>Quote Preparer → Approval Block</span>
          <span style={st.badgeGood}>ACTIVE</span>
        </div>
        <div style={st.ruleRow}>
          <span>IPC Certifier → AR Invoice Block</span>
          <span style={st.badgeGood}>ACTIVE</span>
        </div>
        <div style={st.ruleRow}>
          <span>PO Creator → Self-Approval Block</span>
          <span style={st.badgeGood}>ACTIVE</span>
        </div>
        <div style={st.ruleRow}>
          <span>Self-Approval Threshold Limit</span>
          <span style={st.badgeWarn}>RESTRICTED</span>
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
  cardTitle: { fontSize: 14, fontWeight: 700, margin: '0 0 10px' } as CSSProperties,
  ruleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px dashed var(--border)',
    fontSize: 13,
  } as CSSProperties,
  badgeGood: { fontSize: 10, fontWeight: 800, background: 'var(--good-soft)', color: 'var(--good)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
  badgeWarn: { fontSize: 10, fontWeight: 800, background: 'var(--warn-soft)', color: 'var(--warn)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
};
