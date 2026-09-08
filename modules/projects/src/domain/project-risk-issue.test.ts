import { describe, expect, it } from 'vitest';
import {
  makeProjectRisk, updateProjectRisk, setProjectRiskStatus, summariseProjectRisks,
  riskMaterialised, PROJECT_DELIVERY_AREAS, type NewProjectRisk,
} from './project-risk';
import {
  makeProjectIssue, updateProjectIssue, setProjectIssueStatus, summariseProjectIssues,
  materialiseRiskAsIssue, issueTransitionsFor, worstOpenIssueSeverity, PROJECT_ISSUE_SEVERITIES,
  type NewProjectIssue,
} from './project-issue';

/**
 * §21 — the two registers, and the line between them.
 *
 * The single most important thing these tests hold in place is that a risk and an issue are not the
 * same record wearing different labels. A risk is uncertain and its severity is COMPUTED from a
 * likelihood; an issue has already happened, has no likelihood, and its severity is DECLARED. Every
 * assertion below about severity exists to stop the two quietly converging again.
 */

const TODAY = '2026-09-08';
const base = { tenantId: 't1', projectId: 'p1' };

const risk = (over: Partial<NewProjectRisk> = {}) =>
  makeProjectRisk({ ...base, title: 'Authority approval may be delayed', ...over });

const issue = (over: Partial<NewProjectIssue> = {}) =>
  makeProjectIssue({ ...base, title: 'Authority approval is overdue', ...over });

describe('project risk — the shared matrix, a delivery taxonomy of its own', () => {
  it('derives severity from likelihood and impact rather than accepting one', () => {
    expect(risk({ likelihood: 'high', impact: 'high' }).severity).toBe('CRITICAL');
    expect(risk({ likelihood: 'low', impact: 'low' }).severity).toBe('LOW');
    // And recomputes when either axis moves — a stale severity is a lie told with a number.
    const r = risk({ likelihood: 'low', impact: 'low' });
    expect(updateProjectRisk(r, { impact: 'high' }).severity).toBe('MEDIUM');
    expect(updateProjectRisk(r, { likelihood: 'high', impact: 'high' }).severity).toBe('CRITICAL');
  });

  it('categorises by the domain that would have to answer, not by CRM deal types', () => {
    // The shared file holds the matrix; it deliberately does not hold a taxonomy, because
    // RELATIONSHIP and COMPETITIVE cannot threaten a site.
    expect(PROJECT_DELIVERY_AREAS).toContain('PROCUREMENT');
    expect(PROJECT_DELIVERY_AREAS).toContain('AUTHORITY');
    expect(PROJECT_DELIVERY_AREAS).not.toContain('COMPETITIVE');
    expect(PROJECT_DELIVERY_AREAS).not.toContain('CUSTOMER');
  });

  it('refuses an acceptance nobody has to justify', () => {
    // Accepting is a decision to carry the exposure. Without a reason it is indistinguishable from
    // an unattended risk, and it reads as governance while providing none.
    expect(() => setProjectRiskStatus(risk(), 'ACCEPTED')).toThrow(/requires a reason/);
    expect(setProjectRiskStatus(risk(), 'ACCEPTED', 'Client carries this; agreed at the 4 Sep meeting').status).toBe('ACCEPTED');
  });

  it('counts a risk that LANDED apart from one that went away', () => {
    const went = setProjectRiskStatus(risk({ title: 'Went away' }), 'RESOLVED');
    const { risk: landed } = materialiseRiskAsIssue(risk({ title: 'Landed', likelihood: 'high', impact: 'high' }));

    // Both are off the live register, and both read RESOLVED. Only the link tells them apart.
    expect(went.status).toBe('RESOLVED');
    expect(landed.status).toBe('RESOLVED');
    expect(riskMaterialised(went)).toBe(false);
    expect(riskMaterialised(landed)).toBe(true);

    const s = summariseProjectRisks([went, landed], TODAY);
    expect(s).toMatchObject({ open: 0, resolved: 1, materialised: 1 });
  });

  it('flags a mitigation whose target date has passed', () => {
    const late = risk({ targetDate: '2026-08-01', likelihood: 'low', impact: 'low' });
    const s = summariseProjectRisks([late], TODAY);
    // LOW severity, so the severity arm is silent — the date is what raises this, which is the
    // point: a low risk nobody has acted on by the date they set is still a governance failure.
    expect(s).toMatchObject({ openCritical: 0, openHigh: 0, overdueMitigations: 1, needsAttention: true });
  });
});

