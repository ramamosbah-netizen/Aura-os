import { type Id, newId } from '@aura/shared';
import { type ProjectDeliveryArea, type ProjectRisk, markRiskMaterialised } from './project-risk';

/**
 * §21 — the PROJECT issue register: a condition that EXISTS NOW and requires resolution.
 *
 * Separate from `ProjectRisk`, and not a `kind` column on it. The distinction is a business
 * invariant, not a label: a risk is uncertain and forward-looking, an issue has already happened.
 * One table with both would carry `likelihood?`, `mitigation?`, `resolution?` half-nullable per row
 * and destroy both lifecycles.
 *
 * WHAT AN ISSUE IS NOT. It is never a second copy of a problem another register already owns — an
 * NCR, a snag, a punch item, a safety incident, a CAPA, a delay event, an EOT claim, a design
 * change, an RFI, a submittal or a variation. Each has a canonical owner and its own lifecycle. An
 * issue may REFERENCE them (see `ProjectIssueReference`); it never absorbs them, and resolving an
 * issue never resolves a record it points at.
 *
 * What it does own is the cross-domain or management problem with no better home: the workfront the
 * client has not released, the access restriction blocking several disciplines at once, the
 * authority approval holding multiple packages, the decision needed across three departments.
 */

/**
 * How much this is hurting delivery — DECLARED by a person, not computed.
 *
 * Deliberately NOT `RiskSeverity`. That scale is the OUTPUT of a likelihood × impact matrix, and an
 * issue has no likelihood: it has already happened, so `riskSeverity()` cannot produce a value for
 * it. Borrowing `LOW | MEDIUM | HIGH | CRITICAL` would have given issues a type structurally
 * identical to risk severity — freely cross-assignable in TypeScript, with the separation surviving
 * only in prose.
 *
 * The vocabulary is the one this system already uses for a problem that exists now: an NCR and a
 * punch item are `minor | major | critical`. An issue is graded the same way, on what it is doing
 * to delivery:
 *
 *   critical — delivery is stopped, or will stop, and this needs a decision now
 *   major    — delivery is being damaged; work continues but the plan will not hold
 *   minor    — must be resolved, but nothing about delivery changes if it waits
 *
 * Urgency is carried by `dueDate`, which is a fact, rather than by a second invented enum.
 */
export type ProjectIssueSeverity = 'minor' | 'major' | 'critical';

export const PROJECT_ISSUE_SEVERITIES: readonly ProjectIssueSeverity[] = ['minor', 'major', 'critical'];

const SEVERITY_RANK: Record<ProjectIssueSeverity, number> = { minor: 0, major: 1, critical: 2 };

/**
 * The lifecycle, taken from how this system already models a problem that must be worked rather
 * than mirrored from a risk's.
 *
 * NCR runs `raised → action_planned → corrected → closed`, an HSE incident
 * `reported → investigating → closed` and reopenable, a CAPA `pending → in_progress → completed`.
 * The idiom underneath all three is raised → being worked → ended, and the richer registers add an
 * explicit "someone has committed to an action" step. For a coordination problem that step IS
 * ownership, so it is `in_progress` and nothing more ceremonial.
 *
 * Two endings, kept apart on purpose. `resolved` means the condition is gone; `withdrawn` means the
 * issue ended without being solved — overtaken, duplicated, or found not to be real. Collapsing
 * them would inflate every "issues resolved" figure with problems that merely stopped being asked
 * about.
 *
 * Both endings reopen, and reopen only to `open`: a coordination problem declared solved and then
 * recurring is normal, and forcing a new record would lose the history of the first attempt.
 */
export type ProjectIssueStatus = 'open' | 'in_progress' | 'resolved' | 'withdrawn';

export const ISSUE_OPEN_STATUSES: readonly ProjectIssueStatus[] = ['open', 'in_progress'];

