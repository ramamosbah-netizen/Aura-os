'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Company branding panel — TRN, VAT, logos. */
export default function BrandingPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🏢 Company Branding & TRN</h3>
        <p style={st.desc}>
          Configure company logos, tax registration numbers (TRN), VAT identifiers,
          and legal entity display names across all printed documents and PDFs.
        </p>
      </div>
      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Organization Profile</h4>
          <Link href="/admin/organization" style={st.link}>Edit Branding →</Link>
        </div>
        <p style={st.cardDesc}>
          Manage company name, logo, TRN number, address, and legal footer that appears
          on all generated documents and customer-facing communications.
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
