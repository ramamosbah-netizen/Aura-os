import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

// Shared Administration-Center chrome: a professional page header (eyebrow → title →
// subtitle), a KPI strip, section cards, and a back-to-hub link. Server-safe (no hooks),
// fully theme-token driven so it flips with the ELV navy/amber palette. Used by the
// /admin hub and every admin sub-page for a consistent, deep look.

export interface Kpi {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'accent' | 'good' | 'warn' | 'bad' | 'info';
}

const toneColor: Record<NonNullable<Kpi['tone']>, string> = {
  accent: 'var(--accent)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  info: 'var(--info)',
};

/** The full-width gradient page header used at the top of every admin screen. */
export function AdminHeader({
  title,
  subtitle,
  glyph,
  kpis,
  actions,
  backToHub,
}: {
  title: string;
  subtitle?: ReactNode;
  glyph?: string;
  kpis?: Kpi[];
  actions?: ReactNode;
  backToHub?: boolean;
}) {
  return (
    <header style={cs.header}>
      <div style={cs.headTop}>
        <div style={{ minWidth: 0 }}>
          {backToHub ? (
            <Link href="/admin" style={cs.back}>
              ← Administration Center
            </Link>
          ) : (
            <div style={cs.eyebrow}>ADMINISTRATION CENTER</div>
          )}
          <h1 style={cs.h1}>
            {glyph ? <span style={cs.h1Glyph}>{glyph}</span> : null}
            {title}
          </h1>
          {subtitle ? <p style={cs.sub}>{subtitle}</p> : null}
        </div>
        {actions ? <div style={cs.actions}>{actions}</div> : null}
      </div>
      {kpis && kpis.length > 0 ? (
        <div style={cs.kpiStrip}>
          {kpis.map((k, i) => (
            <div key={i} style={cs.kpi}>
              <div style={cs.kpiLabel}>{k.label}</div>
              <div style={{ ...cs.kpiValue, color: k.tone ? toneColor[k.tone] : 'var(--text)' }}>{k.value}</div>
              {k.sub ? <div style={cs.kpiSub}>{k.sub}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}

/** A titled card block for grouping content under the header. */
export function AdminCard({
  title,
  desc,
  right,
  children,
}: {
  title?: string;
  desc?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={cs.card}>
      {(title || right) && (
        <div style={cs.cardHead}>
          <div>
            {title ? <h3 style={cs.cardTitle}>{title}</h3> : null}
            {desc ? <p style={cs.cardDesc}>{desc}</p> : null}
          </div>
          {right ? <div>{right}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/** Shown when an admin data fetch returns null (API unreachable). */
export function AdminOffline({ label }: { label: string }) {
  return (
    <div style={cs.offline}>
      <span style={cs.offlineDot} />
      {label} API is offline — start the API server (<code style={cs.code}>pnpm --filter @aura/api dev</code>) and reload.
    </div>
  );
}

export const adminPage: CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: '26px 28px 72px' };

const cs = {
  header: {
    background: 'linear-gradient(135deg, var(--panel) 0%, var(--panel-2) 100%)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '22px 24px',
    marginBottom: 22,
    position: 'relative',
    overflow: 'hidden',
  } as CSSProperties,
  headTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 } as CSSProperties,
  eyebrow: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
    color: 'var(--accent)',
    marginBottom: 8,
  } as CSSProperties,
  back: {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: 'var(--accent)',
    marginBottom: 8,
  } as CSSProperties,
  h1: { fontSize: 26, margin: 0, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 11 } as CSSProperties,
  h1Glyph: {
    width: 40,
    height: 40,
    borderRadius: 11,
    background: 'var(--accent-grad)',
    color: 'var(--accent-ink)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    flexShrink: 0,
    boxShadow: '0 4px 14px var(--accent-soft)',
  } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '9px 0 0', maxWidth: 780, lineHeight: 1.55, fontSize: 13.5 } as CSSProperties,
  actions: { display: 'flex', gap: 10, flexShrink: 0 } as CSSProperties,
  kpiStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
    marginTop: 20,
  } as CSSProperties,
  kpi: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '13px 15px',
  } as CSSProperties,
  kpiLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: 6,
  } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 800, lineHeight: 1 } as CSSProperties,
  kpiSub: { fontSize: 11.5, color: 'var(--muted)', marginTop: 5 } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    boxShadow: 'var(--shadow-sm)',
  } as CSSProperties,
  cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text)' } as CSSProperties,
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 } as CSSProperties,
  offline: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bad-soft)',
    border: '1px solid var(--bad)',
    color: 'var(--bad)',
    borderRadius: 12,
    padding: '14px 16px',
    fontSize: 13,
  } as CSSProperties,
  offlineDot: { width: 8, height: 8, borderRadius: 999, background: 'var(--bad)', flexShrink: 0 } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
    color: 'var(--text)',
  } as CSSProperties,
};
