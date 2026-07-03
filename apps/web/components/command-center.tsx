'use client';

// Enterprise Command Center — the homepage. It answers one question:
// "what requires my attention right now, and what should I do next?".
// Awareness (snapshots) + Intelligence (AI briefing) + Prioritization
// (scored attention feed) + Action (inline open + quick actions). The
// scoring/health logic is framework-free in @aura/shared and unit-tested;
// this component only renders and fetches the AI briefing.

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  buildAttentionFeed,
  summarizeAttention,
  recommendedActions,
  computeBusinessHealth,
  type PendingDecision,
  type ProjectLedgerSignal,
  type HealthBand,
} from '@aura/shared';

interface Funnel {
  accounts: number;
  tenders: number;
  contracts: number;
  projects: number;
  tenderValue: number;
  contractValue: number;
  projectValue: number;
}

interface InvoiceLite {
  status: string;
  value: number;
}

export interface CommandCenterProps {
  inbox: PendingDecision[];
  ledgers: ProjectLedgerSignal[];
  funnel: Funnel | null;
  winRate: number | null;
  invoices: InvoiceLite[];
  documentsCount: number;
  eventsCount: number;
  userName?: string | null;
}

const BAND_COLOR: Record<HealthBand, string> = {
  strong: 'var(--good)',
  stable: 'var(--accent)',
  'at-risk': 'var(--warn)',
  critical: 'var(--bad)',
};

const BAND_LABEL: Record<HealthBand, string> = {
  strong: 'Strong',
  stable: 'Stable',
  'at-risk': 'At risk',
  critical: 'Critical',
};

function money(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { label: 'RFQ', href: '/procurement/rfqs' },
  { label: 'Purchase Order', href: '/procurement/purchase-orders' },
  { label: 'Invoice', href: '/finance/invoices' },
  { label: 'Contract', href: '/contracts/contracts' },
  { label: 'Project', href: '/projects/projects' },
  { label: 'Customer', href: '/crm/accounts' },
  { label: 'NCR', href: '/quality/control' },
  { label: 'Site Report', href: '/site/control' },
  { label: 'Service Ticket', href: '/amc' },
];

