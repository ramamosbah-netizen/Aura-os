'use client';

import { type CSSProperties, type ReactNode, useState } from 'react';

// ── AURA CRM Design System ────────────────────────────────────────────────────
// One record experience for EVERY entity (Lead, Account, Contact, Opportunity,
// Quotation…). Every 360 page composes the same primitives so the whole CRM reads
// as one platform, not a pile of pages:
//
//   <RecordShell>
//     header  → RecordHeader (title · status · meta · score · ACTIONS on top)
//     kpis    → KpiRow       (the numbers that matter, always at the top)
//     tabs    → RecordTabs   (fixed, per-record sections)
//     main    → the active tab's content (RecordCard / InfoRow grids)
//     aside   → InsightsPanel (the AI/next-action rail, always present)
//     footer  → Timeline / Related records (always present at the bottom)
//
// It owns layout + chrome only; each page supplies the content. Colours come from
// the shared CSS variables so light/dark and the ELV theme just work.

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

const toneColor = (t?: Tone): string =>
  t === 'good' ? 'var(--good)' : t === 'bad' ? 'var(--bad)' : t === 'warn' ? 'var(--warn, #d97706)'
    : t === 'accent' ? 'var(--accent)' : 'var(--fg)';

// ── Header ─────────────────────────────────────────────────────────────────────
export interface MetaItem { label?: string; value: ReactNode }
export function RecordHeader({
  title, status, statusTone = 'accent', meta = [], score, actions,
}: {
  title: string;
  status?: string;
  statusTone?: Tone;
  meta?: MetaItem[];
  score?: { value: ReactNode; label: string; badge?: string; badgeTone?: Tone };
  actions?: ReactNode;
}) {
  return (
    <div style={rs.header}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 style={rs.h1}>{title}</h1>
        <div style={rs.subline}>
          {status && <span style={{ ...rs.statusPill, borderColor: toneColor(statusTone), color: toneColor(statusTone) }}>{status}</span>}
          {meta.map((m, i) => (
            <span key={i}>{m.label && <span style={{ color: 'var(--muted)' }}>{m.label}: </span>}{m.value}</span>
          ))}
        </div>
        {actions && <div style={rs.actionRow}>{actions}</div>}
      </div>
      {score && (
        <div style={rs.scoreBox}>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: toneColor(score.badgeTone ?? 'accent') }}>{score.value}</div>
          <div style={rs.scoreLabel}>{score.label}</div>
          {score.badge && <div style={{ ...rs.recBadge, color: toneColor(score.badgeTone), borderColor: toneColor(score.badgeTone) }}>{score.badge}</div>}
        </div>
      )}
    </div>
  );
}