const NEXT: Record<ProjectIssueStatus, readonly ProjectIssueStatus[]> = {
  open: ['in_progress', 'resolved', 'withdrawn'],
  in_progress: ['resolved', 'withdrawn', 'open'],
  resolved: ['open'],
  withdrawn: ['open'],
};

export const issueTransitionsFor = (from: ProjectIssueStatus): readonly ProjectIssueStatus[] => NEXT[from];

/**
 * A pointer from an issue to a record another domain owns.
 *
 * NAMED `Reference`, NOT `Link` OR ANYTHING SUGGESTING INTEGRITY. `module + recordType + recordId`
 * is an ADDRESS. There is no foreign key behind it and there cannot be one: the target lives in
 * another module's table, and a database-level reference across that boundary would couple two
 * modules' migrations. A pointer here can therefore dangle, and nothing in §21 detects that.
 *
 * Whether these still resolve is **Lineage Referential Integrity**'s question, in the Master Gap
 * register. §21 must never be described as providing it.
 *
 * It carries an address and a label so a reader can navigate, and nothing else — no status, no due
 * date, no copy of the record's own fields. Anything more would be a second, staler copy of a
 * record another module owns, which is what §28 exists to prevent.
 */
export interface ProjectIssueReference {
  /** The owning module, in its own name: 'quality', 'engineering', 'procurement', 'hse', … */
  module: string;
  /** What kind of record it is, in that module's words: 'ncr', 'rfi', 'purchase-order', … */
  recordType: string;
  recordId: Id;
  /** What to show. A snapshot for the reader, never a substitute for opening the record. */
  label: string | null;
}

export interface ProjectIssue {
  id: Id;
  tenantId: Id;
  projectId: Id;
  reference: string | null;
  title: string;
  description: string | null;
  area: ProjectDeliveryArea;
  severity: ProjectIssueSeverity;
  status: ProjectIssueStatus;
  /** Who is accountable for getting this resolved. */
  owner: string | null;
  /**
   * When the condition was OBSERVED — not when the row was created.
   *
   * The two differ whenever an issue is written up after the fact, which is most of them. Keeping
   * only `createdAt` is the mistake `PROC-GAP-05` records against goods receipts: it answers when
   * somebody typed, not when the thing happened.
   */
  raisedAt: string;
  raisedBy: Id | null;
  /** Resolve-by date. Carries urgency as a fact instead of a second severity-shaped enum. */
  dueDate: string | null;
  /** What actually ended it. Required to reach `resolved` or `withdrawn`. */
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: Id | null;
  /**
   * The risk this issue materialised from — THE canonical provenance fact, stored once.
   *
   * `UNIQUE` in the schema, so a risk materialises at most once, and part of a composite foreign
   * key `(tenantId, projectId, originRiskId) → risk(tenantId, projectId, id)`, so the database
   * itself refuses provenance that crosses a project or a tenant.
   */
  originRiskId: Id | null;
  references: ProjectIssueReference[];
  createdAt: string;
  createdBy: Id | null;
  updatedAt: string;
}

export interface NewProjectIssue {
  tenantId: Id;
  projectId: Id;
  reference?: string | null;
  title: string;
  description?: string | null;
  area?: ProjectDeliveryArea;
  severity?: ProjectIssueSeverity;
  owner?: string | null;
  raisedAt?: string | null;
  raisedBy?: Id | null;
  dueDate?: string | null;
  originRiskId?: Id | null;
  references?: ProjectIssueReference[];
  createdBy?: Id | null;
}

const cleanReferences = (refs: ProjectIssueReference[] | undefined): ProjectIssueReference[] =>
  (refs ?? [])
    .filter((r) => r.module?.trim() && r.recordType?.trim() && r.recordId?.trim())
    .map((r) => ({
      module: r.module.trim(),
      recordType: r.recordType.trim(),
      recordId: r.recordId.trim(),
      label: r.label?.trim() || null,
    }));

