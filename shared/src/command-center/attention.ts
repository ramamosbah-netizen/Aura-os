// Command Center attention engine — framework-free and deterministic.
//
// The homepage answers one question: "what requires my attention right now,
// and what should I do next?". This module turns the platform's pending
// decisions plus derived operational risks into a single ranked, scored,
// severity-tagged feed. Pure functions, unit-testable, reusable server-side.

/** A pending human decision — shape matches the host InboxService items. */
export interface PendingDecision {
  id: string;
  module: string;
  kind: string;
  title: string;
  detail: string;
  /** the pending verb: Approve / Pay / Decide / Certify / Review / Activate */
  action: string;
  href: string;
  value: number | null;
  createdAt: string | null;
}

/** Per-project budget position — shape matches intelligence project ledgers. */
export interface ProjectLedgerSignal {
  projectId: string;
  projectName: string | null;
  budget: number;
  committed: number;
  invoiced: number;
  variance: number;
}

export type AttentionSeverity = 'critical' | 'high' | 'normal';
export type AttentionCategory = 'decision' | 'risk';

export interface AttentionItem {
  /** stable per source record, prefixed by category to avoid id collisions */
  id: string;
  category: AttentionCategory;
  module: string;
  kind: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  value: number | null;
  createdAt: string | null;
  /** 0–100 urgency, higher = act sooner */
  score: number;
  severity: AttentionSeverity;
  /** one-line, human explanation of why this is surfaced */
  reason: string;
}

export interface AttentionOptions {
  /** evaluation instant (injectable for deterministic tests) */
  now?: number;
}

// Money-out and irreversible verbs outrank routine review/approve.
const ACTION_WEIGHT: Record<string, number> = {
  Pay: 34,
  Decide: 32,
  Certify: 28,
  Approve: 22,
  Activate: 18,
  Review: 16,
};

function ageDays(createdAt: string | null, now: number): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now - t) / 86_400_000);
}

/** Log-scaled money contribution so a 5M item doesn't swamp everything linearly. */
function valueWeight(value: number | null): number {
  if (!value || value <= 0) return 0;
  // ~0 at 1k, ~15 at 100k, ~25 at 5M
  return Math.min(28, Math.max(0, (Math.log10(value) - 3) * 9));
}

function severityFor(score: number): AttentionSeverity {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  return 'normal';
}

function decisionReason(action: string, days: number): string {
  const aged = days >= 7 ? ` — waiting ${Math.round(days)} days` : days >= 2 ? ` — waiting ${Math.round(days)} days` : '';
  switch (action) {
    case 'Pay':
      return `Payment due${aged}`;
    case 'Decide':
      return `Awaiting your decision${aged}`;
    case 'Certify':
      return `Awaiting certification${aged}`;
    case 'Approve':
      return `Awaiting your approval${aged}`;
    case 'Activate':
      return `Ready to activate${aged}`;
    default:
      return `Awaiting review${aged}`;
  }
}

/** Score a single pending decision into an attention item. */
function scoreDecision(d: PendingDecision, now: number): AttentionItem {
  const base = ACTION_WEIGHT[d.action] ?? 16;
  const days = ageDays(d.createdAt, now);
  const ageBoost = Math.min(24, days * 2.2); // ~2 days = noticeable, ~11 days = maxed
  const score = Math.min(100, Math.round(base + valueWeight(d.value) + ageBoost));
  return {
    id: `decision:${d.module}:${d.kind}:${d.id}`,
    category: 'decision',
    module: d.module,
    kind: d.kind,
    title: d.title,
    detail: d.detail,
    action: d.action,
    href: d.href,
    value: d.value,
    createdAt: d.createdAt,
    score,
    severity: severityFor(score),
    reason: decisionReason(d.action, days),
  };
}

/** Derive operational risk items from project budget positions. */
function riskItemsFromLedgers(ledgers: ProjectLedgerSignal[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const l of ledgers) {
    if (!l.budget || l.budget <= 0) continue;
    const name = l.projectName ?? l.projectId;
    const overspent = l.invoiced > l.budget;
    const overcommitted = l.committed > l.budget;
    if (!overspent && !overcommitted) continue;

    const worst = overspent ? l.invoiced : l.committed;
    const overBy = worst - l.budget;
    const overPct = Math.round((overBy / l.budget) * 100);
    // Overspend is realised cost (critical); over-commitment is a forward warning (high).
    const score = overspent ? Math.min(100, 74 + Math.min(20, overPct / 2)) : Math.min(69, 52 + Math.min(15, overPct / 2));
    items.push({
      id: `risk:budget:${l.projectId}`,
      category: 'risk',
      module: 'Projects',
      kind: 'Budget risk',
      title: name,
      detail: overspent
        ? `Invoiced ${fmtMoney(l.invoiced)} against a ${fmtMoney(l.budget)} budget`
        : `Committed ${fmtMoney(l.committed)} against a ${fmtMoney(l.budget)} budget`,
      action: 'Review',
      href: '/projects/dashboard',
      value: overBy,
      createdAt: null,
      score: Math.round(score),
      severity: severityFor(score),
      reason: overspent ? `Over budget by ${overPct}%` : `Committed ${overPct}% over budget`,
    });
  }
  return items;
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Build the ranked attention feed from pending decisions + project ledgers.
 * Sorted by score (desc), then newest-first as a tiebreak.
 */
export function buildAttentionFeed(
  decisions: PendingDecision[],
  ledgers: ProjectLedgerSignal[] = [],
  opts: AttentionOptions = {},
): AttentionItem[] {
  const now = opts.now ?? Date.now();
  const items = [...decisions.map((d) => scoreDecision(d, now)), ...riskItemsFromLedgers(ledgers)];
  return items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}

export interface AttentionSummary {
  total: number;
  critical: number;
  high: number;
  /** total money represented by money-bearing items */
  valueAtStake: number;
}

export function summarizeAttention(items: AttentionItem[]): AttentionSummary {
  let critical = 0;
  let high = 0;
  let valueAtStake = 0;
  for (const it of items) {
    if (it.severity === 'critical') critical++;
    else if (it.severity === 'high') high++;
    if (it.value && it.value > 0) valueAtStake += it.value;
  }
  return { total: items.length, critical, high, valueAtStake };
}

export interface RecommendedAction {
  label: string;
  href: string;
  reason: string;
  severity: AttentionSeverity;
}

/** The top-N "what to do next" — imperative phrasing derived from the feed. */
export function recommendedActions(items: AttentionItem[], limit = 3): RecommendedAction[] {
  return items.slice(0, limit).map((it) => ({
    label: `${it.action} ${it.kind.toLowerCase()}: ${it.title}`,
    href: it.href,
    reason: it.reason,
    severity: it.severity,
  }));
}
