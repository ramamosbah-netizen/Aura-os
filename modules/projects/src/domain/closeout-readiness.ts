/**
 * Closeout readiness — the gate that decides whether a project may be closed, and says why not.
 *
 * WHY THIS EXISTS
 *
 * `finalizeCloseout` refuses only when a checklist box is unticked. Every box is manual: "All snags
 * cleared" is a tick, not a query against the punch list; "Testing & commissioning certificates
 * issued" reads nothing from commissioning. So a project could be closed with open critical NCRs
 * and an incomplete SAT, and — worse — a blocked closeout could not EXPLAIN itself, because nothing
 * had asked the domains that know.
 *
 * WHAT THIS IS NOT
 *
 * It is not a second source of truth. It holds no quality, commissioning or document state; it
 * takes a reading from each owning domain through a port that domain implements, and turns those
 * readings into one verdict. Project 360 aggregates and governs; the specialist domains stay the
 * authority for their own records.
 *
 * That is also why every check reports UNKNOWN rather than PASS when its domain could not be
 * reached. A readiness gate that treats an unreachable domain as satisfied is worse than no gate:
 * it would authorise exactly the close nobody could verify.
 */

/** The domains a closeout is answerable to. */
export type ReadinessDomain = 'quality' | 'commissioning' | 'documents' | 'commercial' | 'checklist';

export type ReadinessState = 'pass' | 'blocked' | 'unknown';

export interface ReadinessCheck {
  id: string;
  domain: ReadinessDomain;
  /** What is being asked, phrased as the condition that must be TRUE to close. */
  label: string;
  state: ReadinessState;
  /** Present when blocked or unknown — the reason, in the words a project manager would use. */
  detail?: string;
  /** Where the work that clears it lives. Never a Project 360 route: the owner is elsewhere. */
  href?: string;
}

export interface CloseoutReadiness {
  /** True only when every check passed. An unknown is never a pass. */
  ready: boolean;
  checks: ReadinessCheck[];
  blocked: ReadinessCheck[];
  unknown: ReadinessCheck[];
}

