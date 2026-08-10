import { describe, expect, it } from 'vitest';
import { makeAuthority, isSourced, requireSource } from './authority';
import {
  covers,
  makeComplianceCase,
  setCaseStatus,
  type ComplianceCase,
} from './compliance-case';
import {
  certificateStatus,
  currentCertificate,
  makeCertificate,
  makeDecision,
  makeInspection,
  makeSubmission,
  recordInspectionOutcome,
  renew,
} from './case-records';

const CASE = { tenantId: 't1', authorityCode: 'sira', obligationCode: 'sira_system_certification' };
const projectCase = (over: Record<string, unknown> = {}): ComplianceCase =>
  makeComplianceCase({ ...CASE, scope: 'PROJECT', subjectId: 'p1', system: 'cctv', ...over } as never);

describe('Authority — reference data, not an enum', () => {
  it('normalises code and jurisdiction so rules match reliably', () => {
    const a = makeAuthority({ tenantId: 't1', code: ' sira ', name: ' SIRA ', jurisdiction: 'ae-du' });
    expect(a.code).toBe('SIRA');
    expect(a.jurisdiction).toBe('AE-DU');
    expect(a.active).toBe(true);
  });

  it('refuses an authority with no jurisdiction — it is what applicability resolves on', () => {
    expect(() => makeAuthority({ tenantId: 't1', code: 'DCD', name: 'Dubai Civil Defence', jurisdiction: '' })).toThrow(
      /jurisdiction is required/,
    );
  });
});

describe('the sourced-reference gate', () => {
  const good = { source: 'SIRA circular 12/2026', sourceVersion: 'rev B', retrievedAt: '2026-08-10', authorityCode: 'SIRA' };

  it('accepts a fully sourced fact', () => {
    expect(isSourced(good)).toBe(true);
    expect(requireSource('obligation', good)).toEqual(good);
  });

  it('refuses a regulatory fact with no provenance', () => {
    // The whole point: un-sourced regulatory data looks authoritative and gets relied on by
    // someone deciding whether a system may legally operate.
    expect(() => requireSource('obligation', null)).toThrow(/cannot be seeded without a source/);
    expect(() => requireSource('obligation', { ...good, source: '  ' })).toThrow(/cannot be seeded without a source/);
    expect(() => requireSource('obligation', { ...good, sourceVersion: '' })).toThrow(/cannot be seeded/);
  });

  it('refuses a retrieval date that is not a real date — a fact with no shelf life', () => {
    expect(() => requireSource('fee', { ...good, retrievedAt: 'last week' })).toThrow(/cannot be seeded/);
  });
});

describe('ComplianceCase — scope', () => {
  it('derives subjectType from scope rather than trusting a caller-supplied one', () => {
    expect(projectCase().subjectType).toBe('project');
    expect(makeComplianceCase({ ...CASE, scope: 'COMPANY', subjectId: 'c1' } as never).subjectType).toBe('company');
    expect(makeComplianceCase({ ...CASE, scope: 'PERSON', subjectId: 'u1' } as never).subjectType).toBe('person');
  });

  it('supports the company and person scopes SIRA needs and DCD does not', () => {
    // SIRA licenses the contractor and cards technicians; a project-only model cannot express it.
    const company = makeComplianceCase({ ...CASE, scope: 'COMPANY', subjectId: 'c1' } as never);
    expect(company.scope).toBe('COMPANY');
    expect(company.projectId).toBeNull();
  });

  it('refuses an unknown scope instead of silently defaulting', () => {
    expect(() => makeComplianceCase({ ...CASE, scope: 'GALAXY', subjectId: 'x' } as never)).toThrow(/unknown scope/);
  });

  it('requires a subject — a case bound to nothing cannot be discharged', () => {
    expect(() => makeComplianceCase({ ...CASE, scope: 'PROJECT', subjectId: '' } as never)).toThrow(/subjectId is required/);
  });
});

