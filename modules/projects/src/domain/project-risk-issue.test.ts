import { describe, expect, it } from 'vitest';
import {
  makeProjectRisk, updateProjectRisk, setProjectRiskStatus, summariseProjectRisks,
  riskMaterialised, markRiskMaterialised, riskTransitionsFor, isTerminalRisk,
  PROJECT_DELIVERY_AREAS, PROJECT_RISK_STATUSES, type NewProjectRisk,
} from './project-risk';
import {
  makeProjectIssue, updateProjectIssue, setProjectIssueStatus, summariseProjectIssues,
  materialiseRiskAsIssue, issueTransitionsFor, worstOpenIssueSeverity, PROJECT_ISSUE_SEVERITIES,
  type NewProjectIssue,
} from './project-issue';

/**
 * §21 — the two registers, and the line between them.
 *
 * Two things these tests exist to hold in place:
 *
 * 1. A risk and an issue are not one record wearing different labels. A risk is uncertain and its
 *    severity is COMPUTED from a likelihood; an issue has already happened, has no likelihood, and
 *    its severity is DECLARED.
 * 2. A risk that LANDED and a risk that WENT AWAY are different outcomes. Every assertion about
 *    MATERIALISED exists to stop those two collapsing into one terminal state.
 */

const TODAY = '2026-09-08';
const base = { tenantId: 't1', projectId: 'p1' };

const risk = (over: Partial<NewProjectRisk> = {}) =>
  makeProjectRisk({ ...base, title: 'Authority approval may be delayed', ...over });

const issue = (over: Partial<NewProjectIssue> = {}) =>
  makeProjectIssue({ ...base, title: 'Authority approval is overdue', ...over });

describe('project risk — shared arithmetic, its own lifecycle', () => {
  it('derives severity from likelihood and impact rather than accepting one', () => {
    expect(risk({ likelihood: 'high', impact: 'high' }).severity).toBe('CRITICAL');
    expect(risk({ likelihood: 'low', impact: 'low' }).severity).toBe('LOW');
    // And recomputes when either axis moves — a stale severity is a lie told with a number.
    const r = risk({ likelihood: 'low', impact: 'low' });
    expect(updateProjectRisk(r, { impact: 'high' }).severity).toBe('MEDIUM');
    expect(updateProjectRisk(r, { likelihood: 'high', impact: 'high' }).severity).toBe('CRITICAL');
  });

  it('has a state for a risk that OCCURRED, which CRM\'s lifecycle does not', () => {
    // The reason the lifecycle is not shared. A deal risk that lands ends the deal conversation;
    // a delivery risk that lands opens a new record, and the register must say so.
    expect(PROJECT_RISK_STATUSES).toContain('MATERIALISED');
    expect(PROJECT_RISK_STATUSES).toEqual(['OPEN', 'MITIGATING', 'ACCEPTED', 'RESOLVED', 'MATERIALISED']);
  });

  it('categorises by the domain that would have to answer, not by CRM deal types', () => {
    expect(PROJECT_DELIVERY_AREAS).toContain('PROCUREMENT');
    expect(PROJECT_DELIVERY_AREAS).toContain('AUTHORITY');
    // RELATIONSHIP and COMPETITIVE cannot threaten a site.
    expect(PROJECT_DELIVERY_AREAS).not.toContain('COMPETITIVE');
    expect(PROJECT_DELIVERY_AREAS).not.toContain('CUSTOMER');
  });

  it('offers only the moves that exist, and closes both terminals', () => {
    expect(riskTransitionsFor('OPEN')).toEqual(['MITIGATING', 'ACCEPTED', 'RESOLVED', 'MATERIALISED']);
    // An accepted exposure can still land, and can be taken back onto the active register.
    expect(riskTransitionsFor('ACCEPTED')).toContain('MATERIALISED');
    expect(riskTransitionsFor('ACCEPTED')).toContain('OPEN');
    expect(riskTransitionsFor('RESOLVED')).toEqual([]);
    expect(riskTransitionsFor('MATERIALISED')).toEqual([]);
    expect(isTerminalRisk(setProjectRiskStatus(risk(), 'RESOLVED'))).toBe(true);
  });

  it('refuses an acceptance nobody has to justify, and keeps the reason apart from the mitigation', () => {
    expect(() => setProjectRiskStatus(risk(), 'ACCEPTED')).toThrow(/requires a reason/);
    const accepted = setProjectRiskStatus(
      risk({ mitigation: 'Chase the authority weekly' }),
      'ACCEPTED',
      'Client carries this; agreed at the 4 Sep meeting',
    );
    // What was being done and why it was accepted instead are different statements. Overwriting
    // one with the other loses the mitigation the moment acceptance is revisited.
    expect(accepted.mitigation).toBe('Chase the authority weekly');
    expect(accepted.acceptanceReason).toMatch(/4 Sep meeting/);
  });

  it('will not let a second writer declare a risk materialised', () => {
    // The one path to MATERIALISED is the materialisation command, which writes the risk and the
    // issue in one transaction. A status setter that could reach it would be a second writer for
    // the operation that must have exactly one — and could mark a risk as landed with no issue.
    expect(() => setProjectRiskStatus(risk(), 'MATERIALISED'))
      .toThrow(/can only be marked materialised by materialising it into an issue/);
  });

  it('closes a terminal risk to edits as well as to moves', () => {
    const resolved = setProjectRiskStatus(risk(), 'RESOLVED');
    expect(() => updateProjectRisk(resolved, { title: 'rewritten' })).toThrow(/closed to further edits/);
    expect(() => setProjectRiskStatus(resolved, 'OPEN')).toThrow(/is closed/);
  });

  it('counts a risk that LANDED apart from one that went away', () => {
    const went = setProjectRiskStatus(risk({ title: 'Went away' }), 'RESOLVED');
    const { risk: landed } = materialiseRiskAsIssue(risk({ title: 'Landed', likelihood: 'high', impact: 'high' }));

    expect(went.status).toBe('RESOLVED');
    expect(landed.status).toBe('MATERIALISED');
    expect(riskMaterialised(went)).toBe(false);
    expect(riskMaterialised(landed)).toBe(true);

    const s = summariseProjectRisks([went, landed], TODAY);
    // Two opposite outcomes, never one figure. Reporting a failed forecast as a success is the
    // exact failure a risk register exists to prevent.
    expect(s).toMatchObject({ open: 0, resolved: 1, materialised: 1 });
  });

  it('flags a mitigation whose target date has passed', () => {
    const late = risk({ targetDate: '2026-08-01', likelihood: 'low', impact: 'low' });
    const s = summariseProjectRisks([late], TODAY);
    // LOW severity, so the severity arm is silent — the date is what raises this. A low risk
    // nobody acted on by the date they set is still a governance failure.
    expect(s).toMatchObject({ openCritical: 0, openHigh: 0, overdueMitigations: 1, needsAttention: true });
  });

  it('still counts an ACCEPTED risk as a live exposure', () => {
    // Accepted is a decision to carry it, not a decision that it is gone.
    const accepted = setProjectRiskStatus(risk({ likelihood: 'high', impact: 'high' }), 'ACCEPTED', 'client carries it');
    expect(summariseProjectRisks([accepted], TODAY)).toMatchObject({ open: 1, accepted: 1, openCritical: 1 });
  });

  it('carries no pointer back to the issue', () => {
    // Provenance is stored once, on the issue. A pointer on both rows is two rows asserting one
    // fact, and two rows that can disagree.
    const { risk: landed } = materialiseRiskAsIssue(risk());
    expect(landed).not.toHaveProperty('linkedIssueId');
  });
});

