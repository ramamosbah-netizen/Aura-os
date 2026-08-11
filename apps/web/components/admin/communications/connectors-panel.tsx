'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** REST API connectors panel. */
export default function ConnectorsPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🔌 REST API Connectors</h3>
        <p style={st.desc}>
          External system integrations: ERP connectors, CRM bridges, accounting system
          sync endpoints. Each connector has health monitoring and authentication management.
        </p>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Integration Connectors</h4>
          <Link href="/admin/connectors" style={st.link}>Manage Connectors →</Link>
        </div>
        <p style={st.cardDesc}>
          Configure REST API integration endpoints with authentication credentials,
          health checks, and data mapping schemas.
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