export function makeProjectIssue(input: NewProjectIssue): ProjectIssue {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.title?.trim()) throw new Error('issue title is required');
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    area: input.area ?? 'OTHER',
    severity: input.severity ?? 'major',
    status: 'open',
    owner: input.owner?.trim() || null,
    // Defaults to now, because an issue raised without a stated observation date was, as far as
    // anyone can prove, observed when it was written up. Never left null: a nullable date here
    // would make "how long has this been live" unanswerable for most of the register.
    raisedAt: input.raisedAt || now,
    raisedBy: input.raisedBy ?? null,
    dueDate: input.dueDate ?? null,
    resolution: null,
    resolvedAt: null,
    resolvedBy: null,
    originRiskId: input.originRiskId ?? null,
    references: cleanReferences(input.references),
    createdAt: now,
    createdBy: input.createdBy ?? null,
    updatedAt: now,
  };
}

export type ProjectIssuePatch = Partial<Pick<ProjectIssue,
  'reference' | 'title' | 'description' | 'area' | 'severity' | 'owner' | 'dueDate' | 'raisedAt'>> & {
    references?: ProjectIssueReference[];
  };

export function updateProjectIssue(issue: ProjectIssue, patch: ProjectIssuePatch): ProjectIssue {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: ProjectIssue = { ...issue, ...defined, updatedAt: new Date().toISOString() };
  if (!next.title.trim()) throw new Error('issue title is required');
  next.title = next.title.trim();
  if (patch.references !== undefined) next.references = cleanReferences(patch.references);
  return next;
}

/**
 * Move the lifecycle.
 *
 * Ending an issue demands a note for the same reason cancelling a project does: a terminal state
 * that records nothing leaves the register unable to say what happened, and a resolution nobody had
 * to write is indistinguishable from an issue somebody stopped looking at.
 *
 * Reopening CLEARS the resolution rather than keeping it. A live issue carrying the text of a
 * resolution that evidently did not hold is a screen that contradicts itself.
 */
export function setProjectIssueStatus(
  issue: ProjectIssue,
  status: ProjectIssueStatus,
  input: { note?: string | null; actorId?: Id | null } = {},
): ProjectIssue {
  if (status === issue.status) return issue;
  if (!NEXT[issue.status].includes(status)) {
    // Says what IS possible, not only what is refused — and reads as a 409 to the global filter,
    // which is what a state-transition guard should answer.
    throw new Error(`an issue that is ${issue.status} can only move to: ${NEXT[issue.status].join(', ')}`);
  }
  const ending = status === 'resolved' || status === 'withdrawn';
  if (ending && !input.note?.trim()) {
    throw new Error(`${status === 'resolved' ? 'resolving' : 'withdrawing'} an issue requires a note`);
  }
  const now = new Date().toISOString();
  return {
    ...issue,
    status,
    resolution: ending ? (input.note?.trim() ?? null) : null,
    resolvedAt: ending ? now : null,
    resolvedBy: ending ? (input.actorId ?? null) : null,
    updatedAt: now,
  };
}

export const issueIsOpen = (i: ProjectIssue): boolean => ISSUE_OPEN_STATUSES.includes(i.status);

export interface MaterialiseInput {
  /**
   * The project the CALLER believes this risk belongs to — typically taken from the URL.
   *
   * Checked against the risk rather than trusted, and never used to place the issue: the issue is
   * always created on the risk's own project. Without this guard, a request that named project B
   * while addressing a risk in project A would silently succeed and produce an issue on A, so the
   * caller would be told the wrong thing about what it had just done.
   */
  expectedProjectId?: Id | null;
  title?: string;
  description?: string | null;
  severity?: ProjectIssueSeverity;
  owner?: string | null;
  dueDate?: string | null;
  raisedAt?: string | null;
  actorId?: Id | null;
  references?: ProjectIssueReference[];
}

