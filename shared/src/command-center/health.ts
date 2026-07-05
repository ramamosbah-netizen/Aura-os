// Business Health Score — a single 0–100 read on operational state, derived
// from real signals (decision backlog, budget variance, payment load, win
// rate). Pure + deterministic so the number is explainable and testable, not
// a black box. Each penalty is surfaced as a named driver.

import type { AttentionItem, ProjectLedgerSignal } from './attention';

export type HealthBand = 'strong' | 'stable' | 'at-risk' | 'critical';

export interface HealthDriver {
  label: string;
  detail: string;
  /** signed contribution to the score (negative = drag) */
  impact: number;
}

export interface BusinessHealth {
  score: number; // 0–100
  band: HealthBand;
  drivers: HealthDriver[];
}

export interface HealthSignals {
  attention: AttentionItem[];
  ledgers: ProjectLedgerSignal[];
  /** approved supplier invoices awaiting payment (money out the door) */
  paymentsDueValue?: number;
  /** tender→contract conversion, 0–1, or null when not enough data */
  winRate?: number | null;
  now?: number;
}

function bandFor(score: number): HealthBand {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'stable';
  if (score >= 40) return 'at-risk';
  return 'critical';
}

function daysSince(iso: string | null, now: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now - t) / 86_400_000);
}

/**
 * Compute the health score from the already-built attention feed plus ledger
 * and finance signals. Starts at 100 and subtracts explainable penalties.
 */
export function computeBusinessHealth(signals: HealthSignals): BusinessHealth {
  const now = signals.now ?? Date.now();
  const drivers: HealthDriver[] = [];
  let score = 100;

  // 1. Critical/high attention backlog.
  const critical = signals.attention.filter((a) => a.severity === 'critical').length;
  const high = signals.attention.filter((a) => a.severity === 'high').length;
  const backlogPenalty = Math.min(30, critical * 6 + high * 2);
  if (backlogPenalty > 0) {
    score -= backlogPenalty;
    drivers.push({
      label: 'Open decisions',
      detail: `${critical} critical, ${high} high-priority items awaiting action`,
      impact: -backlogPenalty,
    });
  }

  // 2. Stale decisions — anything aging past a week erodes trust in the queue.
  const oldest = signals.attention
    .filter((a) => a.category === 'decision')
    .reduce((m, a) => Math.max(m, daysSince(a.createdAt, now)), 0);
  if (oldest >= 7) {
    const stalePenalty = Math.min(15, Math.round(oldest - 5));
    score -= stalePenalty;
    drivers.push({
      label: 'Aging approvals',
      detail: `Oldest pending decision is ${Math.round(oldest)} days old`,
      impact: -stalePenalty,
    });
  }

  // 3. Budget health — share of projects over budget (realised or committed).
  const withBudget = signals.ledgers.filter((l) => l.budget > 0);
  if (withBudget.length > 0) {
    const over = withBudget.filter((l) => l.invoiced > l.budget || l.committed > l.budget);
    const ratio = over.length / withBudget.length;
    const budgetPenalty = Math.round(ratio * 30);
    if (budgetPenalty > 0) {
      score -= budgetPenalty;
      drivers.push({
        label: 'Budget variance',
        detail: `${over.length} of ${withBudget.length} projects over budget`,
        impact: -budgetPenalty,
      });
    } else {
      drivers.push({
        label: 'Budgets on track',
        detail: `All ${withBudget.length} projects within budget`,
        impact: 0,
      });
    }
  }

  // 4. Win rate — a healthy funnel is a positive; a weak one a modest drag.
  if (typeof signals.winRate === 'number') {
    if (signals.winRate < 0.3) {
      score -= 8;
      drivers.push({
        label: 'Low win rate',
        detail: `Tender→contract conversion at ${(signals.winRate * 100).toFixed(0)}%`,
        impact: -8,
      });
    } else if (signals.winRate >= 0.5) {
      drivers.push({
        label: 'Strong win rate',
        detail: `Tender→contract conversion at ${(signals.winRate * 100).toFixed(0)}%`,
        impact: 0,
      });
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  // Most impactful drags first, then neutral/positive context.
  drivers.sort((a, b) => a.impact - b.impact);
  return { score, band: bandFor(score), drivers };
}