describe('ComplianceCase — coverage', () => {
  it('covers every device in the system by default', () => {
    const c = projectCase();
    expect(c.coverage).toBe('ALL_SYSTEM_DEVICES');
    expect(covers(c, 'any-device-at-all')).toBe(true);
  });

  it('covers only the named devices when the authority certifies specific units', () => {
    const c = projectCase({ coverage: 'SELECTED_DEVICES', deviceIds: ['d1', 'd2'] });
    expect(covers(c, 'd1')).toBe(true);
    expect(covers(c, 'd3')).toBe(false);
  });

  it('refuses SELECTED_DEVICES with no devices — the ambiguity the flag exists to remove', () => {
    expect(() => projectCase({ coverage: 'SELECTED_DEVICES', deviceIds: [] })).toThrow(/at least one device/);
  });

  it('resolves the system through the shared taxonomy, aliases included', () => {
    expect(projectCase({ system: 'pa_va' }).system).toBe('public_address');
  });
});

describe('ComplianceCase — lifecycle', () => {
  it('walks the happy path to a certificate', () => {
    let c = projectCase();
    for (const s of ['submitted', 'under_review', 'approved', 'certified'] as const) {
      c = setCaseStatus(c, s);
    }
    expect(c.status).toBe('certified');
  });

  it('lets a rejected case be resubmitted — a refusal is the middle of a case, not the end', () => {
    let c = setCaseStatus(projectCase(), 'submitted');
    c = setCaseStatus(c, 'rejected');
    expect(setCaseStatus(c, 'submitted').status).toBe('submitted');
  });

  it('treats renewal as the same journey run again, from certified or expired', () => {
    let c = projectCase();
    for (const s of ['submitted', 'under_review', 'approved', 'certified'] as const) c = setCaseStatus(c, s);
    expect(setCaseStatus(c, 'submitted').status).toBe('submitted');

    const expired = setCaseStatus(c, 'expired');
    expect(setCaseStatus(expired, 'submitted').status).toBe('submitted');
  });

  it('refuses to certify something that was never approved', () => {
    const c = setCaseStatus(projectCase(), 'submitted');
    expect(() => setCaseStatus(c, 'certified')).toThrow(/can follow submitted/);
  });

  it('treats withdrawn as terminal', () => {
    const c = setCaseStatus(projectCase(), 'withdrawn');
    expect(() => setCaseStatus(c, 'submitted')).toThrow(/nothing can follow withdrawn/);
  });

  it('makes inspection optional — under_review can approve directly', () => {
    let c = setCaseStatus(projectCase(), 'submitted');
    c = setCaseStatus(c, 'under_review');
    expect(setCaseStatus(c, 'approved').status).toBe('approved');
    expect(setCaseStatus(c, 'inspection').status).toBe('inspection');
  });
});

describe('Submissions — attempt history', () => {
  it('numbers attempts so a resubmission does not overwrite the first', () => {
    const first = makeSubmission({ tenantId: 't1', caseId: 'c1', attempt: 1, submittedAt: '2026-08-01' });
    const second = makeSubmission({ tenantId: 't1', caseId: 'c1', attempt: 2, submittedAt: '2026-09-01' });
    expect(first.id).not.toBe(second.id);
    expect([first.attempt, second.attempt]).toEqual([1, 2]);
  });

  it('refuses a negative fee', () => {
    expect(() =>
      makeSubmission({ tenantId: 't1', caseId: 'c1', attempt: 1, submittedAt: '2026-08-01', fee: -5 }),
    ).toThrow(/fee cannot be negative/);
  });
});

describe('Inspections', () => {
  it('records the visit and implies re-inspection unless it passed', () => {
    const i = makeInspection({ tenantId: 't1', caseId: 'c1', scheduledAt: '2026-08-15' });
    const failed = recordInspectionOutcome(i, 'fail', '2026-08-15', { notes: 'panel not labelled' });
    expect(failed.reinspectionRequired).toBe(true);

    const passed = recordInspectionOutcome(i, 'pass', '2026-08-15');
    expect(passed.reinspectionRequired).toBe(false);
  });

  it('treats conditional as needing another visit', () => {
    const i = makeInspection({ tenantId: 't1', caseId: 'c1' });
    expect(recordInspectionOutcome(i, 'conditional', '2026-08-15').reinspectionRequired).toBe(true);
  });

  it('refuses to overwrite an outcome already recorded', () => {
    const i = recordInspectionOutcome(makeInspection({ tenantId: 't1', caseId: 'c1' }), 'pass', '2026-08-15');
    expect(() => recordInspectionOutcome(i, 'fail', '2026-08-16')).toThrow(/already recorded/);
  });
});

