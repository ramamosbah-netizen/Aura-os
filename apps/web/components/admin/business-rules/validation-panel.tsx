'use client';

import React from 'react';
import type { CSSProperties } from 'react';

/** Validation rules panel — field-level validation constraints. */
export default function ValidationPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>✅ Validation Rules</h3>
        <p style={st.desc}>
          Business validation constraints enforced at both the API and UI layer. These rules
          prevent invalid data from being persisted regardless of the client interface.
        </p>
      </div>

      <div style={st.card}>
        <h4 style={st.cardTitle}>Active Validation Constraints</h4>
        <div style={st.ruleRow}>
          <span>PO Amount ≤ Contract Ceiling</span>
          <span style={st.badgeGood}>ENFORCED</span>
        </div>
        <div style={st.ruleRow}>
          <span>Invoice Date ≤ Fiscal Period End</span>
          <span style={st.badgeGood}>ENFORCED</span>
        </div>
        <div style={st.ruleRow}>
          <span>Quotation Expiry +30 Days Auto-Set</span>
          <span style={st.badgeGood}>ENFORCED</span>
        </div>
        <div style={st.ruleRow}>
          <span>Duplicate PO Detection (Idempotency SHA-256)</span>
          <span style={st.badgeGood}>ENFORCED</span>
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
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: 13,
  } as CSSProperties,
  badgeGood: { fontSize: 10, fontWeight: 800, background: 'var(--good-soft)', color: 'var(--good)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
};
