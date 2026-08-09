'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Workflow panel — workflow stage gates and definition registry. */
export default function WorkflowPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🔄 Workflow Stage Gates</h3>
        <p style={st.desc}>
          Declarative workflow definitions with state machines, transitions, and human
          approval gates. Workflows are enforced through the WorkflowService FSM engine.
        </p>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Workflow Definitions Registry</h4>
          <Link href="/admin/workflows" style={st.link}>Manage Workflows →</Link>
        </div>
        <p style={st.cardDesc}>
          View and manage declarative workflow definitions with live instance counts.
          Each workflow tracks running, completed, and total instances.
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
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
  } as CSSProperties,
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 } as CSSProperties,
  link: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
};