describe('Decisions — append-only', () => {
  it('demands a reason for a rejection — a refusal you cannot act on is not a decision', () => {
    expect(() =>
      makeDecision({ tenantId: 't1', caseId: 'c1', outcome: 'rejected', decisionDate: '2026-08-20' }),
    ).toThrow(/requires a reason/);
  });

  it('demands the conditions when approval is conditional', () => {
    expect(() =>
      makeDecision({ tenantId: 't1', caseId: 'c1', outcome: 'approved_with_conditions', decisionDate: '2026-08-20' }),
    ).toThrow(/requires its conditions/);
  });

  it('keeps the rejection when a later approval arrives — the record a dispute turns on', () => {
    const rejected = makeDecision({
      tenantId: 't1', caseId: 'c1', submissionId: 's1', outcome: 'rejected',
      decisionDate: '2026-08-20', reason: 'as-built drawings missing',
    });
    const approved = makeDecision({
      tenantId: 't1', caseId: 'c1', submissionId: 's2', outcome: 'approved', decisionDate: '2026-09-20',
    });

    const history = [rejected, approved];
    expect(history).toHaveLength(2);
    expect(history[0].reason).toBe('as-built drawings missing');
  });
});

describe('Certificates — append-only series', () => {
  const base = { tenantId: 't1', caseId: 'c1' };

  it('refuses a certificate that expires before it is issued', () => {
    expect(() => makeCertificate({ ...base, number: 'X', issuedAt: '2026-08-01', expiresAt: '2026-07-01' })).toThrow(
      /cannot expire before it is issued/,
    );
  });

  it('renews by issuing a new certificate, never by editing the old expiry date', () => {
    const first = makeCertificate({ ...base, number: 'SIRA-001', issuedAt: '2025-09-01', expiresAt: '2026-09-01' });
    const { previous, current } = renew(first, { ...base, number: 'SIRA-002', issuedAt: '2026-09-01', expiresAt: '2027-09-01' });

    // The old one keeps its own dates — "what was valid on 14 March" stays answerable.
    expect(previous.expiresAt).toBe('2026-09-01');
    expect(previous.supersededByCertificateId).toBe(current.id);
    expect(current.expiresAt).toBe('2027-09-01');
  });

  it('refuses to renew a certificate that is already superseded', () => {
    const first = makeCertificate({ ...base, number: 'A', issuedAt: '2025-09-01' });
    const { previous } = renew(first, { ...base, number: 'B', issuedAt: '2026-09-01' });
    expect(() => renew(previous, { ...base, number: 'C', issuedAt: '2027-09-01' })).toThrow(/already superseded/);
  });

  it('identifies the live certificate as the one nothing supersedes', () => {
    const first = makeCertificate({ ...base, number: 'A', issuedAt: '2025-09-01' });
    const { previous, current } = renew(first, { ...base, number: 'B', issuedAt: '2026-09-01' });
    expect(currentCertificate([previous, current])?.number).toBe('B');
  });

  it('uses the shared expiry projection rather than a fifth private copy', () => {
    const c = makeCertificate({ ...base, number: 'A', issuedAt: '2026-01-01', expiresAt: '2026-09-01' });
    expect(certificateStatus(c, '2026-08-11', 90).status).toBe('expiring');
    expect(certificateStatus(c, '2026-10-01', 90).status).toBe('expired');
    expect(certificateStatus(c, '2026-01-02', 90).status).toBe('valid');
  });

  it('treats a certificate with no expiry as perpetually valid', () => {
    // Some approvals genuinely do not lapse; that must not read as "expired because null".
    const c = makeCertificate({ ...base, number: 'A', issuedAt: '2026-01-01' });
    expect(certificateStatus(c, '2099-01-01').status).toBe('valid');
    expect(certificateStatus(c, '2099-01-01').daysToExpiry).toBeNull();
  });
});