describe('project issue — severity it declares, not severity it inherits', () => {
  it('grades itself in the vocabulary this system uses for problems that exist now', () => {
    // NCR and punch item are minor | major | critical. It is NOT LOW | MEDIUM | HIGH | CRITICAL:
    // that scale is the output of a likelihood × impact matrix, and an issue has no likelihood.
    expect(PROJECT_ISSUE_SEVERITIES).toEqual(['minor', 'major', 'critical']);
    for (const riskGrade of ['LOW', 'MEDIUM', 'HIGH']) {
      expect(PROJECT_ISSUE_SEVERITIES as readonly string[]).not.toContain(riskGrade);
    }
  });

  it('takes the severity it is given, and computes nothing', () => {
    expect(issue({ severity: 'critical' }).severity).toBe('critical');
    expect(issue({ severity: 'minor' }).severity).toBe('minor');
    // No likelihood on the record at all, so nothing could derive it even by accident.
    expect(issue()).not.toHaveProperty('likelihood');
  });

  it('records when the condition was OBSERVED, not only when the row was typed', () => {
    const late = issue({ raisedAt: '2026-07-01T08:00:00.000Z' });
    expect(late.raisedAt).toBe('2026-07-01T08:00:00.000Z');
    expect(late.createdAt).not.toBe(late.raisedAt);
    // Never null: a nullable observation date makes "how long has this been live" unanswerable for
    // most of the register — the mistake PROC-GAP-05 records against goods receipts.
    expect(issue().raisedAt).toBeTruthy();
  });
});

