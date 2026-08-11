'use client';

import React from 'react';
import type { CSSProperties } from 'react';

/** Delegation panel — authority delegation configuration. */
export default function DelegationPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>📋 Authority Delegation</h3>
        <p style={st.desc}>
          Configure temporary authority delegation rules. When a manager is on leave or
          unavailable, their approval authority can be delegated to an alternate with
          time-boxed validity and full audit logging.
        </p>
      </div>

      <div style={st.card}>
        <h4 style={st.cardTitle}>Active Delegation Rules</h4>
        <p style={st.cardDesc}>
          No active delegation rules. Set up temporary authority transfers with start/end
          dates, delegator, delegate, and scope restrictions.
        </p>
        <div style={st.emptyState}>
          <span style={st.emptyIcon}>📋</span>
          <span>No delegation rules configured. Authority flows through direct RBAC grants.</span>
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
  cardTitle: { fontSize: 14, fontWeight: 700, margin: '0 0 8px' } as CSSProperties,
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 } as CSSProperties,
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    background: 'var(--panel-2)',
    border: '1px dashed var(--border)',
    borderRadius: 10,
    fontSize: 12.5,
    color: 'var(--muted)',
  } as CSSProperties,
  emptyIcon: { fontSize: 18 } as CSSProperties,
};
