'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Roles & RBAC panel — wraps the existing roles admin client. */
export default function RolesPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🔐 Roles & RBAC Grants</h3>
        <p style={st.desc}>
          Named permission bundles (e.g. <code>procurement.*</code>, <code>finance.invoice.approve</code>)
          granted to users. Exactly what the API guard enforces once authentication is on.
        </p>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Role Definitions & User Grants</h4>
          <Link href="/admin/access" style={st.link}>Open Roles Manager →</Link>
        </div>
        <p style={st.cardDesc}>
          Create roles, define permission patterns, and assign them to users with organization
          scope. Grants are enforced on every API request through the <code>@Permissions</code> guard.
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
