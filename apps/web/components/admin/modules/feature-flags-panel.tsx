'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Feature flags panel — staged rollout flags. */
export default function FeatureFlagsPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🚩 Feature Flags</h3>
        <p style={st.desc}>
          Manage staged rollout flags for experimental or beta features. Flags can be scoped
          to specific tenants, user roles, or percentage-based cohorts.
        </p>
      </div>
      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Active Feature Flags</h4>
          <Link href="/admin/feature-flags" style={st.link}>Manage Flags →</Link>
        </div>
        <p style={st.cardDesc}>
          Toggle features on/off, set rollout percentages, and define targeting rules
          for progressive feature delivery.
        </p>
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
};
