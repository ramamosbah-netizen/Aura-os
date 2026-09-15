import { describe, expect, it } from 'vitest';
import { makeMaterialApproval, reviewMaterialApproval, submitMaterialApproval, type MaterialApproval } from './material-approval';
import { supplierMaterialStanding } from './supplier-material-standing';

/**
 * What material-approval evidence stands for a SUPPLIER on a project.
 *
 * Named for what it can answer. A Material Approval Request approves a specified product, and one
 * supplier supplies dozens — so nothing here says whether the material on a given order is the
 * approved one. That needs a canonical purchased-material identity, which this system does not have
 * and the frozen roadmap gives to Wave 4 (`BUY-01`).
 *
 * `hasStandingRefusal` is the only field a governed decision may consume, because it is the only
 * one that does not depend on knowing which material is being bought: Procurement's owned rule is
 * that a REJECTED request blocks a purchase order, and that no refusal allows it.
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
    const answer = supplierMaterialStanding([], GULF);
    expect(answer.standing).toBe('UNKNOWN');
    // Nothing on file is not a refusal either — it is the absence of any evidence at all, and the
    // one thing it must never be read as is an approval.
    expect(answer.hasStandingRefusal).toBe(false);
    expect(answer.reason).toMatch(/no material approval request exists/);
  });

  it('says what to do next rather than only that something is missing', () => {
    expect(supplierMaterialStanding([], GULF).reason).toMatch(/raise one before ordering/);
  });

  it('is UNKNOWN for a supplier nobody raised anything about, even when the project has others', () => {
    const answer = supplierMaterialStanding([approved()], { name: 'Somebody Else Trading' });
    expect(answer).toMatchObject({ standing: 'UNKNOWN', hasStandingRefusal: false });
  });
});

describe('a decision that exists', () => {
  it('lets an approved material through, and names the request it read', () => {
    const answer = supplierMaterialStanding([approved()], GULF);
    expect(answer).toMatchObject({ standing: 'APPROVED', hasStandingRefusal: false, references: ['MAR-001'] });
  });

  it('lets an approved-as-noted material through, carrying its conditions', () => {
    // An approval with conditions attached. Dropping the conditions would make it read as
    // unconditional, which is a different permission from the one that was given.
    const answer = supplierMaterialStanding([asNoted()], GULF);
    expect(answer).toMatchObject({ standing: 'APPROVED_AS_NOTED', hasStandingRefusal: false });
    expect(answer.reason).toMatch(/comments are binding/);
  });

  it('refuses a rejected material', () => {
    const answer = supplierMaterialStanding([rejected()], GULF);
    expect(answer).toMatchObject({ standing: 'REJECTED', hasStandingRefusal: true });
    expect(answer.reason).toMatch(/rejected material approval request/);
  });
});

describe('a decision that has not been made yet', () => {
  it('is PENDING, not approved — the consultant is still holding it', () => {
    const answer = supplierMaterialStanding([submitMaterialApproval(mar())], GULF);
    expect(answer).toMatchObject({ standing: 'PENDING', hasStandingRefusal: false });
    expect(answer.reason).toMatch(/awaiting the consultant/);
  });

  it('is PENDING for a draft nobody ever submitted, and says which it is', () => {
    // "Still in draft" and "with the consultant" are different facts about a purchase order: one
    // means wait, the other means somebody has to press submit.
    const answer = supplierMaterialStanding([mar()], GULF);
    expect(answer).toMatchObject({ standing: 'PENDING', hasStandingRefusal: false });
    expect(answer.reason).toMatch(/still in draft, never submitted/);
  });

  it('keeps PENDING distinct from UNKNOWN', () => {
    // Nobody asked vs nobody answered. Collapsing them tells a buyer the wrong thing to do.
    expect(supplierMaterialStanding([submitMaterialApproval(mar())], GULF).standing).toBe('PENDING');
    expect(supplierMaterialStanding([], GULF).standing).toBe('UNKNOWN');
  });
});

describe('when a supplier has more than one request', () => {
  it('reports the REFUSAL sitting beside an approval, not the approval', () => {
    // Reporting only the approval would hide the refusal behind it — and a buyer needs the refusal
    // first, because it is the one that stops a purchase order.
    const answer = supplierMaterialStanding([approved(), rejected({ reference: 'MAR-002' })], GULF);
    expect(answer).toMatchObject({ standing: 'REJECTED', hasStandingRefusal: true });
    expect(answer.references).toEqual(['MAR-002']);
  });

  it('reports an undecided request beside an approved one', () => {
    const answer = supplierMaterialStanding([approved(), submitMaterialApproval(mar({ reference: 'MAR-003' }))], GULF);
    expect(answer).toMatchObject({ standing: 'PENDING', hasStandingRefusal: false });
  });
});

describe('which requests a verdict is read from', () => {
  it('prefers the canonical supplier id over the typed name', () => {
    // Two suppliers can share a name and one supplier gets typed three ways; the id is the answer
    // whenever the record carries one.
    const linked = approved({ supplierId: 'sup-1', supplier: 'Gulf Cables LLC' });
    expect(supplierMaterialStanding([linked], { id: 'sup-1', name: 'anything at all' }).standing).toBe('APPROVED');
    expect(supplierMaterialStanding([linked], { id: 'sup-2', name: 'Gulf Cables LLC' }).standing).toBe('UNKNOWN');
  });

  it('still matches historical requests by name, where that is all they have', () => {
    // Requests raised before suppliers were linked have nothing else, and refusing to read them
    // would turn every one of them into an UNKNOWN overnight.
    const legacy = approved({ supplierId: null });
    expect(supplierMaterialStanding([legacy], { id: 'sup-1', name: 'Gulf Cables LLC' }).standing).toBe('APPROVED');
  });

  it('matches a name regardless of how it was cased or spaced', () => {
    expect(supplierMaterialStanding([approved()], { name: '  gulf cables llc ' }).standing).toBe('APPROVED');
  });
});
