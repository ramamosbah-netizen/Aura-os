import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import { certifyClaim, certificationSeparation, payClaim, type Claim } from '@aura/subcontracts';
import { SubcontractsController } from './subcontracts.controller';

/**
 * SUBCONTRACTOR PAYMENT CERTIFICATION — SEC-01 stage 3, wave A.
 *
 * Measured against the running API before this change: ONE ADMINISTRATOR RAISED A CLAIM, CERTIFIED
 * IT, AND PAID IT. No refusal at any step. Behind that:
 *
 *   * no shipped role held a single `subcontracts.*` permission — all 20 routes were reachable only
 *     through r-admin's global wildcard, while the Commercial Manager / QS role, whose description
 *     says it "governs estimates, quotations, contracts, variations, CLAIMS and payment
 *     applications", could not raise, certify or pay one;
 *   * `certifyClaim` asserted `finance.invoice.approve` — a FINANCE permission, for a
 *     quantity-surveying judgement about work done on site — and `approveVariation` asserted
 *     `projects.project.update`. Both were unreachable anyway: the route guard refused those roles
 *     before the service could check;
 *   * certifying twice returned 200 and silently re-stamped `certifiedAt`/`certifiedBy`;
 *   * payment recorded nobody on the row;
 *   * and a claim of 250,000 against a 100,000 subcontract certified for 225,000 net.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

describe('subcontractor claims — authority', () => {
  it('declares a permission on every act, and the three acts are three names', () => {
    const p = SubcontractsController.prototype;
    expect(declared(p.createClaim)).toEqual(['subcontracts.claim.create']);
    expect(declared(p.certifyClaim)).toEqual(['subcontracts.claim.certify']);
    expect(declared(p.payClaim)).toEqual(['subcontracts.claim.pay']);
    expect(declared(p.createVariation)).toEqual(['subcontracts.variation.create']);
    expect(declared(p.approveVariation)).toEqual(['subcontracts.variation.approve']);
    expect(declared(p.rejectVariation)).toEqual(['subcontracts.variation.approve']);
    expect(declared(p.createSubcontract)).toEqual(['subcontracts.subcontract.create']);
    expect(declared(p.changeStatus)).toEqual(['subcontracts.subcontract.status']);
  });

  it('splits raise, certify and pay across three different jobs', () => {
    // RAISE — the Project Manager says the work was done on their project.
    expect(names('r-pm', 'subcontracts.claim.create')).toBe(true);
    expect(holds('r-pm', 'subcontracts.claim.certify')).toBe(false);
    expect(holds('r-pm', 'subcontracts.claim.pay')).toBe(false);

    // CERTIFY — Commercial / QS accepts the account of the work. It may also raise, so the domain
    // rule below is what stops one person doing both; the role split is not the only control.
    expect(names('r-commercial-manager', 'subcontracts.claim.certify')).toBe(true);
    expect(holds('r-commercial-manager', 'subcontracts.claim.pay')).toBe(false);

    // PAY — Finance releases the money and certifies nothing.
    expect(names('r-finance', 'subcontracts.claim.pay')).toBe(true);
    expect(holds('r-finance', 'subcontracts.claim.certify')).toBe(false);
    expect(holds('r-finance', 'subcontracts.claim.create')).toBe(false);
  });

  it('keeps the variation decision with the role that owns the commercial position', () => {
    // Approving a variation ADDS its signed amount to the subcontract value, which is the ceiling
    // every certification is measured against. Whoever can approve one can raise the ceiling.
    expect(names('r-commercial-manager', 'subcontracts.variation.approve')).toBe(true);
    expect(names('r-pm', 'subcontracts.variation.create')).toBe(true);
    expect(holds('r-pm', 'subcontracts.variation.approve')).toBe(false);
  });

  it('no longer requires a finance or projects permission to certify subcontractor work', () => {
    // The two wrong-authority assertions are gone from the service. This asserts the CONSEQUENCE:
    // the roles that held those permissions are not thereby able to certify.
    expect(holds('r-finance', 'finance.invoice.approve')).toBe(true);      // still holds it
    expect(holds('r-finance', 'subcontracts.claim.certify')).toBe(false);  // and still cannot certify
    expect(holds('r-pm', 'projects.project.update')).toBe(true);
    expect(holds('r-pm', 'subcontracts.variation.approve')).toBe(false);
  });
});

describe('subcontractor claims — the certification state machine', () => {
  const claim = (over: Partial<Claim> = {}): Claim => ({
    id: 'c-1', tenantId: 't-1', subcontractId: 's-1', claimNumber: 1, status: 'draft',
    workCompletedValue: 100_000, previouslyCertifiedValue: 0, thisPeriodGrossValue: 100_000,
    retentionWithheld: 10_000, netCertifiedValue: 90_000, isRetentionRelease: false, retentionReleased: 0,
    certifiedAt: null, certifiedBy: null, createdBy: 'u-pm', paidBy: null, paidAt: null,
    createdAt: '2026-09-01T00:00:00.000Z', ...over,
  });
  const certified = claim({ status: 'certified', certifiedAt: '2026-09-02T00:00:00.000Z', certifiedBy: 'u-qs' });

  it('certifies a claim raised by somebody else', () => {
    const c = certifyClaim(claim(), 'u-qs', 500_000);
    expect(c.status).toBe('certified');
    expect(c.certifiedBy).toBe('u-qs');
    expect(c.createdBy).toBe('u-pm');
    expect(certificationSeparation(c)).toBe('enforced');
  });

  it('refuses the person who raised it — 403, the actor is wrong and nothing else', () => {
    expect(() => certifyClaim(claim({ createdBy: 'u-qs' }), 'u-qs', 500_000))
      .toThrow(/may not certify their own application/);
    expect(classifyDomainMessage('the person who raised this claim may not certify their own application — a certificate is somebody else accepting the account of the work'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('refuses a SECOND certification instead of silently re-stamping it', () => {
    // The finding: certifying twice returned 200 with a fresh timestamp and the first certification
    // was gone. No generations here — the claim model is already cumulative, so the correction is the
    // next claim, and a second mechanism for one fact is what this programme keeps removing.
    expect(() => certifyClaim(certified, 'u-qs2', 500_000)).toThrow(/already certified/);
    expect(() => certifyClaim(claim({ status: 'paid' }), 'u-qs2', 500_000)).toThrow(/already certified/);
    expect(classifyDomainMessage('claim #X is already certified — correct it with the next claim, which carries the cumulative position').status).toBe(409);
  });

  it('refuses over-certification against the value the subcontract actually carries', () => {
    // 250,000 claimed against a 100,000 subcontract certified for 225,000 net before this existed.
    // The ceiling is the subcontract's OWN value — approving a variation already adds its signed
    // amount to it — so no valuation is invented here.
    expect(() => certifyClaim(claim({ workCompletedValue: 250_000 }), 'u-qs', 100_000))
      .toThrow(/would take this subcontract past its authorised value/);
    // Exactly at the value is allowed: the ceiling is a ceiling, not a margin.
    expect(certifyClaim(claim({ workCompletedValue: 100_000 }), 'u-qs', 100_000).status).toBe('certified');
    expect(classifyDomainMessage('certifying X would take this subcontract past its authorised value of X — instruct a variation, which is what raises it'))
      .toEqual({ status: 409, code: 'CONFLICT' });
  });

  it('measures a retention release against what was already certified, not against new work', () => {
    // A release moves no work value, so measuring its zero gross against the ceiling would be a
    // different question from the one being asked.
    const release = claim({ isRetentionRelease: true, workCompletedValue: 0, previouslyCertifiedValue: 100_000, netCertifiedValue: 10_000 });
    expect(certifyClaim(release, 'u-qs', 100_000).status).toBe('certified');
    expect(() => certifyClaim({ ...release, previouslyCertifiedValue: 150_000 }, 'u-qs', 100_000))
      .toThrow(/would take this subcontract past its authorised value/);
  });

  it('refuses the certifier the payment — certifying and paying are two signatures', () => {
    expect(() => payClaim(certified, 'u-qs')).toThrow(/may not release their own certificate/);
    const paid = payClaim(certified, 'u-finance');
    expect(paid.status).toBe('paid');
    expect(paid.paidBy).toBe('u-finance');
    expect(paid.paidAt).not.toBeNull();
    expect(classifyDomainMessage('the person who certified this claim may not release their own certificate for payment — certifying and paying are two signatures'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('will not pay what was never certified', () => {
    expect(() => payClaim(claim(), 'u-finance')).toThrow(/Only certified claims can be marked as paid/);
  });

  it('says unverifiable only where the claim genuinely has no raiser', () => {
    const anonymous = certifyClaim(claim({ createdBy: null }), 'u-qs', 500_000);
    expect(certificationSeparation(anonymous)).toBe('unverifiable');
    expect(certificationSeparation(claim())).toBeNull(); // never certified — not a verdict at all
  });
});
