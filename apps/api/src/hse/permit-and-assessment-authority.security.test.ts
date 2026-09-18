import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import { approveRiskAssessment, assessmentSeparation, type RiskAssessment } from '@aura/hse';
import { HseController } from './hse.controller';

/**
 * HSE — SEC-01 stage 3, wave B, and the only wave where the consequence is safety rather than money.
 *
 * A PERMIT TO WORK is already a well-built record. It holds `requestedBy` separately from `createdBy`
 * precisely so segregation of duties is checkable, the service refuses the requester their own
 * approval, and it will not approve at all until the permit's RISK ASSESSMENT is approved. Measured
 * against the running API, that refusal fires: 409, "a permit can only be approved by someone other
 * than the requester".
 *
 * TWO THINGS MADE THAT LESS THAN IT LOOKED.
 *
 * 1. THE DOCUMENT THE GATE DEPENDS ON HAD NO SIGNATURE. `approveRiskAssessment(ra)` took no actor,
 *    asserted no permission, recorded nothing, and let the assessor approve their own work. Measured
 *    as one officer: `201 POST risk-assessments createdBy=u-e2e-hse` then
 *    `200 PUT :id/approve approvedBy=(NOT RECORDED)`. A chain of controls is as strong as its weakest
 *    link and this was the weakest by a distance.
 *
 * 2. ONLY ONE ROLE COULD REQUEST. `hse.*` sat on r-hse and nobody else held a single HSE write
 *    permission — the Site Engineer who has to do the hot work held `hse.*.read` and was refused the
 *    request (403, measured). So every permit was requested and authorised inside the HSE function,
 *    and the two-person rule separated two officers rather than the worker from the authoriser.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

describe('HSE — authority', () => {
  it('declares a permission on every safety act', () => {
    const p = HseController.prototype;
    expect(declared(p.approvePermit)).toEqual(['hse.ptw.approve']);
    // `requestPermit` CREATES the permit; `requestPermitApproval` is the transition that asks for
    // authorisation. Two acts, two names — the handler names read the other way round, which is
    // worth knowing when reading this file.
    expect(declared(p.requestPermit)).toEqual(['hse.ptw.create']);
    expect(declared(p.requestPermitApproval)).toEqual(['hse.ptw.request']);
    expect(declared(p.closePermit)).toEqual(['hse.ptw.close']);
    expect(declared(p.approveRiskAssessment)).toEqual(['hse.risk-assessment.approve']);
    expect(declared(p.completeCapa)).toEqual(['hse.capa.complete']);
    expect(declared(p.closeIncident)).toEqual(['hse.incident.close']);
  });

  it('lets the people who do the work raise an incident and ask for a permit', () => {
    // THE POINT OF THIS WAVE. With only HSE able to request, the permit's two-person rule separated
    // two officers; with the site able to request, it separates the worker from the authoriser.
    for (const p of ['hse.incident.create', 'hse.ptw.create', 'hse.ptw.request']) {
      expect(names('r-site-engineer', p), `the Site Engineer must name ${p}`).toBe(true);
    }
    // …and authorises nothing.
    for (const p of ['hse.ptw.approve', 'hse.ptw.close', 'hse.risk-assessment.approve', 'hse.incident.close', 'hse.capa.complete']) {
      expect(holds('r-site-engineer', p), `the Site Engineer must NOT hold ${p}`).toBe(false);
    }
  });

  it('keeps the authorisations with HSE, and drops the module wildcard', () => {
    expect(role('r-hse').permissions).not.toContain('hse.*');
    for (const p of [
      'hse.ptw.approve', 'hse.ptw.close', 'hse.ptw.reopen', 'hse.ptw.expire',
      'hse.incident.close', 'hse.incident.reopen', 'hse.capa.complete', 'hse.risk-assessment.approve',
    ]) {
      expect(names('r-hse', p), `HSE must name ${p}`).toBe(true);
    }
    // HSE can still do the site-side acts too — an officer raises incidents and permits as well.
    expect(holds('r-hse', 'hse.ptw.request')).toBe(true);
  });
});

describe('HSE — the assessor does not approve their own risk assessment', () => {
  const ra = (over: Partial<RiskAssessment> = {}): RiskAssessment => ({
    id: 'ra-1', tenantId: 't-1', companyId: null, projectId: 'p-1', projectName: null,
    reference: 'RA-001', activity: 'hot work', assessor: 'A. Haddad',
    hazards: [{ hazard: 'fire', likelihood: 3, severity: 4, controls: 'extinguisher', residualLikelihood: 1, residualSeverity: 2 }],
    initialScore: 12, residualScore: 2, residualBand: 'low', status: 'draft', reviewDate: null,
    approvedBy: null, approvedAt: null, createdBy: 'u-hse-1',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...over,
  });

  it('records who approved it — the act recorded nobody at all', () => {
    const approved = approveRiskAssessment(ra(), 'u-hse-2');
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('u-hse-2');
    expect(approved.approvedAt).not.toBeNull();
    expect(assessmentSeparation(approved)).toBe('enforced');
  });

  it('refuses the author — 403, the actor is wrong and nothing else', () => {
    expect(() => approveRiskAssessment(ra(), 'u-hse-1')).toThrow(/may not approve their own/);
    expect(classifyDomainMessage('the person who wrote this risk assessment may not approve their own — it is what authorises a permit to work'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('refuses a second approval', () => {
    const approved = approveRiskAssessment(ra(), 'u-hse-2');
    expect(() => approveRiskAssessment(approved, 'u-hse-3')).toThrow(/already approved/);
    expect(classifyDomainMessage('this risk assessment is already approved').status).toBe(409);
  });

  it('says unverifiable where the assessment has no recorded author', () => {
    // Written before authorship existed. The approval proceeds and says the check could not run,
    // rather than blocking safety-critical work over a fact nobody wrote down at the time.
    const approved = approveRiskAssessment(ra({ createdBy: null }), 'u-hse-2');
    expect(approved.status).toBe('approved');
    expect(assessmentSeparation(approved)).toBe('unverifiable');
    expect(assessmentSeparation(ra())).toBeNull(); // never approved — not a verdict at all
  });
});
