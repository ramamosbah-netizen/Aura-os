// Deterministic identity resolution — the single source of truth for "have we seen this
// party/person before?", used to protect Lead → Opportunity conversion from creating
// duplicate Accounts and Contacts. Pure + explainable: every match carries the reasons that
// produced it, and confidence is graded EXACT / PROBABLE / POSSIBLE so the caller can auto-link
// on EXACT and merely surface weaker candidates. Lives in @aura/shared so API, UI and tests
// share one rule set.

export type MatchConfidence = 'EXACT' | 'PROBABLE' | 'POSSIBLE' | 'NONE';

export interface IdentityCandidate {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** One existing record to match against (Account or Contact). */
export interface IdentityRecord {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface IdentityMatch {
  id: string;
  confidence: Exclude<MatchConfidence, 'NONE'>;
  score: number;
  reasons: string[];
}

export interface IdentityResolution {
  /** Highest confidence found across all records (NONE when nothing matched). */
  best: MatchConfidence;
  /** Every candidate match, strongest first. */
  matches: IdentityMatch[];
}

/** Public email providers — a shared domain is NOT evidence two parties are the same org. */
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com',
]);

/** Legal-suffix noise stripped before comparing company names. */
const LEGAL_SUFFIXES = new Set([
  'inc', 'llc', 'ltd', 'limited', 'co', 'corp', 'corporation', 'company', 'gmbh', 'plc',
  'sa', 'sarl', 'bv', 'ag', 'pty', 'fz', 'fze', 'llp', 'group', 'holding', 'holdings', 'trading',
]);

/** Very common person-name / org tokens that carry no discriminating power. */
const STOPWORD_TOKENS = new Set(['the', 'and', 'of', 'for', 'al', 'el', 'mr', 'mrs', 'ms', 'dr']);

const COMBINING_MARKS = /[̀-ͯ]/g;
const stripDiacritics = (s: string): string => s.normalize('NFD').replace(COMBINING_MARKS, '');

/** lowercase, strip diacritics + punctuation, drop legal suffixes, collapse whitespace. */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';
  const cleaned = stripDiacritics(name.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !LEGAL_SUFFIXES.has(t))
    .join(' ')
    .trim();
  return cleaned;
}

/** lowercase person name, diacritics + punctuation stripped, whitespace collapsed. */
export function normalizePersonName(name: string | null | undefined): string {
  if (!name) return '';
  return stripDiacritics(name.toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function emailDomain(email: string | null | undefined): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  return at >= 0 ? e.slice(at + 1) : '';
}

/** Last 9 significant digits — tolerant of country-code / formatting differences. */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** Significant, order-independent tokens of a name (stopwords + <2 chars dropped). */
function significantTokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((t) => t.length >= 2 && !STOPWORD_TOKENS.has(t)));
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

const CONFIDENCE_SCORE: Record<Exclude<MatchConfidence, 'NONE'>, number> = { EXACT: 100, PROBABLE: 70, POSSIBLE: 40 };
const RANK: Record<MatchConfidence, number> = { NONE: 0, POSSIBLE: 1, PROBABLE: 2, EXACT: 3 };

/**
 * Resolve a candidate against existing records. `personMode` grades a shared name lower
 * (people share names; only email is decisive), and only company matching treats a shared
 * private email domain as PROBABLE evidence of the same organisation.
 */
export function resolveIdentity(
  candidate: IdentityCandidate,
  records: IdentityRecord[],
  opts: { personMode?: boolean } = {},
): IdentityResolution {
  const person = opts.personMode ?? false;
  const cEmail = normalizeEmail(candidate.email);
  const cPhone = normalizePhone(candidate.phone);
  const cName = person ? normalizePersonName(candidate.name) : normalizeCompanyName(candidate.name);
  const cTokens = significantTokens(cName);
  const cDomain = emailDomain(candidate.email);
  const cDomainDiscriminating = cDomain !== '' && !PUBLIC_EMAIL_DOMAINS.has(cDomain);

  const matches: IdentityMatch[] = [];

  for (const r of records) {
    const reasons: string[] = [];
    let confidence: MatchConfidence = 'NONE';
    const bump = (c: Exclude<MatchConfidence, 'NONE'>, reason: string): void => {
      reasons.push(reason);
      if (RANK[c] > RANK[confidence]) confidence = c;
    };

    const rEmail = normalizeEmail(r.email);
    const rPhone = normalizePhone(r.phone);
    const rName = person ? normalizePersonName(r.name) : normalizeCompanyName(r.name);

    if (cEmail && rEmail && cEmail === rEmail) bump('EXACT', 'email exact');
    // A shared normalized company name is decisive; a shared person name is only suggestive.
    if (cName && rName && cName === rName) bump(person ? 'PROBABLE' : 'EXACT', 'name exact');
    if (cPhone && rPhone && cPhone === rPhone) bump('PROBABLE', 'phone match');
    if (!person && cDomainDiscriminating && emailDomain(r.email) === cDomain) bump('PROBABLE', 'email domain match');

    if (confidence === 'NONE' && cTokens.size > 0) {
      const overlap = tokenOverlap(cTokens, significantTokens(rName));
      if (overlap >= 1) bump('POSSIBLE', `name token overlap (${overlap})`);
    }

    if (confidence !== 'NONE') {
      matches.push({ id: r.id, confidence, score: CONFIDENCE_SCORE[confidence], reasons });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best: MatchConfidence = matches.length ? matches[0].confidence : 'NONE';
  return { best, matches };
}
