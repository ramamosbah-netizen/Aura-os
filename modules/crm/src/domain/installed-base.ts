import { type Id, newId, ELV_SYSTEMS, type ElvSystem } from '@aura/shared';

// Installed Base & White-Space (§26 — C3). After delivery the CRM forgot what the customer
// actually HAS — so "what should we sell next?" had no factual answer. The installed base
// records, per account (and optionally per site), which ELV systems exist and WHOSE they are;
// white-space is then a pure derivation: missing systems, competitor systems ripe for
// replacement, our systems with no AMC, warranties and AMCs running out.
//
// §26's law: findings become SIGNALS on the S3 radar (deduped, evidence-carrying), never
// auto-created opportunities — a human promotes what's real.

export type InstalledProvider = 'us' | 'competitor' | 'unknown';
export type AmcStatus = 'ours' | 'competitor' | 'none' | 'unknown';

export const INSTALLED_PROVIDERS: readonly InstalledProvider[] = ['us', 'competitor', 'unknown'];
export const AMC_STATUSES: readonly AmcStatus[] = ['ours', 'competitor', 'none', 'unknown'];

export interface InstalledBaseItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  accountId: Id;
  /** The canonical ELV system code (same vocabulary as the G4 lead context — one routing key). */
  system: ElvSystem;
  /** Which site/building, free text — a site entity would block capture today (same call as G4). */
  siteName: string | null;
  provider: InstalledProvider;
  competitorName: string | null;
  installedAt: string | null;
  warrantyExpiresAt: string | null;
  amcStatus: AmcStatus;
  amcExpiresAt: string | null;
  /** Lineage back to the delivering project when we installed it. */
  projectId: Id | null;
  notes: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewInstalledBaseItem {
  tenantId: Id;
  companyId?: Id | null;
  accountId: Id;
  system: ElvSystem;
  siteName?: string | null;
  provider?: InstalledProvider;
  competitorName?: string | null;
  installedAt?: string | null;
  warrantyExpiresAt?: string | null;
  amcStatus?: AmcStatus;
  amcExpiresAt?: string | null;
  projectId?: Id | null;
  notes?: string | null;
  createdBy?: Id | null;
}

