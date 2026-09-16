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
      {/* The register's create control leads the toolbar, where every Sales register puts it. Given
          its own row it stretched to the full width of the canvas — a flex column stretches its
          children — and read as a banner rather than a button. */}
      {children}
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
    </div>
  );
}

/**
 * The panel a register's table sits in — and, more importantly, the container that keeps the table
 * inside it.
 *
 * A register table cannot be made narrow: an order row carries seven columns and none of them is
 * optional. Uncontained, it sets the width of the whole document — measured on the purchase orders
 * register at 375px, a 616px table in a 341px panel gave the page 266px of sideways travel, so the
 * header, the KPI row and the navigation all slid off the screen together. The Sales registers never
 * did this because each one wraps its table in an overflow container by hand; this is the same
 * container, named once instead of copied a fourth time.
 */
export function RegisterPanel({ children, scroll = true, testId }: {
  children: ReactNode;
  /** Off only when the panel holds prose rather than a table — an empty state has nothing to scroll. */
  scroll?: boolean;
  testId?: string;
}) {
  return (
    <section style={st.panel} data-testid={testId}>
      {scroll ? <div className="table-scroll">{children}</div> : children}
    </section>
  );
}

/**
 * The register table's measurements, lifted verbatim from the accounts portfolio.
 *
 * Three registers had each hand-rolled this and arrived at three different answers — cell padding of
 * 10/12, 11/12 and 8/10px, header type at 12, 12.5 and 11.5px, and the status chip in two shapes.
 * Nobody chose that; it is what copying produces. One definition, so the suites are identical rather
 * than merely similar.
 *
 * `whiteSpace: 'nowrap'` on the header and the chip is load-bearing, not cosmetic: it is what makes a
 * narrow table SCROLL inside `RegisterPanel` rather than crush its own columns into unreadable stacks.
 */
export const registerTable = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  thRight: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '10px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  tdMuted: { padding: '10px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', verticalAlign: 'top' } as CSSProperties,
  tdRight: { padding: '10px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 11.5, marginTop: 2 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  chip: { display: 'inline-block', fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
};

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
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 8px' } as CSSProperties,
  headRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 6px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  actions: { display: 'flex', gap: 8 } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10, margin: '4px 0 18px' } as CSSProperties,
  /**
   * The card is a column with the figure pinned to the bottom, so a label that needs two lines does
   * not push its number out of line with the others. `Value awaiting a decision` was being clipped
   * mid-word — the label was `nowrap` in a cell that cannot grow, which reads as a rendering fault
   * rather than a long label. A headline figure has to survive its own wording at any screen size.
   */
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4, minWidth: 0 } as CSSProperties,
  kpiLabel: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.3 } as CSSProperties,
  kpiValue: { fontSize: 19, fontWeight: 700, letterSpacing: -0.3, whiteSpace: 'nowrap' } as CSSProperties,
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 14px' } as CSSProperties,
  viewsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  viewBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  viewBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  viewCount: { fontSize: 11, background: 'var(--panel-2)', borderRadius: 999, padding: '1px 7px', color: 'var(--muted)' } as CSSProperties,
  // `maxWidth` guards the `minWidth` below it: on a narrow phone a 260px floor is wider than the
  // content box, and an input that cannot shrink is exactly how a page starts scrolling sideways.
  search: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 9, padding: '8px 12px', fontSize: 13, minWidth: 260, maxWidth: '100%' } as CSSProperties,
};
