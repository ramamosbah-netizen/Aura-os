import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import {
  approveDocument, issueDocument, startReviewDocument, submitDocument, makeDocumentRevision,
  revisionSeparation, type DocumentRevision,
  makeTransmittal, sendTransmittal, isConveyed, isExternalConveyance,
  makeSubmittal, submitForReview, returnWithCode, submittalProvenance,
} from '@aura/doccontrol';
import { DocControlController } from './doccontrol.controller';

/**
 * DOCUMENT CONTROL — SEC-01 stage 3, wave C. The module where "who released this" is the whole job.
 *
 * MEASURED BEFORE ANY OF THIS: no shipped role held a single `doccontrol` WRITE permission. All 24
 * roles held `doccontrol.*.read` and nothing else, so 19 mutating routes were reachable only through
 * an administrator's wildcard, and THERE WAS NO DOCUMENT CONTROLLER ROLE IN THE CATALOGUE AT ALL.
 *
 * The revision record was already well built — five separate actor columns, a strict state machine,
 * a mandatory rejection reason, supersede rather than overwrite. What no rule connected was WHO may
 * stand in each column. Driven as one principal against the running API:
 *
 *   201 submit   201 start-review   201 approve   201 issue
 *   submittedBy = decidedBy = issuedBy = u-admin
 *
 * One person authored, reviewed, approved and released the same drawing to the outside world, and
 * every status along the way was correct. A status says a thing happened; it never says who.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

const AUTHOR = 'u-technical-engineer';
const APPROVER = 'u-technical-manager';
const CONTROLLER = 'u-document-controller';

const rev = (): DocumentRevision =>
  makeDocumentRevision({ tenantId: 't1', registerEntryId: 'r1', documentNumber: 'ELV-SPEC-001', projectId: 'p1', revision: 'A' });
/** The legal path, walked by three different people. */
const toApproved = () => approveDocument(startReviewDocument(submitDocument(rev(), AUTHOR), APPROVER), APPROVER);

describe('Document Control — the three roles, and what each may not do', () => {
  it('declares a permission on every act that changes a controlled document', () => {
    const p = DocControlController.prototype;
    expect(declared(p.submitDocument)).toEqual(['doccontrol.revision.submit']);
    expect(declared(p.startReviewDocument)).toEqual(['doccontrol.revision.start-review']);
    expect(declared(p.approveDocument)).toEqual(['doccontrol.revision.approve']);
    expect(declared(p.issueDocument)).toEqual(['doccontrol.revision.issue']);
    expect(declared(p.addTransmittalItems)).toEqual(['doccontrol.transmittal.items']);
    expect(declared(p.sendTransmittal)).toEqual(['doccontrol.transmittal.send']);
    expect(declared(p.closeCorrespondence)).toEqual(['doccontrol.correspondence.close']);
    expect(declared(p.submitSubmittal)).toEqual(['doccontrol.submittal.submit']);
    expect(declared(p.returnSubmittal)).toEqual(['doccontrol.submittal.return']);
  });

  it('gives the AUTHOR no decision and no release', () => {
    for (const p of ['doccontrol.revision.submit', 'doccontrol.submittal.create', 'doccontrol.submittal.submit']) {
      expect(names('r-technical-engineer', p), `the author must name ${p}`).toBe(true);
    }
    for (const p of ['doccontrol.revision.approve', 'doccontrol.revision.issue', 'doccontrol.transmittal.send']) {
      expect(holds('r-technical-engineer', p), `the author must NOT hold ${p}`).toBe(false);
    }
  });

  it('gives the TECHNICAL AUTHORITY the decision and NOT the release', () => {
    expect(names('r-technical-manager', 'doccontrol.revision.approve')).toBe(true);
    expect(names('r-technical-manager', 'doccontrol.revision.start-review')).toBe(true);
    // THE HEADLINE RULE. Approving a document internally and releasing it outside are two acts, so
    // the role that approves does not hold the one that issues — even though it holds `engineering.*`.
    expect(holds('r-technical-manager', 'doccontrol.revision.issue')).toBe(false);
    expect(holds('r-technical-manager', 'doccontrol.transmittal.send')).toBe(false);
  });

  it('gives the RELEASE AUTHORITY everything that leaves the building, and no approval at all', () => {
    for (const p of [
      'doccontrol.revision.issue', 'doccontrol.transmittal.create', 'doccontrol.transmittal.send',
      'doccontrol.transmittal.items', 'doccontrol.transmittal.recipients',
      'doccontrol.correspondence.create', 'doccontrol.correspondence.close', 'doccontrol.register.create',
    ]) {
      expect(names('r-document-controller', p), `the Document Controller must name ${p}`).toBe(true);
    }
    // It registers and releases. It does not judge whether the content is right.
    for (const p of ['doccontrol.revision.approve', 'doccontrol.revision.start-review']) {
      expect(holds('r-document-controller', p), `the Document Controller must NOT hold ${p}`).toBe(false);
    }
  });

  it('leaves no wildcard standing in for any of it', () => {
    for (const r of ELV_ROLE_MATRIX) {
      if (r.id === 'r-admin') continue;
      for (const p of r.permissions) {
        expect(p, `${r.id} holds a doccontrol write wildcard`).not.toMatch(/^doccontrol\.(\*|[a-z-]+\.\*)$/);
      }
    }
  });
});