/**
 * Materialise a risk that occurred into a live issue.
 *
 * Two records, not one mutated. `risk.status = 'ISSUE'` was rejected: it would erase the fact that
 * this exposure was identified, owned and mitigated before it landed, and the register could then
 * no longer answer whether the risk process worked at all.
 *
 * PROVENANCE IS STORED ONCE, on the issue, as `originRiskId`. The risk says `MATERIALISED`, which
 * is a different fact — what happened to it, not where the issue came from. Nothing points both
 * ways, so nothing can disagree.
 *
 * Pure: it returns the pair and writes nothing. The caller commits both inside one transaction, so
 * a risk can never read as landed without the issue it landed into existing.
 */
export function materialiseRiskAsIssue(
  risk: ProjectRisk,
  input: MaterialiseInput = {},
): { risk: ProjectRisk; issue: ProjectIssue } {
  if (input.expectedProjectId && input.expectedProjectId !== risk.projectId) {
    throw new Error(`risk ${risk.id} does not belong to project ${input.expectedProjectId}`);
  }
  // Throws unless the risk is a live exposure — which also makes double materialisation impossible
  // in the domain, before the database's UNIQUE constraint is ever reached.
  const materialisedRisk = markRiskMaterialised(risk);
  const issue = makeProjectIssue({
    tenantId: risk.tenantId,
    // Never from the caller. The issue belongs where the risk belongs, and the composite foreign
    // key on (tenantId, projectId, originRiskId) makes the database enforce the same thing.
    projectId: risk.projectId,
    title: input.title?.trim() || risk.title,
    description: input.description ?? risk.description,
    // The area travels with it: a procurement risk that lands is a procurement issue, and forcing
    // a re-categorisation here would break the link between the forecast and what it became.
    area: risk.area,
    // Severity is NOT carried across. The risk's was computed from a likelihood that no longer
    // exists, so translating CRITICAL into an issue grade would be arithmetic on a fact that has
    // already resolved. Someone states what this is doing to delivery now.
    severity: input.severity ?? 'major',
    owner: input.owner ?? risk.owner,
    dueDate: input.dueDate ?? risk.targetDate,
    raisedAt: input.raisedAt ?? null,
    raisedBy: input.actorId ?? null,
    originRiskId: risk.id,
    references: input.references,
    createdBy: input.actorId ?? null,
  });
  return { risk: materialisedRisk, issue };
}

export interface ProjectIssueSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  withdrawn: number;
  openCritical: number;
  openMajor: number;
  /** Open, past its resolve-by date. */
  overdue: number;
  /** Open issues that came from the risk register — how often the forecast was right. */
  fromRisk: number;
  needsAttention: boolean;
}

/** `today` is passed in, never read from the clock: these rules stay pure and testable. */
export function summariseProjectIssues(issues: readonly ProjectIssue[], today: string): ProjectIssueSummary {
  let open = 0, inProgress = 0, resolved = 0, withdrawn = 0;
  let openCritical = 0, openMajor = 0, overdue = 0, fromRisk = 0;
  for (const i of issues) {
    if (i.status === 'resolved') resolved++;
    if (i.status === 'withdrawn') withdrawn++;
    if (!issueIsOpen(i)) continue;
    open++;
    if (i.status === 'in_progress') inProgress++;
    if (i.originRiskId) fromRisk++;
    if (i.severity === 'critical') openCritical++;
    else if (i.severity === 'major') openMajor++;
    if (i.dueDate && i.dueDate < today) overdue++;
  }
  return {
    total: issues.length, open, inProgress, resolved, withdrawn,
    openCritical, openMajor, overdue, fromRisk,
    needsAttention: openCritical > 0 || overdue > 0,
  };
}

/** Worst severity across the OPEN issues — `null` when none are live. */
export function worstOpenIssueSeverity(issues: readonly ProjectIssue[]): ProjectIssueSeverity | null {
  let worst: ProjectIssueSeverity | null = null;
  for (const i of issues) {
    if (!issueIsOpen(i)) continue;
    if (worst === null || SEVERITY_RANK[i.severity] > SEVERITY_RANK[worst]) worst = i.severity;
  }
  return worst;
}
