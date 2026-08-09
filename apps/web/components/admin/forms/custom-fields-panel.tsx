'use client';

import React from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

/** Custom fields panel — dynamic metadata fields engine. */
export default function CustomFieldsPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>🏷 Custom Metadata Fields</h3>
        <p style={st.desc}>
          Add custom fields to Leads, POs, Contracts, and Site Reports without database migration.
          Fields are stored in a flexible JSONB store and rendered dynamically in forms.
        </p>
      </div>
      <div style={st.card}>
        <div style={st.cardTop}>
          <h4 style={st.cardTitle}>Custom Field Definitions</h4>
          <Link href="/admin/forms" style={st.link}>Open Field Manager →</Link>
        </div>
        <p style={st.cardDesc}>
          Define text, number, date, dropdown, and multi-select fields per entity type.
          Validation rules and required/optional status are configurable per field.
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