export default function CommandCenter({
  inbox,
  ledgers,
  funnel,
  winRate,
  invoices,
  documentsCount,
  eventsCount,
  userName,
}: CommandCenterProps) {
  const [briefing, setBriefing] = useState<{ text: string; provider: string } | null>(null);
  const [briefingState, setBriefingState] = useState<'loading' | 'ready' | 'error'>('loading');

  const { attention, summary, health, recs, paymentsDue } = useMemo(() => {
    const attention = buildAttentionFeed(inbox, ledgers);
    const summary = summarizeAttention(attention);
    const payItems = inbox.filter((i) => i.action === 'Pay');
    const paymentsDue = payItems.reduce((s, i) => s + (i.value ?? 0), 0);
    const health = computeBusinessHealth({ attention, ledgers, paymentsDueValue: paymentsDue, winRate });
    const recs = recommendedActions(attention, 3);
    return { attention, summary, health, recs, paymentsDue };
  }, [inbox, ledgers, winRate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/intelligence/insights', { method: 'POST' });
        const data = (await res.json().catch(() => ({}))) as { text?: string; provider?: string; error?: string };
        if (cancelled) return;
        if (res.ok && data.text) {
          setBriefing({ text: data.text, provider: data.provider ?? 'local' });
          setBriefingState('ready');
        } else {
          setBriefingState('error');
        }
      } catch {
        if (!cancelled) setBriefingState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bandColor = BAND_COLOR[health.band];
  const overBudget = attention.filter((a) => a.category === 'risk').length;
  const draftInvoices = invoices.filter((i) => i.status === 'draft').length;
  const topAttention = attention.slice(0, 8);

  return (
    <div>
      {/* Hero: greeting + health */}
      <div className="cc-hero">
        <div>
          <h1 className="cc-greeting">
            {greeting()}
            {userName ? `, ${userName}` : ''}
          </h1>
          <p className="cc-greeting-sub">
            {summary.total === 0
              ? 'Your queue is clear — nothing needs a decision right now.'
              : `You have ${summary.total} item${summary.total === 1 ? '' : 's'} needing attention${
                  summary.critical > 0 ? `, ${summary.critical} critical` : ''
                }.`}
          </p>
          <div className="cc-summary-chips">
            {summary.critical > 0 ? (
              <span className="cc-chip cc-chip-critical">
                <span className="cc-dot" style={{ background: 'var(--bad)' }} /> {summary.critical} critical
              </span>
            ) : null}
            {summary.high > 0 ? (
              <span className="cc-chip cc-chip-high">
                <span className="cc-dot" style={{ background: 'var(--warn)' }} /> {summary.high} high priority
              </span>
            ) : null}
            <span className="cc-chip">{summary.total} total decisions</span>
            {summary.valueAtStake > 0 ? (
              <span className="cc-chip">{money(summary.valueAtStake)} AED at stake</span>
            ) : null}
          </div>
        </div>

        <div className="cc-health">
          <div
            className="cc-health-ring"
            style={{
              background: `conic-gradient(${bandColor} ${health.score * 3.6}deg, var(--border) 0deg)`,
            }}
            title={health.drivers.map((d) => `${d.label}: ${d.detail}`).join('\n')}
          >
            <div className="cc-health-inner">
              <div>
                <div className="cc-health-score" style={{ color: bandColor }}>
                  {health.score}
                </div>
                <div className="cc-health-band" style={{ color: bandColor }}>
                  {BAND_LABEL[health.band]}
                </div>
              </div>
            </div>
          </div>
          <div className="cc-health-label">Business health</div>
        </div>
      </div>

      {/* AI Daily Briefing */}
      <div className="cc-briefing">
        <div className="cc-briefing-head">
          <span aria-hidden>✦</span>
          <span className="cc-briefing-title">AI Daily Briefing</span>
          {briefing ? <span className="cc-briefing-provider">{briefing.provider}</span> : null}
        </div>
        <p className="cc-briefing-text">
          {briefingState === 'loading'
            ? 'Analyzing the pipeline and project ledgers…'
            : briefingState === 'error'
              ? 'Briefing unavailable — start the Intelligence API (or configure a model key) to see your daily briefing here.'
              : briefing?.text}
        </p>
      </div>

      <div className="cc-grid">
        {/* LEFT: attention feed */}
        <div>
          <div className="cc-section-head">
            <h2 className="cc-section-title">
              <span aria-hidden>🎯</span> Needs your attention
            </h2>
            <a className="cc-section-link" href="/inbox">
              Open Inbox →
            </a>
          </div>

          {topAttention.length === 0 ? (
            <div className="cc-snap cc-empty">
              <div className="cc-empty-big">✓ All clear</div>
              <div>No pending decisions or budget risks right now.</div>
            </div>
          ) : (
            <ul className="cc-attention-list">
              {topAttention.map((it) => (
                <li key={it.id} className={`cc-attention-row cc-sev-${it.severity}`}>
                  <span className="cc-sev-bar" />
                  <span className="cc-action-chip">{it.action}</span>
                  <div className="cc-attention-main">
                    <div className="cc-attention-title">{it.title}</div>
                    <div className="cc-attention-meta">
                      <span>
                        {it.module} · {it.kind}
                      </span>
                      <span className="cc-attention-reason">{it.reason}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {it.value && it.value > 0 ? <span className="cc-attention-value">{money(it.value)}</span> : null}
                    <a className="cc-attention-open" href={it.href}>
                      Open →
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {recs.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <div className="cc-section-head">
                <h2 className="cc-section-title">
                  <span aria-hidden>➡️</span> What to do next
                </h2>
              </div>
              <div className="cc-snap">
                <ol style={s.recList}>
                  {recs.map((r, i) => (
                    <li key={i} style={s.recRow}>
                      <span style={s.recNum}>{i + 1}</span>
                      <a href={r.href} style={s.recLabel}>
                        {r.label}
                      </a>
                      <span style={s.recReason}>{r.reason}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT: snapshots + quick actions */}
        <div>
          <div className="cc-snap">
            <div className="cc-snap-title">
              <span aria-hidden>🏗️</span> Operations
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Active projects</span>
              <span className="cc-snap-value">
                <a href="/projects/projects">{funnel?.projects ?? 0}</a>
              </span>
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Open tenders</span>
              <span className="cc-snap-value">
                <a href="/tendering/tenders">{funnel?.tenders ?? 0}</a>
              </span>
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Live contracts</span>
              <span className="cc-snap-value">
                <a href="/contracts/contracts">{funnel?.contracts ?? 0}</a>
              </span>
            </div>
          </div>

          <div className="cc-snap">
            <div className="cc-snap-title">
              <span aria-hidden>💰</span> Financial
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Payments due</span>
              <span className="cc-snap-value" style={{ color: paymentsDue > 0 ? 'var(--warn)' : undefined }}>
                {paymentsDue > 0 ? `${money(paymentsDue)} AED` : '—'}
              </span>
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Invoices to review</span>
              <span className="cc-snap-value">
                <a href="/finance/invoices">{draftInvoices}</a>
              </span>
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Contract pipeline</span>
              <span className="cc-snap-value">{money(funnel?.contractValue ?? 0)} AED</span>
            </div>
          </div>

          <div className="cc-snap">
            <div className="cc-snap-title">
              <span aria-hidden>⚠️</span> Risk &amp; compliance
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Over-budget projects</span>
              <span className="cc-snap-value" style={{ color: overBudget > 0 ? 'var(--bad)' : 'var(--good)' }}>
                {overBudget}
              </span>
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Critical items</span>
              <span className="cc-snap-value" style={{ color: summary.critical > 0 ? 'var(--bad)' : 'var(--good)' }}>
                {summary.critical}
              </span>
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Win rate</span>
              <span className="cc-snap-value">{winRate === null ? '—' : `${Math.round(winRate * 100)}%`}</span>
            </div>
          </div>

          <div className="cc-snap">
            <div className="cc-snap-title">
              <span aria-hidden>⚡</span> Quick actions
            </div>
            <div className="cc-quick">
              {QUICK_ACTIONS.map((a) => (
                <a key={a.href} className="cc-quick-btn" href={a.href}>
                  <span className="cc-quick-plus">＋</span> {a.label}
                </a>
              ))}
            </div>
          </div>

          <div className="cc-snap" style={{ marginBottom: 0 }}>
            <div className="cc-snap-title">
              <span aria-hidden>📡</span> Live spine
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Recent events</span>
              <span className="cc-snap-value">
                <a href="/events">{eventsCount}</a>
              </span>
            </div>
            <div className="cc-snap-row">
              <span className="cc-snap-label">Documents</span>
              <span className="cc-snap-value">
                <a href="/documents">{documentsCount}</a>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  recList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  recRow: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } as CSSProperties,
  recNum: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  } as CSSProperties,
  recLabel: {
    color: 'var(--text)',
    textDecoration: 'none',
    fontSize: 13.5,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  recReason: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto', whiteSpace: 'nowrap' } as CSSProperties,
};