export function makeInstalledBaseItem(input: NewInstalledBaseItem): InstalledBaseItem {
  if (!ELV_SYSTEMS.includes(input.system)) throw new Error(`unknown system: ${String(input.system)}`);
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    accountId: input.accountId,
    system: input.system,
    siteName: input.siteName?.trim() || null,
    provider: input.provider ?? 'unknown',
    competitorName: input.competitorName?.trim() || null,
    installedAt: input.installedAt ?? null,
    warrantyExpiresAt: input.warrantyExpiresAt ?? null,
    amcStatus: input.amcStatus ?? 'unknown',
    amcExpiresAt: input.amcExpiresAt ?? null,
    projectId: input.projectId ?? null,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

// ─────────────────────────── White-space derivation ───────────────────────────

export const WARRANTY_WINDOW_DAYS = 90;
export const AMC_RENEWAL_WINDOW_DAYS = 120;

export type GrowthFindingKind =
  | 'WHITE_SPACE'       // system missing entirely
  | 'REPLACEMENT'       // competitor-supplied — a displacement play
  | 'AMC_CROSS_SELL'    // our system with no AMC (or a competitor's AMC)
  | 'WARRANTY_EXPIRING' // our warranty inside the window — the AMC conversation moment
  | 'RENEWAL_DUE';      // our AMC inside the renewal window

export interface GrowthFinding {
  kind: GrowthFindingKind;
  system: ElvSystem;
  siteName: string | null;
  /** Human-readable why, carried onto the signal as evidence. */
  reason: string;
  /** Stable idempotency key — scanning twice must never duplicate a signal. */
  dedupeKey: string;
}

export interface SystemCoverage {
  system: ElvSystem;
  status: 'ours' | 'competitor' | 'mixed' | 'missing';
  items: number;
}

const daysUntil = (iso: string, now: Date): number => Math.floor((new Date(iso).getTime() - now.getTime()) / 86400000);

/** Per-system coverage map — the white-space board ("what do they have, whose is it?"). */
export function systemCoverage(items: InstalledBaseItem[]): SystemCoverage[] {
  return ELV_SYSTEMS.filter((s) => s !== 'other').map((system) => {
    const of = items.filter((i) => i.system === system);
    const ours = of.some((i) => i.provider === 'us');
    const theirs = of.some((i) => i.provider === 'competitor');
    return {
      system,
      status: of.length === 0 ? 'missing' : ours && theirs ? 'mixed' : ours ? 'ours' : theirs ? 'competitor' : 'missing',
      items: of.length,
    };
  });
}

/**
 * Derive the growth findings for one account. Pure + deterministic (`now` injectable);
 * WHITE_SPACE only fires when the account has SOME installed base recorded — an empty register
 * means "not surveyed yet", and reporting every system missing would be noise, not insight.
 */
export function deriveGrowthFindings(accountId: Id, items: InstalledBaseItem[], now: Date = new Date()): GrowthFinding[] {
  const findings: GrowthFinding[] = [];
  const site = (i: InstalledBaseItem): string => (i.siteName ? ` at ${i.siteName}` : '');

  if (items.length > 0) {
    for (const cov of systemCoverage(items)) {
      if (cov.status === 'missing') {
        findings.push({
          kind: 'WHITE_SPACE', system: cov.system, siteName: null,
          reason: `no ${cov.system.replace(/_/g, ' ')} recorded on this account — white space`,
          dedupeKey: `whitespace:${accountId}:${cov.system}`,
        });
      }
    }
  }

  for (const i of items) {
    if (i.provider === 'competitor') {
      findings.push({
        kind: 'REPLACEMENT', system: i.system, siteName: i.siteName,
        reason: `${i.system.replace(/_/g, ' ')}${site(i)} is ${i.competitorName ?? 'competitor'}-supplied — displacement play`,
        dedupeKey: `replacement:${accountId}:${i.id}`,
      });
    }
    if (i.provider === 'us' && (i.amcStatus === 'none' || i.amcStatus === 'competitor')) {
      findings.push({
        kind: 'AMC_CROSS_SELL', system: i.system, siteName: i.siteName,
        reason: `our ${i.system.replace(/_/g, ' ')}${site(i)} has ${i.amcStatus === 'none' ? 'no AMC' : `a competitor AMC`}`,
        dedupeKey: `amc-cross-sell:${accountId}:${i.id}`,
      });
    }
    if (i.provider === 'us' && i.warrantyExpiresAt) {
      const d = daysUntil(i.warrantyExpiresAt, now);
      if (d >= 0 && d <= WARRANTY_WINDOW_DAYS) {
        findings.push({
          kind: 'WARRANTY_EXPIRING', system: i.system, siteName: i.siteName,
          reason: `warranty on ${i.system.replace(/_/g, ' ')}${site(i)} expires in ${d} days — the AMC conversation moment`,
          dedupeKey: `warranty:${accountId}:${i.id}:${i.warrantyExpiresAt.slice(0, 10)}`,
        });
      }
    }
    if (i.amcStatus === 'ours' && i.amcExpiresAt) {
      const d = daysUntil(i.amcExpiresAt, now);
      if (d >= 0 && d <= AMC_RENEWAL_WINDOW_DAYS) {
        findings.push({
          kind: 'RENEWAL_DUE', system: i.system, siteName: i.siteName,
          reason: `our AMC on ${i.system.replace(/_/g, ' ')}${site(i)} expires in ${d} days`,
          dedupeKey: `amc-renewal:${accountId}:${i.id}:${i.amcExpiresAt.slice(0, 10)}`,
        });
      }
    }
  }
  return findings;
}

/** Which SignalType each finding raises on the S3 radar. */
export const FINDING_SIGNAL_TYPE: Record<GrowthFindingKind, 'CROSS_SELL' | 'UPSELL' | 'AMC_EXPIRY' | 'WARRANTY_EXPIRY' | 'RENEWAL_DUE'> = {
  WHITE_SPACE: 'CROSS_SELL',
  REPLACEMENT: 'UPSELL',
  AMC_CROSS_SELL: 'AMC_EXPIRY',
  WARRANTY_EXPIRING: 'WARRANTY_EXPIRY',
  RENEWAL_DUE: 'RENEWAL_DUE',
};