describe('Document Control — Author is not Approver is not Issuer', () => {
  it('refuses the author their own approval — 403, the actor is wrong and nothing else', () => {
    const underReview = startReviewDocument(submitDocument(rev(), AUTHOR), APPROVER);
    expect(() => approveDocument(underReview, AUTHOR)).toThrow(/may not approve their own/);
    expect(classifyDomainMessage('the person who submitted this revision may not approve their own — a second pair of eyes is what review means'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('refuses the approver their own issue', () => {
    expect(() => issueDocument(toApproved(), APPROVER)).toThrow(/may not issue it/);
    expect(classifyDomainMessage('the person who approved this revision may not issue it — approving it internally and releasing it outside are two acts'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('lets the three-person path through and records three distinct names', () => {
    const issued = issueDocument(toApproved(), CONTROLLER);
    expect(issued.status).toBe('issued');
    expect(new Set([issued.submittedBy, issued.decidedBy, issued.issuedBy]).size).toBe(3);
    expect(revisionSeparation(issued)).toEqual({ authorVsApprover: 'enforced', approverVsIssuer: 'enforced' });
  });

  it('distinguishes ENFORCED from UNVERIFIABLE from "no verdict at all"', () => {
    // Three states, and the middle one is the point. A revision written before the actor columns
    // existed cannot be shown to have had two people behind it — and saying so is not the same as
    // saying it did. Reporting 'enforced' there would be the evidence matrix telling itself a story,
    // which is the failure this whole wave exists to stop.
    const issued = issueDocument(toApproved(), CONTROLLER);
    expect(revisionSeparation(issued)).toEqual({ authorVsApprover: 'enforced', approverVsIssuer: 'enforced' });

    // The approval has a name, the authorship does not: the comparison cannot be made.
    expect(revisionSeparation({ ...issued, submittedBy: null }).authorVsApprover).toBe('unverifiable');
    expect(revisionSeparation({ ...issued, decidedBy: null }).approverVsIssuer).toBe('unverifiable');

    // NOT A VERDICT. The later act has not happened (or recorded nobody), so there is no pair to
    // judge — `null` rather than a reassuring 'enforced' or an alarming 'unverifiable'.
    const approvedOnly = toApproved();
    expect(revisionSeparation(approvedOnly).approverVsIssuer).toBeNull();
    expect(revisionSeparation({ ...issued, decidedBy: null, issuedBy: null }).authorVsApprover).toBeNull();
  });
});

describe('Document Control — an approval does not stand in for a review', () => {
  it('refuses to approve a revision whose review left no name', () => {
    // THE AMENDMENT, AND WHY IT IS NOT AN INVENTION. `approveDocument` used to back-fill
    // `reviewedBy: actorId ?? d.reviewedBy`, so the approver became the reviewer retroactively and
    // the record showed a two-stage review that had one stage. Leaving it null is not enough either:
    // DOCUMENT_TRANSITIONS has NO `submitted -> approved` edge, so review is a FORMAL STAGE of this
    // state machine, not an optional courtesy. A mandatory stage that leaves no name behind is the
    // hole the back-fill was quietly plugging.
    const unreviewed = { ...submitDocument(rev(), AUTHOR), status: 'under_review' as const, reviewedBy: null };
    expect(() => approveDocument(unreviewed, APPROVER)).toThrow(/until its review records who performed it/);
  });

  it('never writes reviewedBy on approval', () => {
    const underReview = startReviewDocument(submitDocument(rev(), AUTHOR), 'u-reviewer');
    expect(approveDocument(underReview, APPROVER).reviewedBy).toBe('u-reviewer');
  });
});

describe('Document Control — a sent transmittal is a record of what went out', () => {
  const draft = () => makeTransmittal({ tenantId: 't1', code: 'TR-001', title: 'IFC drawings', projectId: 'p1' });

  it('records who released it — the act kept a timestamp and no signature', () => {
    const sent = sendTransmittal(draft(), CONTROLLER);
    expect(sent.status).toBe('sent');
    expect(sent.sentBy).toBe(CONTROLLER);
    expect(sent.sentAt).not.toBeNull();
  });

  it('is conveyed once, and cannot be sent again', () => {
    const sent = sendTransmittal(draft(), CONTROLLER);
    expect(isConveyed(sent)).toBe(true);
    expect(isConveyed(draft())).toBe(false);
    // No second send: a correction is a NEW transmittal superseding this one, never an edit to the
    // record of what already left.
    expect(() => sendTransmittal(sent, 'u-someone-else')).toThrow(/can only advance/);
  });

  it('treats a conveyance of unknown kind as external', () => {
    // Rows written before the distinction existed carry no kind. The two readings are not symmetric:
    // calling an external conveyance internal understates what was disclosed.
    expect(isExternalConveyance({ ...draft(), kind: null })).toBe(true);
    expect(isExternalConveyance(draft())).toBe(true); // created through document control
    expect(isExternalConveyance({ ...draft(), kind: 'internal_release' })).toBe(false);
  });
});

describe('Document Control — no parallel engineering route releases a document', () => {
  it('keeps the engineering handoff out of external release', () => {
    // `POST engineering/drawings/:id/transmit` is an INTERNAL handoff to the site team. Its reactor
    // creates a doccontrol transmittal and sends it, so it is the one other way to reach a `sent`
    // conveyance. The authority it asserts is `engineering.drawing.release` — it was called
    // `engineering.drawing.transmit`, which read like the external act it is not.
    expect(names('r-technical-engineer', 'engineering.drawing.release')).toBe(true);
    // And the people who can perform it hold no release authority of their own.
    expect(holds('r-technical-engineer', 'doccontrol.transmittal.send')).toBe(false);
    expect(holds('r-technical-engineer', 'doccontrol.revision.issue')).toBe(false);
    for (const r of ELV_ROLE_MATRIX) {
      if (r.id === 'r-admin') continue;
      if (!holds(r.id, 'engineering.drawing.release')) continue;
      expect(holds(r.id, 'doccontrol.revision.issue'), `${r.id} can release a drawing AND issue a controlled document`).toBe(false);
    }
  });
});

describe('Document Control — a submittal went out and came back naming nobody', () => {
  const sub = () => makeSubmittal({ tenantId: 't1', projectId: 'p1', reference: 'SUB-001', title: 'Cable schedule' });

  it('records an actor on both acts', () => {
    const sent = submitForReview(sub(), AUTHOR);
    expect(sent.submittedBy).toBe(AUTHOR);
    const back = returnWithCode(sent, 'B', { returnedBy: CONTROLLER, comments: 'Approved with comments' });
    expect(back.returnedBy).toBe(CONTROLLER);
    expect(submittalProvenance(back)).toBe('recorded');
  });

  it('reports an unsigned pair as incomplete rather than as a clean record', () => {
    const back = returnWithCode(submitForReview(sub(), null), 'A', { returnedBy: null });
    expect(back.status).toBe('returned');
    expect(submittalProvenance(back)).toBe('incomplete');
  });
});
