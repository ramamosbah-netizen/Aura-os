import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import { approveScope, makeSolutionScope } from '@aura/crm';
import { PreAwardController } from './pre-award.controller';

/**
 * J1-07 — "a scope author without approval can auto-approve during create", and what was actually
 * wrong underneath it.
 *
 * The literal create-time auto-approve was already gone. What remained was worse and invisible: none
 * of the eight pre-award discovery routes declared a permission, so `PermissionsGuard` derived one
 * from the path — `crm.opportunity.requirements`, `crm.opportunity.scopes`, `crm.opportunity.approve`,
 * `crm.opportunity.generate-quotation` — and NO SHIPPED ROLE NAMES ANY OF THEM. Run against the API
 * that meant: a wildcard holder wrote a scope, approved that same scope, and generated the customer
 * quotation from it; the Technical Manager, who holds `crm.scope.approve` precisely for this, was
 * refused on all three.
 *
 * Two layers have to hold, because either alone is defeatable:
 *   AUTHORITY  the route names the permission, and the roles that hold it are the right ones.
 *   DOMAIN     the author may not approve their own scope — which authority cannot enforce, since one
 *              person can legitimately hold both roles.
 */

const declared = (handler: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, handler as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
/** Does this role's vocabulary — wildcards included — authorise this permission? */
const holds = (roleId: string, permission: string) =>
  role(roleId).permissions.some((p) => permissionMatches(p, permission));
/** Does this role NAME it exactly? The SEC-01 distinction: a wildcard grants, it does not decide. */
const names = (roleId: string, permission: string) => role(roleId).permissions.includes(permission);

describe('J1-07 authority — every pre-award discovery route declares what governs it', () => {
  it('declares a permission on all eight routes, so none is left to path derivation', () => {
    const p = PreAwardController.prototype;
    expect(declared(p.addRequirement)).toEqual(['crm.requirement.create']);
    expect(declared(p.listRequirements)).toEqual(['crm.requirement.read']);
    expect(declared(p.updateRequirement)).toEqual(['crm.requirement.update']);
    expect(declared(p.createScope)).toEqual(['crm.scope.create']);
    expect(declared(p.listScopes)).toEqual(['crm.scope.read']);
    expect(declared(p.setScopeLines)).toEqual(['crm.scope.update']);
    expect(declared(p.approveScope)).toEqual(['crm.scope.approve']);
    expect(declared(p.generateQuotation)).toEqual(['crm.quotation.create']);
  });

  it('puts authorship and sign-off in different roles — the separation the routes now inherit', () => {
    // MAKER. Pre-Sales writes the scope and must not be able to sign it off.
    expect(names('r-pre-sales', 'crm.scope.create')).toBe(true);
    expect(names('r-pre-sales', 'crm.scope.update')).toBe(true);
    expect(holds('r-pre-sales', 'crm.scope.approve')).toBe(false);

    // CHECKER. The Technical Manager signs off and cannot author, so an approval is always somebody
    // else's act at the authority layer before the domain rule is ever consulted.
    expect(names('r-technical-manager', 'crm.scope.approve')).toBe(true);
    expect(holds('r-technical-manager', 'crm.scope.create')).toBe(false);
    expect(holds('r-technical-manager', 'crm.scope.update')).toBe(false);

    // …and can read what it is being asked to approve. It could not, before this.
    expect(holds('r-technical-manager', 'crm.scope.read')).toBe(true);
    expect(holds('r-technical-manager', 'crm.requirement.read')).toBe(true);

    // THE OFFER is a third act. Neither the author nor the approver can turn a signed-off scope into
    // a customer-facing quotation; that stays with the roles that own customer pricing.
    expect(holds('r-pre-sales', 'crm.quotation.create')).toBe(false);
    expect(holds('r-technical-manager', 'crm.quotation.create')).toBe(false);
    expect(names('r-sales', 'crm.quotation.create')).toBe(true);
    expect(names('r-estimator', 'crm.quotation.create')).toBe(true);
  });

  it('gives requirement capture to the role that has the customer conversation', () => {
    // The authority change J1-07 makes, asserted rather than described. Before: the capture routes
    // derived `crm.opportunity.requirements`, which r-sales does not hold, so the role that "owns
    // enquiries, leads, opportunities, follow-ups" could not record the enquiry — only a wildcard
    // holder could.
    expect(names('r-sales', 'crm.requirement.create')).toBe(true);
    expect(names('r-sales', 'crm.requirement.update')).toBe(true);
    expect(holds('r-sales', 'crm.opportunity.requirements')).toBe(false); // the old derived name: still nobody's

    // Pre-Sales reads them (Scope Assist grounds proposed lines on them) and does not capture them.
    expect(names('r-pre-sales', 'crm.requirement.read')).toBe(true);
    expect(holds('r-pre-sales', 'crm.requirement.create')).toBe(false);
  });
});

describe('J1-07 domain — the author may not approve their own scope', () => {
  const scopeBy = (author: string | null) =>
    makeSolutionScope({
      tenantId: 't-1', opportunityId: 'o-1', title: 'ELV package',
      createdBy: author,
      lines: [{ description: 'CCTV head-end', quantity: 1, unitPrice: 1000 }],
    });

  it('refuses the author, and the refusal is a 403 — the actor is wrong, not the request', () => {
    const scope = scopeBy('u-pre-sales');
    expect(() => approveScope(scope, 'u-pre-sales')).toThrow(/may not approve their own work/);

    // 403 and not 400: a DIFFERENT person can perform this act right now with nothing else changing,
    // so telling the caller to fix their request would be advice they cannot follow.
    let message = '';
    try { approveScope(scope, 'u-pre-sales'); } catch (e) { message = (e as Error).message; }
    expect(classifyDomainMessage(message)).toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('allows a second person, and records that the separation was actually checked', () => {
    const approved = approveScope(scopeBy('u-pre-sales'), 'u-technical-manager');
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('u-technical-manager');
    expect(approved.createdBy).toBe('u-pre-sales');
    // The row says the control ran. A screen reading `approved` alone cannot tell this apart from
    // the case below, which is the whole reason it is stored.
    expect(approved.separationOfDuties).toBe('enforced');
  });

  it('says "unverifiable" — never "enforced" — when the scope predates authorship being recorded', () => {
    // Legacy rows carry no author and are deliberately not backfilled: inferring one from the
    // approver would manufacture an authorship fact that never happened. Refusing them would block
    // real work over something nobody wrote down at the time. So the approval proceeds and admits
    // the check could not run, which keeps the exception countable and draining.
    const approved = approveScope(scopeBy(null), 'u-anyone');
    expect(approved.status).toBe('approved');
    expect(approved.separationOfDuties).toBe('unverifiable');
  });

  it('records the author at creation, so the rule has something to compare against', () => {
    expect(scopeBy('u-pre-sales').createdBy).toBe('u-pre-sales');
    expect(scopeBy('u-pre-sales').separationOfDuties).toBeNull(); // nothing approved yet
  });

  it('still refuses a self-approval that arrives after the scope was edited', () => {
    // `setScopeLines` re-saves the whole record; if authorship were re-derived from the writer, the
    // author could edit their own scope and become "somebody else". The store never updates
    // created_by on conflict for exactly this reason; here the domain object proves the same shape.
    const edited = { ...scopeBy('u-pre-sales'), updatedAt: new Date().toISOString() };
    expect(() => approveScope(edited, 'u-pre-sales')).toThrow(/may not approve their own work/);
  });
});