describe('project issue — severity it declares, not severity it inherits', () => {
  it('grades itself in the vocabulary this system uses for problems that exist now', () => {
    // NCR and punch item are minor | major | critical. An issue is graded the same way.
    // It is NOT LOW | MEDIUM | HIGH | CRITICAL: that scale is the output of a likelihood × impact
    // matrix, and an issue has no likelihood to feed it.
    expect(PROJECT_ISSUE_SEVERITIES).toEqual(['minor', 'major', 'critical']);
    for (const riskGrade of ['LOW', 'MEDIUM', 'HIGH']) {
      expect(PROJECT_ISSUE_SEVERITIES as readonly string[]).not.toContain(riskGrade);
    }
  });

  it('takes the severity it is given, and computes nothing', () => {
    expect(issue({ severity: 'critical' }).severity).toBe('critical');
    expect(issue({ severity: 'minor' }).severity).toBe('minor');
    // No likelihood exists on the record at all, so nothing could derive it even by accident.
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
    // Both endings reopen, and reopen is all they do: an issue does not go from resolved straight
    // back to being worked without someone reopening it first.
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
    const s = summariseProjectIssues([solved, dropped], TODAY);
    // Collapsing these would inflate every "issues resolved" figure with problems that merely
    // stopped being asked about.
    expect(s).toMatchObject({ resolved: 1, withdrawn: 1, open: 0 });
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
      links: [{ module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' }],
    });
    expect(i.links).toEqual([{ module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' }]);
    // No status, no due date, no copy of the record's own fields — nothing a reader could mistake
    // for the current state of the NCR.
    expect(Object.keys(i.links[0]).sort()).toEqual(['label', 'module', 'recordId', 'recordType']);
  });

  it('drops a link that addresses nothing rather than storing a dangling pointer', () => {
    const i = issue({
      links: [
        { module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: null },
        { module: '', recordType: 'ncr', recordId: 'ncr-18', label: 'broken' },
        { module: 'engineering', recordType: 'rfi', recordId: '  ', label: 'also broken' },
      ],
    });
    expect(i.links).toHaveLength(1);
  });

  it('resolving an issue changes only the issue', () => {
    // The structural half of "closing ProjectIssue ≠ closing the NCR": the rules have no reach into
    // a linked record, and the resolved issue still points at exactly what it pointed at.
    const links = [{ module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' }];
    const before = issue({ links });
    const after = setProjectIssueStatus(before, 'resolved', { note: 'Client released the workfront' });
    expect(after.links).toEqual(before.links);
    expect(after.links[0]).toEqual(links[0]);
  });

  it('keeps a link through an edit that does not mention links', () => {
    const before = issue({ links: [{ module: 'procurement', recordType: 'purchase-order', recordId: 'po-105', label: 'PO-105' }] });
    expect(updateProjectIssue(before, { severity: 'critical' }).links).toEqual(before.links);
  });
});

describe('risk → issue materialisation', () => {
  it('creates a second record and leaves the first readable, with provenance both ways', () => {
    const original = risk({ likelihood: 'high', impact: 'high', mitigation: 'Chase weekly' });
    const { risk: after, issue: made } = materialiseRiskAsIssue(original, { actorId: 'u1' });

    expect(made.originRiskId).toBe(original.id);
    expect(after.linkedIssueId).toBe(made.id);
    // The forecast survives intact: what was predicted, how likely it was thought to be, and what
    // was being done about it. A status mutation would have destroyed all three.
    expect(after).toMatchObject({ likelihood: 'high', impact: 'high', severity: 'CRITICAL', mitigation: 'Chase weekly' });
  });

  it('does not carry the risk severity across', () => {
    const { issue: made } = materialiseRiskAsIssue(risk({ likelihood: 'high', impact: 'high' }));
    // CRITICAL was computed from a likelihood that has now resolved to certainty. Translating it
    // would be arithmetic on a fact that no longer exists, so someone states what this is doing to
    // delivery now.
    expect(made.severity).toBe('major');
    expect(made.severity).not.toBe('CRITICAL');
    expect(materialiseRiskAsIssue(risk(), { severity: 'critical' }).issue.severity).toBe('critical');
  });

  it('carries the delivery area, because a procurement risk that lands is a procurement issue', () => {
    const { issue: made } = materialiseRiskAsIssue(risk({ area: 'PROCUREMENT' }));
    expect(made.area).toBe('PROCUREMENT');
  });

  it('materialises once, and never twice', () => {
    const { risk: after } = materialiseRiskAsIssue(risk());
    expect(() => materialiseRiskAsIssue(after)).toThrow(/already materialised/);
  });

  it('refuses to materialise a risk that went away', () => {
    const gone = setProjectRiskStatus(risk(), 'RESOLVED');
    expect(() => materialiseRiskAsIssue(gone)).toThrow(/only a risk that is still live can materialise/);
  });

  it('will not put a materialised risk back on the live register', () => {
    // Otherwise the same problem is counted twice: once as a live exposure and once as a live
    // issue, and every rollup double-reports it.
    const { risk: after } = materialiseRiskAsIssue(risk());
    expect(() => setProjectRiskStatus(after, 'OPEN')).toThrow(/cannot return to the live register/);
    expect(() => setProjectRiskStatus(after, 'MITIGATING')).toThrow(/cannot return to the live register/);
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
    const s = summariseProjectIssues([foreseen, issue()], TODAY);
    // The other half of keeping a risk register: whether the register saw any of this coming.
    expect(s).toMatchObject({ open: 2, fromRisk: 1 });
  });

  it('reports the worst live severity, ignoring the ones that ended', () => {
    const solvedCritical = setProjectIssueStatus(issue({ severity: 'critical' }), 'resolved', { note: 'done' });
    expect(worstOpenIssueSeverity([solvedCritical, issue({ severity: 'minor' })])).toBe('minor');
    expect(worstOpenIssueSeverity([solvedCritical])).toBeNull();
    expect(worstOpenIssueSeverity([issue({ severity: 'major' }), issue({ severity: 'critical' })])).toBe('critical');
  });
});
