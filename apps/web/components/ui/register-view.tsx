'use client';

import { type CSSProperties, type ReactNode } from 'react';

/**
 * The shape every register in this application already has — made shareable.
 *
 * The Sales suite sets the pattern and every one of its registers follows it: a headline figure row
 * a manager reads first, named views with counts so somebody can ask "what is waiting on me", and a
 * search. The Procurement and Inventory registers had none of it — a bare title and a table — so
 * they read as a different product to anybody moving between suites.
 *
 * This is the same markup and the same measurements, in one place rather than copied. Nothing here
 * is new design: the styles are lifted from the accounts portfolio so the two suites are identical
 * rather than merely similar.
 */

export interface RegisterKpi {
  label: string;
  value: string;
  /** Only when the number itself carries a warning or a reassurance — never for decoration. */
  tone?: 'good' | 'warn' | 'bad' | 'accent';
}

const TONE: Record<NonNullable<RegisterKpi['tone']>, string> = {
  good: 'var(--good)',
  warn: 'var(--warn, #b7791f)',
  bad: 'var(--bad)',
  accent: 'var(--accent)',
};

export function RegisterKpis({ items }: { items: RegisterKpi[] }) {
  return (
    <div style={st.kpiRow} data-testid="register-kpis">
      {items.map((k) => (
        <div key={k.label} style={st.kpi}>
          <div style={st.kpiLabel}>{k.label}</div>
          <div style={{ ...st.kpiValue, ...(k.tone ? { color: TONE[k.tone] } : {}) }} data-testid={`kpi-${k.label.toLowerCase().replace(/\s+/g, '-')}`}>
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface RegisterViewOption<K extends string> {
  key: K;
  label: string;
  count: number;
}

/**
 * Named views with counts, and a search.
 *
 * The counts are the point: a view button that does not say how many are behind it makes somebody
 * click every one to find the work. `children` takes whatever the register's own create control is,
 * so the toolbar stays one row rather than three.
 */
export function RegisterToolbar<K extends string>({
  views, active, onView, search, onSearch, placeholder, children,
}: {
  views: RegisterViewOption<K>[];
  active: K;
  onView: (key: K) => void;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div style={st.toolbar} data-testid="register-toolbar">
      <div style={st.viewsRow}>
        {views.map((v) => {
          const isActive = v.key === active;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onView(v.key)}
              style={{ ...st.viewBtn, ...(isActive ? st.viewBtnActive : {}) }}
              data-testid={`view-${v.key}`}
            >
              {v.label}
              <span style={{ ...st.viewCount, ...(isActive ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : {}) }}>
                {v.count}
              </span>
            </button>
          );
        })}
      </div>
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        style={st.search}
        data-testid="register-search"
        aria-label={placeholder}
      />
      {children}
    </div>
  );
}

/** The page header every register shares: title and explanation left, actions right. */
export function RegisterHeader({ title, children, actions }: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={st.headRow}>
      <div>
        <h1 style={st.h1}>{title}</h1>
        <p style={st.sub}>{children}</p>
      </div>
      {actions && <div style={st.actions}>{actions}</div>}
    </div>
  );
}

const st = {
  headRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 6px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  actions: { display: 'flex', gap: 8 } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10, margin: '4px 0 18px' } as CSSProperties,
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' } as CSSProperties,
  kpiLabel: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, whiteSpace: 'nowrap' } as CSSProperties,
  kpiValue: { fontSize: 19, fontWeight: 700, letterSpacing: -0.3, whiteSpace: 'nowrap' } as CSSProperties,
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 14px' } as CSSProperties,
  viewsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  viewBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  viewBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  viewCount: { fontSize: 11, background: 'var(--panel-2)', borderRadius: 999, padding: '1px 7px', color: 'var(--muted)' } as CSSProperties,
  search: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 9, padding: '8px 12px', fontSize: 13, minWidth: 260 } as CSSProperties,
};