// ── Action buttons (shared look) ────────────────────────────────────────────────
export function ActionButton({
  children, onClick, kind = 'ghost', disabled, href,
}: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean; href?: string }) {
  const style = kind === 'primary' ? rs.primaryBtn : rs.ghostBtn;
  if (href) return <a href={href} style={{ ...style, textDecoration: 'none' }}>{children}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

// ── KPI row ──────────────────────────────────────────────────────────────────────
export interface KpiItem { label: string; value: ReactNode; tone?: Tone; hint?: string }
export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div style={rs.kpiRow}>
      {items.map((k, i) => (
        <div key={i} style={rs.kpi} title={k.hint}>
          <div style={rs.kpiLabel}>{k.label}</div>
          <div style={{ ...rs.kpiValue, color: toneColor(k.tone) }}>{k.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────────
export interface TabDef { id: string; label: string; count?: number }
export function RecordTabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  return (
    <div style={rs.tabs}>
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          style={{ ...rs.tab, ...(active === t.id ? rs.tabOn : {}) }}>
          {t.label}
          {t.count !== undefined && t.count > 0 && <span style={rs.tabCount}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Cards / rows ───────────────────────────────────────────────────────────────────
export function RecordCard({ title, action, children, span = 1 }: { title?: string; action?: ReactNode; children: ReactNode; span?: 1 | 2 }) {
  return (
    <section style={{ ...rs.card, ...(span === 2 ? { gridColumn: '1 / -1' } : {}) }}>
      {(title || action) && (
        <div style={rs.cardHead}>
          {title && <div style={rs.cardTitle}>{title}</div>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={rs.infoRow}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>{value ?? '—'}</span>
    </div>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div style={rs.cardGrid}>{children}</div>;
}

// ── Insights / AI rail (always present) ─────────────────────────────────────────────
export interface Insight { tone?: Tone; title: string; detail?: string; action?: { label: string; onClick?: () => void; href?: string } }
export function InsightsPanel({ title = 'Insights & next actions', insights }: { title?: string; insights: Insight[] }) {
  return (
    <aside style={rs.aside}>
      <div style={rs.asideHead}>
        <span style={rs.aiDot} /> {title}
      </div>
      {insights.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: 0 }}>Nothing needs attention — you're on top of this one.</p>
      ) : (
        insights.map((n, i) => (
          <div key={i} style={{ ...rs.insight, borderLeftColor: toneColor(n.tone ?? 'accent') }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.title}</div>
            {n.detail && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{n.detail}</div>}
            {n.action && (n.action.href
              ? <a href={n.action.href} style={rs.insightAction}>{n.action.label} →</a>
              : <button type="button" onClick={n.action.onClick} style={rs.insightAction}>{n.action.label} →</button>)}
          </div>
        ))
      )}
    </aside>
  );
}

// ── Universal Object Shell — the band primitives ─────────────────────────────────────
// Every record answers the key questions ABOVE the fold: what is happening (Situation),
// why it matters now (Health), what is blocking progress (Missing), whether the record
// may advance (WorkflowGate), the ONE thing to do (NextAction), and what happened
// (Outcome). Each is an INDEPENDENT primitive composed inside <RecordBand> — reorder,
// omit, or add per entity:
//
//   <RecordBand tone={health.tone}>
//     <RecordSituation situation={…} />
//     <RecordNextAction action={…} />
//     <RecordHealth health={…} />
//     <RecordMissing items={…} />
//     <RecordWorkflowGate gate={…} />
//     <RecordOutcome outcome={…} />
//   </RecordBand>
//
// New capabilities (Compliance, AI read, …) are added as NEW primitives — never as
// props on a growing band component. Primitives only RENDER facts the domain owns.
export interface HealthState { label: string; tone: Tone; reasons?: string[] }
export interface NextBestAction { label: string; hint?: string; onClick?: () => void; href?: string }
// Workflow gate — what must be TRUE to advance to the next state, whatever "state" means
// for the entity: a pipeline stage (opportunity), a document lifecycle (quotation, contract,
// PO, invoice), an approval step (variation, RFI, NCR). The verdict is always resolved
// SERVER-SIDE and passed in; this only renders it, so a preview can never disagree with
// enforcement. `gaps` is empty when the gate is clear.
export interface WorkflowGateView { nextStage?: string; label: string; allowed: boolean; gaps: string[] }
export interface OutcomeChoice { id: string; label: string; tone?: Tone }
export interface OutcomeLoop {
  onSelect: (choiceId: string) => void | Promise<void>;
  choices?: OutcomeChoice[];
  busy?: boolean;
  note?: string | null; // last captured outcome, echoed back inline
}

const DEFAULT_OUTCOMES: OutcomeChoice[] = [
  { id: 'completed', label: 'Completed', tone: 'good' },
  { id: 'failed', label: 'Did not land', tone: 'bad' },
  { id: 'follow_up', label: 'Need follow-up', tone: 'warn' },
  { id: 'reschedule', label: 'Reschedule', tone: 'accent' },
];

// The band container. A flex-wrap row: RecordSituation (flex) and RecordNextAction sit
// side by side on the first line; every other primitive is a full-width separated row.
export function RecordBand({ tone = 'accent', children }: { tone?: Tone; children: ReactNode }) {
  return <section style={{ ...rs.sBand, borderLeftColor: toneColor(tone) }}>{children}</section>;
}

export function RecordSituation({ situation }: { situation: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 240 }}>
      <div style={rs.sLabel}>Situation</div>
      <div style={rs.sText}>{situation}</div>
    </div>
  );
}

export function RecordNextAction({ action }: { action: NextBestAction }) {
  return (
    <div style={rs.sActionBox}>
      <div style={rs.sLabel}>Next best action</div>
      {action.href
        ? <a href={action.href} style={{ ...rs.primaryBtn, textDecoration: 'none', display: 'inline-block' }}>{action.label}</a>
        : <button type="button" onClick={action.onClick} style={rs.primaryBtn}>{action.label}</button>}
      {action.hint && <div style={rs.sActionHint}>{action.hint}</div>}
    </div>
  );
}

export function RecordHealth({ health }: { health: HealthState }) {
  return (
    <div style={rs.sRow}>
      <div style={rs.sHealthRow}>
        <span style={{ ...rs.sHealthPill, color: toneColor(health.tone), borderColor: toneColor(health.tone) }}>{health.label}</span>
        {health.reasons && health.reasons.length > 0 && <span style={rs.sReasons}>{health.reasons.join(' · ')}</span>}
      </div>
    </div>
  );
}

export function RecordMissing({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={rs.sRow}>
      <span style={rs.sLabel}>Missing to progress</span>
      <div style={rs.sChips}>
        {items.map((m) => <span key={m} style={rs.sMissChip}>✕ {m}</span>)}
      </div>
    </div>
  );
}

// Workflow-gate primitive — renders the server's verdict for the next transition. Reused by
// every 360 with a lifecycle; the caller passes the summary's gate view straight through.
export function RecordWorkflowGate({ gate }: { gate: WorkflowGateView }) {
  return (
    <div style={rs.sRow}>
      <span style={rs.sLabel}>Gate to {gate.label}</span>
      {gate.allowed ? (
        <div style={rs.sGateOk}>✓ Clear to advance</div>
      ) : (
        <div style={rs.sChips}>
          {gate.gaps.map((g, i) => <span key={i} style={rs.sGateChip}>{g}</span>)}
        </div>
      )}
    </div>
  );
}

export function RecordOutcome({ outcome }: { outcome: OutcomeLoop }) {
  const [logging, setLogging] = useState(false);
  return (
    <div style={rs.sRow}>
      {outcome.note ? (
        <span style={rs.sOutcomeNote}>✓ {outcome.note}</span>
      ) : logging ? (
        <>
          <span style={rs.sLabel}>What happened?</span>
          <div style={rs.sChips}>
            {(outcome.choices ?? DEFAULT_OUTCOMES).map((c) => (
              <button key={c.id} type="button" disabled={outcome.busy}
                onClick={() => { void outcome.onSelect(c.id); setLogging(false); }}
                style={{ ...rs.sOutcomeChip, color: toneColor(c.tone), borderColor: toneColor(c.tone) }}>
                {c.label}
              </button>
            ))}
            <button type="button" style={rs.sOutcomeCancel} onClick={() => setLogging(false)}>cancel</button>
          </div>
        </>
      ) : (
        <button type="button" style={rs.sLogBtn} onClick={() => setLogging(true)}>＋ Log what happened</button>
      )}
    </div>
  );
}

// ── Shell frame ───────────────────────────────────────────────────────────────────
export function RecordShell({
  header, kpis, situation, tabs, activeTab, onTab, aside, children, footer,
}: {
  header: ReactNode;
  kpis?: KpiItem[];
  situation?: ReactNode;
  tabs?: TabDef[];
  activeTab?: string;
  onTab?: (id: string) => void;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div>
      {header}
      {kpis && kpis.length > 0 && <KpiRow items={kpis} />}
      {situation}
      {tabs && tabs.length > 0 && activeTab && onTab && <RecordTabs tabs={tabs} active={activeTab} onChange={onTab} />}
      <div style={rs.body}>
        <div style={{ minWidth: 0 }}>{children}</div>
        {aside && <div style={rs.asideCol}>{aside}</div>}
      </div>
      {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
    </div>
  );
}

// Small helper so pages don't each re-declare tab state.
export function useTab(initial: string): [string, (id: string) => void] {
  const [tab, setTab] = useState(initial);
  return [tab, setTab];
}

const rs: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 16 },
  h1: { fontSize: 26, margin: '0 0 8px', letterSpacing: -0.5 },
  subline: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: 'var(--muted)' },
  statusPill: { borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '2px 11px', fontSize: 12, fontWeight: 600 },
  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 },
  scoreBox: { textAlign: 'center', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px', flexShrink: 0 },
  scoreLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  recBadge: { marginTop: 5, fontSize: 10.5, fontWeight: 700, borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '1px 8px', letterSpacing: 0.4 },
  primaryBtn: { border: '1px solid var(--accent)', background: 'var(--accent)', color: '#0b1020', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  ghostBtn: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 },
  kpi: { border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', background: 'var(--panel)' },
  kpiLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 18, fontWeight: 700, marginTop: 4 },
  tabs: { display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 16 },
  tab: { border: 'none', background: 'transparent', color: 'var(--muted)', padding: '8px 14px', fontSize: 13, cursor: 'pointer', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent', marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 6 },
  tabOn: { color: 'var(--accent)', borderBottomColor: 'var(--accent)', fontWeight: 600 },
  tabCount: { fontSize: 11, background: 'var(--panel-2)', borderRadius: 999, padding: '0 7px', color: 'var(--muted)' },
  body: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' },
  asideCol: { position: 'sticky', top: 16 },
  cardGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--panel)' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: 700 },
  infoRow: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  aside: { border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: 'var(--panel)' },
  asideHead: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, marginBottom: 12 },
  aiDot: { width: 8, height: 8, borderRadius: 999, background: 'var(--accent)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)' },
  insight: { borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--accent)', padding: '6px 0 6px 10px', marginBottom: 10 },
  insightAction: { display: 'inline-block', marginTop: 4, background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'none' },
  // Universal Object band (RecordBand + its independent primitives)
  sBand: { border: '1px solid var(--border)', borderLeftWidth: 3, borderLeftStyle: 'solid', borderRadius: 14, padding: '14px 16px', background: 'var(--panel)', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  sLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  sText: { fontSize: 14.5, fontWeight: 600, lineHeight: 1.4 },
  sHealthRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  sHealthPill: { borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '2px 11px', fontSize: 12, fontWeight: 700 },
  sReasons: { fontSize: 12, color: 'var(--muted)' },
  sActionBox: { textAlign: 'right', flexShrink: 0, minWidth: 150 },
  sActionHint: { fontSize: 11.5, color: 'var(--muted)', marginTop: 5, maxWidth: 220 },
  sRow: { width: '100%', paddingTop: 12, borderTop: '1px solid var(--border)' },
  sChips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  sMissChip: { fontSize: 12, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', color: 'var(--bad)', background: 'color-mix(in srgb, var(--bad) 8%, transparent)' },
  sGateOk: { fontSize: 12.5, color: 'var(--good)', fontWeight: 600, marginTop: 6 },
  sGateChip: { fontSize: 12, border: '1px solid var(--warn, #d97706)', borderRadius: 8, padding: '3px 10px', color: 'var(--warn, #d97706)', background: 'color-mix(in srgb, var(--warn, #d97706) 8%, transparent)' },
  sLogBtn: { border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sOutcomeChip: { border: '1px solid var(--border)', background: 'transparent', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  sOutcomeCancel: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', alignSelf: 'center' },
  sOutcomeNote: { fontSize: 12.5, color: 'var(--good)', fontWeight: 600 },
};