describe('project issue lifecycle', () => {
  it('offers only the moves that exist, from each state', () => {
    expect(issueTransitionsFor('open')).toEqual(['in_progress', 'resolved', 'withdrawn']);
    expect(issueTransitionsFor('in_progress')).toEqual(['resolved', 'withdrawn', 'open']);
    // Both endings reopen, and reopen is all they do.
    expect(issueTransitionsFor('resolved')).toEqual(['open']);
    expect(issueTransitionsFor('withdrawn')).toEqual(['open']);
  });

  it('refuses a move that is not on the map', () => {
    const resolved = setProjectIssueStatus(issue(), 'resolved', { note: 'Approval issued' });
    expect(() => setProjectIssueStatus(resolved, 'withdrawn', { note: 'x' }))
      .toThrow(/an issue that is resolved can only move to: open/);
  });

  it('refuses an ending that records nothing', () => {
    expect(() => setProjectIssueStatus(issue(), 'resolved')).toThrow(/requires a note/);
    expect(() => setProjectIssueStatus(issue(), 'withdrawn', { note: '   ' })).toThrow(/requires a note/);
    // Moving into work does not, because being worked is not a claim about an outcome.
    expect(setProjectIssueStatus(issue(), 'in_progress').status).toBe('in_progress');
  });

  it('keeps resolved and withdrawn apart', () => {
    const solved = setProjectIssueStatus(issue(), 'resolved', { note: 'Approval issued 6 Sep' });
    const dropped = setProjectIssueStatus(issue(), 'withdrawn', { note: 'Duplicate of I-004' });
    // Collapsing these would inflate every "issues resolved" figure with problems that merely
    // stopped being asked about.
    expect(summariseProjectIssues([solved, dropped], TODAY)).toMatchObject({ resolved: 1, withdrawn: 1, open: 0 });
  });

  it('clears the resolution when an issue is reopened', () => {
    const solved = setProjectIssueStatus(issue(), 'resolved', { note: 'Approval issued', actorId: 'u1' });
    expect(solved).toMatchObject({ resolution: 'Approval issued', resolvedBy: 'u1' });
    const reopened = setProjectIssueStatus(solved, 'open');
    // A live issue still displaying the text of a resolution that evidently did not hold is a
    // screen that contradicts itself.
    expect(reopened).toMatchObject({ status: 'open', resolution: null, resolvedAt: null, resolvedBy: null });
  });
});

