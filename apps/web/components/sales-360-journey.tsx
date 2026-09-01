import type { CSSProperties } from 'react';

type Surface = 'lead' | 'opportunity' | 'tender' | 'quotation';

const STEPS: Array<{ id: Surface | 'signal' | 'scope' | 'estimate' | 'contract'; label: string; href: string; detail: string }> = [
  { id: 'signal', label: 'Signal', href: '/crm/radar', detail: 'discover' },
  { id: 'lead', label: 'Lead', href: '/crm/leads', detail: 'qualify' },
  { id: 'opportunity', label: 'Opportunity', href: '/crm/pipeline?view=board', detail: 'shape the deal' },
  { id: 'scope', label: 'Scope / BOQ', href: '/tendering/tenders', detail: 'define the work' },
  { id: 'estimate', label: 'Estimation', href: '/tendering/pricing', detail: 'cost + recommend' },
  { id: 'quotation', label: 'Quotation', href: '/crm/quotations', detail: 'customer price' },
  { id: 'contract', label: 'Contract', href: '/contracts/contracts', detail: 'commercial handoff' },
];

/**
 * Shared, read-only journey rail for every Sales 360 record. It makes the same
 * Signal → Contract chain visible without moving ownership or adding mutations.
 */
export default function Sales360Journey({ current }: { current: Surface }) {
  return (
    <section data-testid="sales-360-journey" style={st.section} aria-label="Sales and Commercial journey">
      <div style={st.header}>
        <div>
          <span style={st.kicker}>SALES &amp; COMMERCIAL / 360 CONTEXT</span>
          <span style={st.caption}>Follow the chain; work in the highlighted record owner.</span>
        </div>
        <a href="/crm/overview" style={st.cockpit}>Open cockpit ↗</a>
      </div>
      <nav style={st.steps} aria-label="Sales record journey">
        {STEPS.map((step, index) => {
          const active = step.id === current;
          return (
            <span key={step.id} style={st.stepWrap}>
              <a
                href={step.href}
                aria-current={active ? 'page' : undefined}
                style={{ ...st.step, ...(active ? st.stepActive : {}) }}
              >
                <span style={st.stepLabel}>{step.label}</span>
                <span style={st.stepDetail}>{step.detail}</span>
              </a>
              {index < STEPS.length - 1 && <span style={st.arrow} aria-hidden>›</span>}
            </span>
          );
        })}
      </nav>
      <div style={st.branchRow}>
        <span style={st.branchLabel}>Opportunity path</span>
        <a href="/crm/pipeline?view=board" style={st.branch}>Direct <span>Scope → Estimate</span></a>
        <a href="/tendering/tenders" style={st.branch}>Tender <span>Bid / No-Bid → BOQ</span></a>
      </div>
    </section>
  );
}

const st: Record<string, CSSProperties> = {
  section: { margin: '0 0 16px', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 16, background: 'linear-gradient(125deg, color-mix(in srgb, var(--accent) 7%, var(--panel)), var(--panel) 58%)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 },
  kicker: { display: 'block', color: 'var(--accent)', fontSize: 9.5, letterSpacing: '.16em', fontWeight: 850 },
  caption: { display: 'block', marginTop: 4, color: 'var(--muted)', fontSize: 11.5 },
  cockpit: { color: 'var(--accent)', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' },
  steps: { display: 'flex', alignItems: 'stretch', gap: 4, overflowX: 'auto', paddingBottom: 2 },
  stepWrap: { display: 'inline-flex', alignItems: 'center', gap: 4, flex: '1 0 104px' },
  step: { minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', color: 'var(--text)', textDecoration: 'none' },
  stepActive: { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 13%, var(--panel))', boxShadow: '0 0 0 1px var(--accent-soft)' },
  stepLabel: { fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  stepDetail: { color: 'var(--muted)', fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  arrow: { color: 'var(--accent)', fontSize: 18, lineHeight: 1, alignSelf: 'center' },
  branchRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' },
  branchLabel: { color: 'var(--muted)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' },
  branch: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--panel-2)', color: 'var(--text)', fontSize: 11, fontWeight: 750, textDecoration: 'none' },
};