/** What each domain reports. `null` means the domain could not be read — never "nothing wrong". */
export interface ReadinessFacts {
  projectId: string;
  quality: { openNcrs: number; criticalOpenNcrs: number; openSnags: number } | null;
  commissioning: { systems: number; commissioned: number; openPunchItems: number; criticalOpenPunchItems: number } | null;
  documents: { pendingApprovals: number; asBuiltsApproved: boolean | null } | null;
  /**
   * Change, split by whether it is an OPEN COMMITMENT or a working note.
   *
   * `submitted` is unresolved commercial exposure: someone has put a claim in front of the other
   * party and no decision exists, so the final account cannot be agreed. That blocks.
   *
   * `draft` is a record nobody has raised yet. It may be scratch, or it may be a variation someone
   * forgot to submit — worth SAYING at closeout, not worth refusing the close over. Blocking on it
   * would let an internal note veto a handover, which is not a rule anyone agreed to.
   */
  commercial: { submittedVariations: number; draftVariations: number; undecidedEotClaims: number } | null;
  checklist: { exists: boolean; total: number; done: number } | null;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function assessCloseoutReadiness(facts: ReadinessFacts): CloseoutReadiness {
  const base = `/project/${encodeURIComponent(facts.projectId)}`;
  const checks: ReadinessCheck[] = [];

  const unreachable = (id: string, domain: ReadinessDomain, label: string, owner: string): ReadinessCheck => ({
    id, domain, label, state: 'unknown',
    detail: `${owner} could not be read, so this cannot be confirmed. Closing now would authorise what nobody verified.`,
  });

  // ── Quality ──────────────────────────────────────────────────────────────────
  if (!facts.quality) checks.push(unreachable('quality-ncrs', 'quality', 'Non-conformances resolved', 'Quality'));
  else {
    checks.push({
      id: 'quality-ncrs',
      domain: 'quality',
      label: 'Non-conformances resolved',
      state: facts.quality.criticalOpenNcrs > 0 || facts.quality.openNcrs > 0 ? 'blocked' : 'pass',
      detail: facts.quality.criticalOpenNcrs > 0
        ? `${plural(facts.quality.criticalOpenNcrs, 'major non-conformance')} still open.`
        : facts.quality.openNcrs > 0
          ? `${plural(facts.quality.openNcrs, 'non-conformance')} still open.`
          : undefined,
      href: `${base}/workspace/quality`,
    });
    checks.push({
      id: 'quality-snags',
      domain: 'quality',
      label: 'Snags cleared',
      state: facts.quality.openSnags > 0 ? 'blocked' : 'pass',
      detail: facts.quality.openSnags > 0 ? `${plural(facts.quality.openSnags, 'snag')} outstanding.` : undefined,
      href: `${base}/workspace/quality`,
    });
  }

  // ── Testing & commissioning ──────────────────────────────────────────────────
  if (!facts.commissioning) checks.push(unreachable('commissioning-systems', 'commissioning', 'Systems commissioned', 'Commissioning'));
  else {
    const { systems, commissioned, openPunchItems, criticalOpenPunchItems } = facts.commissioning;
    checks.push({
      id: 'commissioning-systems',
      domain: 'commissioning',
      label: 'Systems commissioned',
      // No commissioning record at all is NOT a pass. A project that never tested anything has not
      // demonstrated readiness; it has demonstrated nothing.
      state: systems === 0 ? 'unknown' : commissioned < systems ? 'blocked' : 'pass',
      detail: systems === 0
        ? 'No commissioning records exist for this project, so system readiness has never been established.'
        : commissioned < systems
          ? `${systems - commissioned} of ${plural(systems, 'system')} not commissioned.`
          : undefined,
      href: `${base}/workspace/testing`,
    });
    checks.push({
      id: 'commissioning-punch',
      domain: 'commissioning',
      label: 'Punch list closed',
      state: openPunchItems > 0 ? 'blocked' : 'pass',
      detail: openPunchItems > 0
        ? `${plural(openPunchItems, 'punch item')} open${criticalOpenPunchItems > 0 ? `, ${criticalOpenPunchItems} critical` : ''}.`
        : undefined,
      href: `${base}/workspace/testing`,
    });
  }

  // ── Documents ────────────────────────────────────────────────────────────────
  if (!facts.documents) checks.push(unreachable('documents-approvals', 'documents', 'Controlled documents approved', 'Document control'));
  else {
    checks.push({
      id: 'documents-approvals',
      domain: 'documents',
      label: 'Controlled documents approved',
      state: facts.documents.pendingApprovals > 0 ? 'blocked' : 'pass',
      detail: facts.documents.pendingApprovals > 0 ? `${plural(facts.documents.pendingApprovals, 'document')} awaiting approval.` : undefined,
      href: `${base}/workspace/documents`,
    });
    checks.push({
      id: 'documents-asbuilts',
      domain: 'documents',
      label: 'As-builts approved',
      // Tri-state on purpose: the register may not track as-builts distinctly, and "we do not know"
      // must not silently become "yes".
      state: facts.documents.asBuiltsApproved === null ? 'unknown' : facts.documents.asBuiltsApproved ? 'pass' : 'blocked',
      detail: facts.documents.asBuiltsApproved === null
        ? 'No as-built drawing is identifiable in the controlled register.'
        : facts.documents.asBuiltsApproved ? undefined : 'As-built drawings are not approved.',
      href: `${base}/workspace/documents`,
    });
  }

  // ── Commercial ───────────────────────────────────────────────────────────────
  if (!facts.commercial) checks.push(unreachable('commercial-change', 'commercial', 'Change decided', 'Commercial'));
  else {
    const open = facts.commercial.submittedVariations + facts.commercial.undecidedEotClaims;
    const drafts = facts.commercial.draftVariations > 0
      ? ` ${plural(facts.commercial.draftVariations, 'variation')} still in draft — raise or discard before the final account.`
      : '';
    checks.push({
      id: 'commercial-change',
      domain: 'commercial',
      label: 'Change decided',
      state: open > 0 ? 'blocked' : 'pass',
      detail: open > 0
        ? [
          facts.commercial.submittedVariations > 0 ? `${plural(facts.commercial.submittedVariations, 'variation')} awaiting decision` : null,
          facts.commercial.undecidedEotClaims > 0 ? `${plural(facts.commercial.undecidedEotClaims, 'EOT claim')} undecided` : null,
        ].filter(Boolean).join(', ') + '. The final account cannot be agreed while change is open.' + drafts
        : drafts.trim() || undefined,
      href: `${base}?tab=variations`,
    });
  }

  // ── The manual checklist, kept as one check among many rather than the whole gate ────────────
  if (!facts.checklist || !facts.checklist.exists) {
    checks.push({
      id: 'handover-checklist',
      domain: 'checklist',
      label: 'Handover checklist complete',
      state: 'blocked',
      detail: 'No closeout checklist has been started.',
      href: `${base}?tab=closeout`,
    });
  } else {
    const remaining = facts.checklist.total - facts.checklist.done;
    checks.push({
      id: 'handover-checklist',
      domain: 'checklist',
      label: 'Handover checklist complete',
      state: remaining > 0 ? 'blocked' : 'pass',
      detail: remaining > 0 ? `${plural(remaining, 'item')} of ${facts.checklist.total} outstanding.` : undefined,
      href: `${base}?tab=closeout`,
    });
  }

  const blocked = checks.filter((c) => c.state === 'blocked');
  const unknown = checks.filter((c) => c.state === 'unknown');
  return { ready: blocked.length === 0 && unknown.length === 0, checks, blocked, unknown };
}