describe('references point; they never own', () => {
  it('carries an address and a label, and nothing that could go stale into a decision', () => {
    const i = issue({
      references: [{ module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' }],
    });
    expect(i.references).toEqual([{ module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' }]);
    // No status, no due date, no copy of the record's own fields — nothing a reader could mistake
    // for the current state of the NCR.
    expect(Object.keys(i.references[0]).sort()).toEqual(['label', 'module', 'recordId', 'recordType']);
  });

  it('drops a reference that addresses nothing rather than storing an empty pointer', () => {
    const i = issue({
      references: [
        { module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: null },
        { module: '', recordType: 'ncr', recordId: 'ncr-18', label: 'broken' },
        { module: 'engineering', recordType: 'rfi', recordId: '  ', label: 'also broken' },
      ],
    });
    expect(i.references).toHaveLength(1);
  });

  it('resolving an issue changes only the issue', () => {
    // The domain half of "closing ProjectIssue ≠ closing the NCR": the rules have no reach into a
    // referenced record, and the resolved issue still points at exactly what it pointed at.
    const refs = [{ module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' }];
    const before = issue({ references: refs });
    const after = setProjectIssueStatus(before, 'resolved', { note: 'Client released the workfront' });
    expect(after.references).toEqual(before.references);
  });

  it('keeps references through an edit that does not mention them', () => {
    const before = issue({ references: [{ module: 'procurement', recordType: 'purchase-order', recordId: 'po-105', label: 'PO-105' }] });
    expect(updateProjectIssue(before, { severity: 'critical' }).references).toEqual(before.references);
  });
});

describe('risk → issue materialisation', () => {
  it('creates a second record and leaves the first readable, with provenance stored once', () => {
    const original = risk({ likelihood: 'high', impact: 'high', mitigation: 'Chase weekly' });
    const { risk: after, issue: made } = materialiseRiskAsIssue(original, { actorId: 'u1' });

    // ONE pointer, on the issue. The risk says what happened to it, which is a different fact.
    expect(made.originRiskId).toBe(original.id);
    expect(after.status).toBe('MATERIALISED');
    // The forecast survives intact: what was predicted, how likely it was thought to be, and what
    // was being done about it. A status mutation on one row would have destroyed all three.
    expect(after).toMatchObject({ likelihood: 'high', impact: 'high', severity: 'CRITICAL', mitigation: 'Chase weekly' });
  });

  it('does not carry the risk severity across', () => {
    const { issue: made } = materialiseRiskAsIssue(risk({ likelihood: 'high', impact: 'high' }));
    // CRITICAL was computed from a likelihood that has now resolved to certainty. Translating it
    // would be arithmetic on a fact that no longer exists.
    expect(made.severity).toBe('major');
    expect(materialiseRiskAsIssue(risk(), { severity: 'critical' }).issue.severity).toBe('critical');
  });

  it('carries the delivery area, because a procurement risk that lands is a procurement issue', () => {
    expect(materialiseRiskAsIssue(risk({ area: 'PROCUREMENT' })).issue.area).toBe('PROCUREMENT');
  });

  it('carries the accountable user across materialisation (AURA-PM-001), unless overridden', () => {
    // The risk owned by a user becomes an issue owned by that user — so "assigned to me" survives a
    // risk landing into an issue, which is exactly when a PM most needs to still see it.
    expect(materialiseRiskAsIssue(risk({ ownerId: 'u-eng' })).issue.ownerId).toBe('u-eng');
    expect(materialiseRiskAsIssue(risk({ ownerId: 'u-eng' }), { ownerId: 'u-pm' }).issue.ownerId).toBe('u-pm');
  });

  it('materialises once, and never twice', () => {
    const { risk: after } = materialiseRiskAsIssue(risk());
    expect(() => materialiseRiskAsIssue(after)).toThrow(/already materialised/);
    expect(() => markRiskMaterialised(after)).toThrow(/already materialised/);
  });

  it('refuses to materialise a risk that went away', () => {
    const gone = setProjectRiskStatus(risk(), 'RESOLVED');
    expect(() => materialiseRiskAsIssue(gone)).toThrow(/did not occur; only a live exposure can materialise/);
  });

  it('rejects materialisation aimed at a project the risk does not belong to', () => {
    // The invariant, at the domain boundary. A request naming project B while addressing a risk in
    // project A must not quietly succeed and produce an issue on A — the caller would be told the
    // wrong thing about what it had just done. The database enforces the same rule through a
    // composite FK on (tenant_id, project_id, origin_risk_id).
    const inProjectA = risk({ projectId: 'project-a' });
    expect(() => materialiseRiskAsIssue(inProjectA, { expectedProjectId: 'project-b' }))
      .toThrow(/does not belong to project project-b/);
    // Nothing moved: the caller still holds an untouched, live risk.
    expect(inProjectA.status).toBe('OPEN');
  });

  it('never lets the caller choose the issue\'s project', () => {
    // The issue belongs where the risk belongs. There is no input that can place it elsewhere,
    // which is why the guard above is a check rather than a choice.
    const { issue: made } = materialiseRiskAsIssue(
      risk({ projectId: 'project-a' }),
      { expectedProjectId: 'project-a', ...( { projectId: 'project-b' } as object) },
    );
    expect(made.projectId).toBe('project-a');
  });
});

describe('issue rollups', () => {
  it('raises attention on a critical issue or an overdue one, and stays quiet otherwise', () => {
    const quiet = summariseProjectIssues([issue({ severity: 'major' }), issue({ severity: 'minor' })], TODAY);
    expect(quiet).toMatchObject({ open: 2, openMajor: 1, needsAttention: false });

    expect(summariseProjectIssues([issue({ severity: 'critical' })], TODAY).needsAttention).toBe(true);
    expect(summariseProjectIssues([issue({ severity: 'minor', dueDate: '2026-08-01' })], TODAY))
      .toMatchObject({ overdue: 1, needsAttention: true });
  });

  it('counts an overdue issue only while it is still live', () => {
    const solved = setProjectIssueStatus(issue({ dueDate: '2026-08-01' }), 'resolved', { note: 'done' });
    expect(summariseProjectIssues([solved], TODAY)).toMatchObject({ overdue: 0, needsAttention: false });
  });

  it('reports how many live issues were foreseen', () => {
    const { issue: foreseen } = materialiseRiskAsIssue(risk());
    // The other half of keeping a risk register: whether it saw any of this coming.
    expect(summariseProjectIssues([foreseen, issue()], TODAY)).toMatchObject({ open: 2, fromRisk: 1 });
  });

  it('reports the worst live severity, ignoring the ones that ended', () => {
    const solvedCritical = setProjectIssueStatus(issue({ severity: 'critical' }), 'resolved', { note: 'done' });
    expect(worstOpenIssueSeverity([solvedCritical, issue({ severity: 'minor' })])).toBe('minor');
    expect(worstOpenIssueSeverity([solvedCritical])).toBeNull();
    expect(worstOpenIssueSeverity([issue({ severity: 'major' }), issue({ severity: 'critical' })])).toBe('critical');
  });
});
