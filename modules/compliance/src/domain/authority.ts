import { type Id, newId } from '@aura/shared';

/**
 * A statutory authority — SIRA, DCD, and whoever comes next (ADR-0018 §4).
 *
 * Reference data, deliberately not a union type. An enum would make adding Trakhees a code change
 * and a migration; a row makes it configuration, which is the acceptance test the ADR sets.
 *
 * There is **no `OTHER` member**. An `OTHER` in a closed set becomes the bucket everything
 * unclassifiable falls into, and a year later nobody can say what is in it. An authority that is
 * not yet modelled is a row that has not been added — a visible, fixable state.
 */
export interface Authority {
  id: Id;
  tenantId: Id;
  /** Stable short code used in references and rules — `SIRA`, `DCD`. Upper-case, unique per tenant. */
  code: string;
  name: string;
  /** Where it has jurisdiction — `AE-DU` (Dubai), `AE-AZ` (Abu Dhabi). ISO 3166-2 where one exists. */
  jurisdiction: string;
  portalUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewAuthority {
  tenantId: Id;
  code: string;
  name: string;
  jurisdiction: string;
  portalUrl?: string | null;
  active?: boolean;
}

export function makeAuthority(input: NewAuthority): Authority {
  if (!input.tenantId) throw new Error('tenantId is required');
  const code = (input.code ?? '').trim().toUpperCase();
  if (!code) throw new Error('authority code is required');
  if (!(input.name ?? '').trim()) throw new Error('authority name is required');
  if (!(input.jurisdiction ?? '').trim()) throw new Error('authority jurisdiction is required');

  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    code,
    name: input.name.trim(),
    jurisdiction: input.jurisdiction.trim().toUpperCase(),
    portalUrl: (input.portalUrl ?? '').trim() || null,
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

// ── The sourced-reference gate (ADR-0018 §13) ──────────────────────────────────────────────────

/**
 * Provenance for any regulatory fact — which documents an obligation demands, what a certificate
 * costs, how long it stays valid.
 *
 * Required, not optional, and enforced at the type level: a regulatory rule cannot be constructed
 * without saying where it came from. Un-sourced regulatory data is worse than none, because it
 * looks authoritative and will be relied on by someone deciding whether a system may legally
 * operate. If the source is unavailable, the rule is not created.
 */
export interface RegulatorySource {
  /** Where the fact came from — a published circular, a portal page, a named officer. */
  source: string;
  /** Which edition/version of it, so a later revision is a visible change rather than a silent one. */
  sourceVersion: string;
  /** When it was read, `YYYY-MM-DD`. Regulations change; a fact with no date has no shelf life. */
  retrievedAt: string;
  /** The authority whose rule this is, by code. */
  authorityCode: string;
}

export function isSourced(value: Partial<RegulatorySource> | null | undefined): value is RegulatorySource {
  return Boolean(
    value &&
      (value.source ?? '').trim() &&
      (value.sourceVersion ?? '').trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(value.retrievedAt ?? '') &&
      (value.authorityCode ?? '').trim(),
  );
}

/**
 * Guard for the seed path. Every regulatory rule passes through this before it can be persisted,
 * so "we will add the source later" cannot happen — later never comes, and by then nobody
 * remembers whether the number was read or guessed.
 */
export function requireSource(label: string, value: Partial<RegulatorySource> | null | undefined): RegulatorySource {
  if (!isSourced(value)) {
    throw new Error(
      `${label} cannot be seeded without a source: source, sourceVersion, retrievedAt (YYYY-MM-DD) and authorityCode are all required`,
    );
  }
  return value;
}
