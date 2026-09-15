import { describe, expect, it } from 'vitest';
import { makeMaterialApproval, reviewMaterialApproval, submitMaterialApproval, type MaterialApproval } from './material-approval';
import { materialApprovalVerdict } from './material-approval-verdict';

/**
 * ENG-04 — "may this material be bought and installed?"
 *
 * The record was never the problem. What "approved" MEANT was: the procurement gate asked whether
 * the supplier had a REJECTED request and passed whenever the answer was no, so a material nobody
 * ever submitted issued a purchase order exactly like an approved one. These tests are mostly about
 * the states that used to be indistinguishable from approval.
 */

const mar = (over: Partial<MaterialApproval> = {}): MaterialApproval => ({
  ...makeMaterialApproval({
    tenantId: 't1', projectId: 'p1', reference: 'MAR-001',
    materialName: 'FP200 Gold 2C 1.5mm', manufacturer: 'Prysmian', supplier: 'Gulf Cables LLC',
  }),
  ...over,
});
const approved = (over: Partial<MaterialApproval> = {}) =>
  reviewMaterialApproval(submitMaterialApproval(mar(over)), 'approved', 'u-consultant');
const asNoted = (over: Partial<MaterialApproval> = {}) =>
  reviewMaterialApproval(submitMaterialApproval(mar(over)), 'approved_as_noted', 'u-consultant', 'use the LSZH variant');
const rejected = (over: Partial<MaterialApproval> = {}) =>
  reviewMaterialApproval(submitMaterialApproval(mar(over)), 'rejected', 'u-consultant', 'not to specification');

const GULF = { name: 'Gulf Cables LLC' };

describe('nothing on file', () => {
  it('is UNKNOWN, and UNKNOWN is not a pass', () => {
    // The defect this exists to close: absence of a rejection was being read as approval.
    const answer = materialApprovalVerdict([], GULF);
    expect(answer.verdict).toBe('UNKNOWN');
    expect(answer.mayProceed).toBe(false);
    expect(answer.reason).toMatch(/no material approval request exists/);
  });

  it('says what to do next rather than only that something is missing', () => {
    expect(materialApprovalVerdict([], GULF).reason).toMatch(/raise one before ordering/);
  });

  it('is UNKNOWN for a supplier nobody raised anything about, even when the project has others', () => {
    const answer = materialApprovalVerdict([approved()], { name: 'Somebody Else Trading' });
    expect(answer).toMatchObject({ verdict: 'UNKNOWN', mayProceed: false });
  });
});

describe('a decision that exists', () => {
  it('lets an approved material through, and names the request it read', () => {
    const answer = materialApprovalVerdict([approved()], GULF);
    expect(answer).toMatchObject({ verdict: 'APPROVED', mayProceed: true, references: ['MAR-001'] });
  });

  it('lets an approved-as-noted material through, carrying its conditions', () => {
    // An approval with conditions attached. Dropping the conditions would make it read as
    // unconditional, which is a different permission from the one that was given.
    const answer = materialApprovalVerdict([asNoted()], GULF);
    expect(answer).toMatchObject({ verdict: 'APPROVED_AS_NOTED', mayProceed: true });
    expect(answer.reason).toMatch(/comments are binding/);
  });

  it('refuses a rejected material', () => {
    const answer = materialApprovalVerdict([rejected()], GULF);
    expect(answer).toMatchObject({ verdict: 'REJECTED', mayProceed: false });
    expect(answer.reason).toMatch(/rejected material approval request/);
  });
});

describe('a decision that has not been made yet', () => {
  it('is PENDING, not approved — the consultant is still holding it', () => {
    const answer = materialApprovalVerdict([submitMaterialApproval(mar())], GULF);
    expect(answer).toMatchObject({ verdict: 'PENDING', mayProceed: false });
    expect(answer.reason).toMatch(/awaiting the consultant/);
  });

  it('is PENDING for a draft nobody ever submitted, and says which it is', () => {
    // "Still in draft" and "with the consultant" are different facts about a purchase order: one
    // means wait, the other means somebody has to press submit.
    const answer = materialApprovalVerdict([mar()], GULF);
    expect(answer).toMatchObject({ verdict: 'PENDING', mayProceed: false });
    expect(answer.reason).toMatch(/still in draft, never submitted/);
  });

  it('keeps PENDING distinct from UNKNOWN', () => {
    // Nobody asked vs nobody answered. Collapsing them tells a buyer the wrong thing to do.
    expect(materialApprovalVerdict([submitMaterialApproval(mar())], GULF).verdict).toBe('PENDING');
    expect(materialApprovalVerdict([], GULF).verdict).toBe('UNKNOWN');
  });
});

describe('when a supplier has more than one request', () => {
  it('reports the REFUSAL sitting beside an approval, not the approval', () => {
    // Reporting only the approval would hide the refusal behind it — and a buyer needs the refusal
    // first, because it is the one that stops a purchase order.
    const answer = materialApprovalVerdict([approved(), rejected({ reference: 'MAR-002' })], GULF);
    expect(answer).toMatchObject({ verdict: 'REJECTED', mayProceed: false });
    expect(answer.references).toEqual(['MAR-002']);
  });

  it('reports an undecided request beside an approved one', () => {
    const answer = materialApprovalVerdict([approved(), submitMaterialApproval(mar({ reference: 'MAR-003' }))], GULF);
    expect(answer).toMatchObject({ verdict: 'PENDING', mayProceed: false });
  });
});

describe('which requests a verdict is read from', () => {
  it('prefers the canonical supplier id over the typed name', () => {
    // Two suppliers can share a name and one supplier gets typed three ways; the id is the answer
    // whenever the record carries one.
    const linked = approved({ supplierId: 'sup-1', supplier: 'Gulf Cables LLC' });
    expect(materialApprovalVerdict([linked], { id: 'sup-1', name: 'anything at all' }).verdict).toBe('APPROVED');
    expect(materialApprovalVerdict([linked], { id: 'sup-2', name: 'Gulf Cables LLC' }).verdict).toBe('UNKNOWN');
  });

  it('still matches historical requests by name, where that is all they have', () => {
    // Requests raised before suppliers were linked have nothing else, and refusing to read them
    // would turn every one of them into an UNKNOWN overnight.
    const legacy = approved({ supplierId: null });
    expect(materialApprovalVerdict([legacy], { id: 'sup-1', name: 'Gulf Cables LLC' }).verdict).toBe('APPROVED');
  });

  it('matches a name regardless of how it was cased or spaced', () => {
    expect(materialApprovalVerdict([approved()], { name: '  gulf cables llc ' }).verdict).toBe('APPROVED');
  });
});
