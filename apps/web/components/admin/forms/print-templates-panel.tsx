'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Print templates panel — PDF/HTML document layouts. */
export default function PrintTemplatesPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🖨 Print Templates & Document Layouts</h3>
        <p style={st.desc}>
          Customize PDF headers, footers, page breaks, and layout for POs, invoices,
          quotations, and certificates. HTML template builder with live preview.
        </p>
      </div>
      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Template Library</h4>
          <Link href="/admin/templates" style={st.link}>Open Template Builder →</Link>
        </div>
        <p style={st.cardDesc}>
          Design and preview print-ready document templates with drag-and-drop section
          positioning, logo placement, and legal disclaimer management.
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
