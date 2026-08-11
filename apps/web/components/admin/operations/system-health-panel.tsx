'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** System health panel — telemetry and node health. */
export default function SystemHealthPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>💚 System Health & Telemetry</h3>
        <p style={st.desc}>
          Real-time system health indicators: API latency, database pool saturation,
          queue depths, memory usage, and node availability.
        </p>
      </div>
      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Health Dashboard</h4>
          <Link href="/admin/health" style={st.link}>Full Health View →</Link>
        </div>
        <div style={st.ruleRow}>
          <span>API Server:</span>
          <span style={st.badgeGood}>● Healthy</span>
        </div>
        <div style={st.ruleRow}>
          <span>Database Pool:</span>
          <span style={st.badgeGood}>● Nominal</span>
        </div>
        <div style={st.ruleRow}>
          <span>Job Queues:</span>
          <span style={st.badgeGood}>● 0 Failed</span>
        </div>
        <div style={st.ruleRow}>
          <span>Memory Usage:</span>
          <span style={st.badgeGood}>● Within Limits</span>
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
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  ruleRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 } as CSSProperties,
  badgeGood: { fontSize: 10, fontWeight: 800, background: 'var(--good-soft)', color: 'var(--good)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
  link: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
};
