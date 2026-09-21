import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import {
  makeDailyReport, submitReport, startReviewReport, approveReport, rejectReport,
  reportSeparation, type DailyReport,
  makeSiteInstruction, acknowledgeInstruction, closeInstruction,
} from '@aura/site';
import {
  makeSnag, resolveSnag, closeSnag, reopenSnag, SNAG_TRANSITIONS,
  makeItp, activateItp, recordPointResult, closeItp,
} from '@aura/quality';
import { SiteController } from './site.controller';
import { QualityController } from '../quality/quality.controller';
import { HandoverController } from '../commissioning/handover.controller';

/**
 * SEC-01 stage 3, wave D — site, quality and commissioning. THE FIRST WAVE WITH NO SINGLE WILDCARD
 * AT ITS CENTRE: these acts sat behind four different ones, and the defect behind each differs.
 *
 * MEASURED AGAINST THE RUNNING API, AS ONE SITE ENGINEER:
 *
 *   201 POST site/daily-reports                  preparedBy  = u-e2e-site
 *   200 PUT  site/daily-reports/:id/submit       submittedBy = u-e2e-site
 *   201 POST site/daily-reports/:id/start-review reviewedBy  = u-e2e-site
 *   201 POST site/daily-reports/:id/approve      approvedBy  = u-e2e-site
 *
 * One person prepared, submitted, reviewed and approved the day's record of what happened on site
 * — the document a delay claim, a variation and a payment dispute are later argued from. The record
 * was BUILT for the check: four actor columns, four timestamps. Nothing connected them.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

const SITE = 'u-site-engineer';
const SUPERVISOR = 'u-project-engineer';

const report = (): DailyReport =>
  makeDailyReport({ tenantId: 't1', projectId: 'p1', date: '2026-09-18', reportNumber: 'DR-001', workDescription: 'Containment, level 3', createdBy: SITE });

describe('Wave D — the day is not written and signed off by one person', () => {
  it('declares a permission on every governing site act', () => {
    const p = SiteController.prototype;
    expect(declared(p.submitDailyReport)).toEqual(['site.daily-report.submit']);
    expect(declared(p.startReviewReport)).toEqual(['site.daily-report.review']);
    expect(declared(p.approveReport)).toEqual(['site.daily-report.approve']);
    expect(declared(p.rejectReport)).toEqual(['site.daily-report.approve']);
    expect(declared(p.acknowledgeInstruction)).toEqual(['site.instruction.acknowledge']);
    expect(declared(p.closeInstruction)).toEqual(['site.instruction.close']);
  });

  it('refuses the preparer their own approval — 403, the actor is wrong and nothing else', () => {
    const underReview = startReviewReport(submitReport(report(), SITE), SUPERVISOR);
    expect(() => approveReport(underReview, SITE)).toThrow(/may not approve their own/);
    expect(classifyDomainMessage('the person who prepared or submitted this daily report may not approve their own — the day is the record a claim is argued from'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('refuses the preparer their own rejection too', () => {
    // Withdrawing your own submission is a resubmission, not a review. Allowing it would let the
    // separation be sidestepped by rejecting and re-approving under a different status.
    const underReview = startReviewReport(submitReport(report(), SITE), SUPERVISOR);
    expect(() => rejectReport(underReview, SITE, 'changed my mind')).toThrow(/may not reject their own/);
  });

  it('lets the supervisor approve, and reports the separation', () => {
    const approved = approveReport(startReviewReport(submitReport(report(), SITE), SUPERVISOR), SUPERVISOR);
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe(SUPERVISOR);
    expect(reportSeparation(approved)).toBe('enforced');
    expect(reportSeparation(report())).toBeNull(); // not approved — not a verdict at all
    expect(reportSeparation({ ...approved, preparedBy: null, submittedBy: null })).toBe('unverifiable');
  });

  it('never rewrites reviewedBy on rejection', () => {
    // It was `reviewedBy: actorId ?? r.reviewedBy`, so the rejecter REPLACED whoever performed the
    // review. Same fabrication wave C removed from `approveDocument`.
    const underReview = startReviewReport(submitReport(report(), SITE), 'u-reviewer');
    expect(rejectReport(underReview, SUPERVISOR, 'Manpower figures do not reconcile').reviewedBy).toBe('u-reviewer');
  });

  it('splits execution from supervision across the two roles', () => {
    expect(role('r-site-engineer').permissions).not.toContain('site.*');
    for (const p of ['site.daily-report.create', 'site.daily-report.submit', 'site.instruction.acknowledge']) {
      expect(names('r-site-engineer', p), `the Site Engineer must name ${p}`).toBe(true);
    }
    for (const p of ['site.daily-report.approve', 'site.daily-report.review', 'site.instruction.issue', 'site.instruction.close']) {
      expect(holds('r-site-engineer', p), `the Site Engineer must NOT hold ${p}`).toBe(false);
    }
    // TWO roles approve, deliberately: an approval only one person can give stops a project.
    for (const r of ['r-project-engineer', 'r-pm']) {
      expect(names(r, 'site.daily-report.approve'), `${r} must name the approval`).toBe(true);
      expect(holds(r, 'site.daily-report.submit'), `${r} must not submit the day it approves`).toBe(false);
    }
  });

  it('records an actor on a site instruction, and keeps the free-text label beside it', () => {
    // `issuedBy` accepted the string "Anyone I Like" on a cost- and time-bearing instruction,
    // measured against the running API. It is kept — an instruction can come from a consultant who
    // is not a platform user — but it is no longer the only thing recorded.
    const si = makeSiteInstruction({
      tenantId: 't1', projectId: 'p1', reference: 'SI-001', issuedBy: 'A. Consultant',
      issuedByUserId: SUPERVISOR, date: '2026-09-18', instruction: 'Relocate the riser',
    });
    expect(si.issuedBy).toBe('A. Consultant');
    expect(si.issuedByUserId).toBe(SUPERVISOR);
    const acked = acknowledgeInstruction(si, SITE);
    expect(acked.acknowledgedBy).toBe(SITE);
    const closed = closeInstruction(acked, SUPERVISOR);
    expect(closed.closedBy).toBe(SUPERVISOR);
    expect(closed.closedAt).not.toBeNull();
  });
});

describe('Wave D — a snag could walk backwards out of closed', () => {
  const snag = () => makeSnag({ tenantId: 't1', projectId: 'p1', description: 'Tray unpainted', locationDetail: 'L3', severity: 'medium', createdBy: 'u-qaqc' });

  it('declares a permission on each quality act, and they are not the same one', () => {
    const p = QualityController.prototype;
    expect(declared(p.resolveSnag)).toEqual(['quality.snag.resolve']);
    expect(declared(p.closeSnag)).toEqual(['quality.snag.close']);
    expect(declared(p.activateItp)).toEqual(['quality.itp.activate']);
    expect(declared(p.closeItp)).toEqual(['quality.itp.close']);
  });

  it('has a state machine at all, and it does not go backwards', () => {
    // MEASURED BEFORE: `PUT :id/close` returned 200, then `PUT :id/resolve` returned 200 on the same
    // snag. `status` was a plain field the service assigned to in place.
    expect(SNAG_TRANSITIONS.closed).toEqual([]);
    const closed = closeSnag(resolveSnag(snag(), 'u-qaqc'), 'u-qaqc');
    expect(() => resolveSnag(closed, 'u-qaqc')).toThrow(/can only advance/);
    expect(classifyDomainMessage("a snag in 'closed' can only advance to an allowed next state (attempted → 'resolved')").status).toBe(409);
  });

  it('cannot be closed without first being resolved', () => {
    expect(() => closeSnag(snag(), 'u-qaqc')).toThrow(/can only advance/);
  });

  it('records who resolved and who closed, and when', () => {
    const resolved = resolveSnag(snag(), 'u-qaqc');
    expect(resolved.resolvedBy).toBe('u-qaqc');
    expect(resolved.resolvedAt).not.toBeNull();
    const closed = closeSnag(resolved, 'u-qaqc-2');
    expect(closed.closedBy).toBe('u-qaqc-2');
    expect(closed.closedAt).not.toBeNull();
    // AND THE RAISER MAY CLOSE IT. No separation is enforced here on purpose: on site the inspector
    // who found the defect is the right person to verify the fix.
    expect(closeSnag(resolveSnag(snag(), 'u-qaqc'), 'u-qaqc').closedBy).toBe('u-qaqc');
  });

  it('requires a reason to reopen, and clears the claimed fix', () => {
    const resolved = resolveSnag(snag(), 'u-qaqc');
    expect(() => reopenSnag(resolved, '  ')).toThrow(/reason/i);
    const reopened = reopenSnag(resolved, 'Paint still missing at the coupler');
    expect(reopened.status).toBe('open');
    expect(reopened.resolvedBy).toBeNull();
    expect(reopened.resolvedAt).toBeNull();
  });

  it('records who put an ITP in force and who declared it complete', () => {
    const itp = makeItp({ tenantId: 't1', projectId: 'p1', reference: 'ITP-001', title: 'Containment', points: [{ activity: 'Tray alignment', pointType: 'witness' }] });
    expect(itp.activatedBy).toBeNull();
    const active = activateItp(itp, 'u-qaqc');
    expect(active.activatedBy).toBe('u-qaqc');
    expect(active.activatedAt).not.toBeNull();
    // The plan cannot be declared complete while a point is still pending — an existing rule, and a
    // good one: it is the difference between "the inspections are done" and "nobody is looking".
    expect(() => closeItp(active, 'u-qaqc-2')).toThrow(/inspection points are still pending/);
    const inspected = recordPointResult(active, 0, 'passed');
    const closed = closeItp(inspected, 'u-qaqc-2');
    expect(closed.closedBy).toBe('u-qaqc-2');
    expect(closed.closedAt).not.toBeNull();
  });

  it('drops the quality module wildcard without losing the register', () => {
    expect(role('r-qa-qc').permissions).not.toContain('quality.*');
    for (const p of ['quality.snag.create', 'quality.snag.resolve', 'quality.snag.close',
      'quality.itp.create', 'quality.itp.activate', 'quality.itp.close', 'quality.ncr.close']) {
      expect(names('r-qa-qc', p), `QA/QC must name ${p}`).toBe(true);
    }
  });
});

describe('Wave D — the handover that named nobody on either side', () => {
  it('declares a permission on each end of the exchange', () => {
    const p = HandoverController.prototype;
    expect(declared(p.submit)).toEqual(['commissioning.handover.submit']);
    expect(declared(p.accept)).toEqual(['commissioning.handover.accept']);
    expect(declared(p.reject)).toEqual(['commissioning.handover.reject']);
    expect(declared(p.completeTraining)).toEqual(['commissioning.handover.complete']);
  });

  it('separates delivering a handover from accepting one', () => {
    // MEASURED BEFORE: `403 PUT commissioning/handovers/:id/submit` as the PROJECT MANAGER —
    // "no grant satisfies commissioning.handover.submit". `commissioning.handover.*` sat only on
    // Handover/FM, so the party RECEIVING the handover was the only party that could issue it.
    expect(role('r-handover-fm').permissions).not.toContain('commissioning.handover.*');
    for (const r of ['r-pm', 'r-commissioning-engineer']) {
      expect(names(r, 'commissioning.handover.submit'), `${r} must be able to submit`).toBe(true);
      expect(holds(r, 'commissioning.handover.accept'), `${r} must NOT accept its own handover`).toBe(false);
    }
    expect(names('r-handover-fm', 'commissioning.handover.accept')).toBe(true);
    expect(holds('r-handover-fm', 'commissioning.handover.submit')).toBe(false);
  });

  it('leaves no module wildcard behind in any of the four modules', () => {
    for (const r of ELV_ROLE_MATRIX) {
      if (r.id === 'r-admin') continue;
      for (const p of r.permissions) {
        expect(p, `${r.id} holds a write wildcard`).not.toMatch(/^(site|quality|commissioning)\.(\*|[a-z-]+\.\*)$/);
      }
    }
  });
});
