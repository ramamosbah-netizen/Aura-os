import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import {
  activateAgreement, activationSeparation, sendRfq, terminateAgreement,
  type FrameworkAgreement, type Rfq,
} from '@aura/procurement';
import { FrameworkAgreementsController } from './framework-agreements.controller';
import { ProcurementController } from './procurement.controller';

/**
 * PROCUREMENT COMMITMENTS — SEC-01 stage 3, wave A.
 *
 * Measured against the running API. The Buyer held `procurement.*.read`, `procurement.*.create` and
 * `procurement.*.update` — three MIDDLE WILDCARDS, which define authority by the SHAPE OF THE VERB
 * rather than by what the act is. So the Buyer could create anything in the module and could not
 * perform a single act whose verb was something else:
 *
 *   403  PATCH procurement/rfqs/:id/send                        sending the enquiry IS the job
 *   403  POST  procurement/framework-agreements/:id/activate
 *   403  POST  procurement/framework-agreements/:id/call-offs   routine drawdown
 *
 * The Procurement Manager held `procurement.*`, covering both the routine work and the acts that
 * commit the business. No role NAMED any of them.
 *
 * And both framework transitions wrote `actorId: null`, because `activate(id)` and `terminate(id)`
 * took no actor — the third table in this wave with that shape. `send` had no state guard at all:
 * re-sending re-stamped the status and emitted a second event.
 *
 * NOT TOUCHED: the sourcing decision. SUP-13 and SUP-14 are closed to new scope and ADR-0022 fixes
 * what each of those four acts may do.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

describe('procurement commitments — authority', () => {
  it('declares a permission on every framework act, and activation is its own name', () => {
    const p = FrameworkAgreementsController.prototype;
    expect(declared(p.create)).toEqual(['procurement.framework-agreement.create']);
    expect(declared(p.activate)).toEqual(['procurement.framework-agreement.activate']);
    expect(declared(p.terminate)).toEqual(['procurement.framework-agreement.terminate']);
    expect(declared(p.callOff)).toEqual(['procurement.framework-agreement.call-offs']);
    expect(declared(ProcurementController.prototype.sendRfq)).toEqual(['procurement.rfq.send']);
  });

  it('no longer defines the Buyer by the shape of the verb', () => {
    // THE THREE MIDDLE WILDCARDS ARE GONE. This is the assertion that makes the rest mean anything:
    // `procurement.*.create` granted every create in the module and no send, no activate, no call-off.
    expect(role('r-procurement').permissions.filter((p) => /^procurement\.\*/.test(p))).toEqual([]);

    // The enquiry cycle, by name — including the act the Buyer was refused.
    for (const p of [
      'procurement.rfq.create', 'procurement.rfq.send', 'procurement.rfq.quotes',
      'procurement.purchase-request.create', 'procurement.supplier.create',
      'procurement.framework-agreement.create', 'procurement.framework-agreement.call-offs',
    ]) {
      expect(names('r-procurement', p), `the Buyer must name ${p}`).toBe(true);
    }
  });

  it('keeps the acts that commit or end a standing commitment with the manager', () => {
    for (const p of [
      'procurement.framework-agreement.activate', 'procurement.framework-agreement.terminate',
      'procurement.supplier.status',
    ]) {
      expect(holds('r-procurement', p), `the Buyer must NOT hold ${p}`).toBe(false);
      expect(names('r-procurement-manager', p), `the manager must name ${p}`).toBe(true);
    }
    // …and the manager no longer carries the module wildcard that covered everything at once.
    expect(role('r-procurement-manager').permissions).not.toContain('procurement.*');
    // The purchase-order lifecycle it already owned survives the enumeration. `finance.invoice.approve`
    // was nearly lost the same way, which is why this is asserted rather than assumed.
    for (const p of ['procurement.po.approve', 'procurement.po.issue', 'procurement.po.cancel', 'procurement.po.close', 'procurement.pr.approve']) {
      expect(holds('r-procurement-manager', p), `the manager must still hold ${p}`).toBe(true);
    }
  });
});

describe('procurement commitments — the state machine', () => {
  const fa = (over: Partial<FrameworkAgreement> = {}): FrameworkAgreement => ({
    id: 'fa-1', tenantId: 't-1', companyId: null, reference: 'FA-1', title: 'Cable rate card 2026',
    supplierId: 's-1', supplierName: 'Gulf Cables LLC', status: 'draft',
    validFrom: '2026-01-01', validTo: '2026-12-31', ceilingValue: 1_000_000, calledOffValue: 0,
    items: [], notes: null, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u-buyer',
    activatedBy: null, activatedAt: null, terminatedBy: null, terminatedAt: null, ...over,
  });
  const rfq = (over: Partial<Rfq> = {}): Rfq => ({
    id: 'r-1', tenantId: 't-1', companyId: null, reference: 'RFQ-1', title: 'Cables',
    prId: null, prTitle: null, status: 'draft', dueDate: null, ownerId: null,
    createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u-buyer', sentBy: null, sentAt: null, ...over,
  });

  it('records who put the ceiling in force', () => {
    const active = activateAgreement(fa(), 'u-procmgr');
    expect(active.status).toBe('active');
    expect(active.activatedBy).toBe('u-procmgr');
    expect(active.activatedAt).not.toBeNull();
    expect(activationSeparation(active)).toBe('enforced');
  });

  it('refuses the person who negotiated it — 403, the actor is wrong and nothing else', () => {
    expect(() => activateAgreement(fa({ createdBy: 'u-procmgr' }), 'u-procmgr'))
      .toThrow(/may not activate their own/);
    expect(classifyDomainMessage('the person who created this framework agreement may not activate their own — putting a ceiling in force is a second signature'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('records who ended it, and does NOT invent a second signature for that', () => {
    // Terminating stops future drawdown — protective, not a commitment. Requiring a different person
    // would be inventing a control nobody asked for; recording who did it is what was missing.
    const ended = terminateAgreement(activateAgreement(fa(), 'u-procmgr'), 'u-procmgr');
    expect(ended).toMatchObject({ status: 'terminated', terminatedBy: 'u-procmgr', activatedBy: 'u-procmgr' });
    expect(() => terminateAgreement(ended, 'u-other')).toThrow(/already terminated/);
  });

  it('will not send the same enquiry twice', () => {
    // `send` had no state guard: re-sending re-set the status and emitted a second `rfqSent`, so an
    // RFQ could be "sent" any number of times with no record of which one suppliers answered.
    const sent = sendRfq(rfq(), 'u-buyer');
    expect(sent).toMatchObject({ status: 'sent', sentBy: 'u-buyer' });
    expect(sent.sentAt).not.toBeNull();
    expect(() => sendRfq(sent, 'u-buyer')).toThrow(/only a draft RFQ can be sent/);
    expect(classifyDomainMessage('only a draft RFQ can be sent (status X)').status).toBe(409);
  });

  it('says unverifiable only where the agreement genuinely has no creator', () => {
    expect(activationSeparation(activateAgreement(fa({ createdBy: null }), 'u-procmgr'))).toBe('unverifiable');
    expect(activationSeparation(fa())).toBeNull(); // never activated — not a verdict at all
  });
});
