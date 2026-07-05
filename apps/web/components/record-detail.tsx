import type { CSSProperties, ReactNode } from 'react';
import RecordChrome from './record-chrome';

export interface RecordField {
  label: string;
  value: ReactNode;
}

export interface RecordLink {
  label: string;
  href: string;
}

/**
 * Shared layout for record detail pages (Account, Contract, Project, PO, Invoice…):
 * back link, type/status header, field grid, related links. Server-safe — the only
 * client island is the embedded <RecordChrome> (recent-items + breadcrumb title).
 */
export default function RecordDetail({
  type,
  title,
  status,
  backHref,
  backLabel,
  fields,
  links = [],
  children,
}: {
  type: string;
  title: string;
  status?: string | null;
  backHref: string;
  backLabel: string;
  fields: RecordField[];
  links?: RecordLink[];
  children?: ReactNode;
}) {
  return (
    <div style={s.page}>
      <RecordChrome type={type} title={title} />
      <div style={s.navRow}>
        <a href={backHref} style={s.back}>
          ← {backLabel}
        </a>
      </div>

      <div style={s.headerRow}>
        <div>
          <div style={s.kind}>{type}</div>
          <h1 style={s.h1}>{title}</h1>
        </div>
        {status ? <span style={s.status}>{status}</span> : null}
      </div>

      <section style={s.panel}>
        <div style={s.grid}>
          {fields.map((f) => (
            <div key={f.label}>
              <div style={s.fieldLabel}>{f.label}</div>
              <div style={s.fieldValue}>{f.value ?? '—'}</div>
            </div>
          ))}
        </div>
      </section>

      {links.length > 0 ? (
        <section style={{ ...s.panel, marginTop: 14 }}>
          <div style={s.fieldLabel}>Related</div>
          <div style={s.links}>
            {links.map((l) => (
              <a key={l.href} href={l.href} style={s.relLink}>
                {l.label} →
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {children}
    </div>
  );
}

export function RecordNotFound({ type, backHref, backLabel }: { type: string; backHref: string; backLabel: string }) {
  return (
    <div style={s.page}>
      <h1 style={s.h1}>{type} not found</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
        This record does not exist, or you do not have permission to view it.
      </p>
      <a href={backHref} style={s.back}>
        ← {backLabel}
      </a>
    </div>
  );
}

const s = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  navRow: { marginBottom: 16 } as CSSProperties,
  back: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  } as CSSProperties,
  kind: {
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--muted)',
    marginBottom: 4,
  } as CSSProperties,
  h1: { fontSize: 26, margin: 0, letterSpacing: -0.4 } as CSSProperties,
  status: {
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--accent)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '4px 12px',
    whiteSpace: 'nowrap',
    textTransform: 'capitalize',
  } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  } as CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px 20px',
  } as CSSProperties,
  fieldLabel: {
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--muted)',
    marginBottom: 3,
  } as CSSProperties,
  fieldValue: { fontSize: 14.5, color: 'var(--text)', wordBreak: 'break-word' } as CSSProperties,
  links: { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 } as CSSProperties,
  relLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14 } as CSSProperties,
};
