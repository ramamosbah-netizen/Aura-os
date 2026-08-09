'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Users panel — links to the existing users admin client. */
export default function UsersPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>👥 User Directory</h3>
        <p style={st.desc}>
          Manage enterprise user accounts: register or invite users, assign company context,
          activate or deactivate accounts. Enforcement is immediate at login and on every API request.
        </p>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Active User Accounts</h4>
          <Link href="/admin/users" style={st.link}>Open Full User Manager →</Link>
        </div>
        <p style={st.cardDesc}>
          Register new accounts, assign company entities, deactivate leavers.
          Deactivation immediately blocks login and revokes all API grants.
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
