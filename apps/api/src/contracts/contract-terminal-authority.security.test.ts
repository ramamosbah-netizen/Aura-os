import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { ContractsController } from './contracts.controller';

/**
 * CONTRACTS — SEC-01 stage 3, wave A, and the last item in it.
 *
 * `contracts.*` on the Commercial Manager covered the day-to-day — clauses, revisions, negotiation,
 * amendments, obligations — and also COMPLETING a contract, CANCELLING one, DISPATCHING a revision to
 * the client, and moving a payment certificate's status. No role named any of them.
 *
 * And the two governed TERMINAL COMMANDS wrapped every failure in `BadRequestException`, which is
 * exactly what the comment on the generic `changeStatus` handler three handlers above argues against,
 * in its own words: "Wrapping every domain error as BadRequest would turn SoD/approval denials into
 * misleading validation failures." The generic route had learned that; the two more consequential
 * paths had not, so a separation-of-duties refusal on the terminal command was the one that read as
 * bad input.
 *
 * As with tendering, NO NEW SEPARATION IS INVENTED: the Commercial Manager is the contracts authority
 * and no second role in the catalogue has a claim on any of these acts. What changes is that holding
 * them is a decision rather than a side effect of the module, and that adding one will be too.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

describe('contracts — the terminal commands are named', () => {
  it('declares a permission on completing and cancelling a contract', () => {
    const p = ContractsController.prototype;
    expect(declared(p.complete)).toEqual(['contracts.contract.complete']);
    expect(declared(p.cancel)).toEqual(['contracts.contract.cancel']);
    expect(declared(p.changeStatus)).toEqual(['contracts.contract.status']);
  });

  it('no longer grants every contracts act by the module it lives in', () => {
    expect(role('r-commercial-manager').permissions).not.toContain('contracts.*');
    for (const p of [
      'contracts.contract.complete', 'contracts.contract.cancel', 'contracts.contract.dispatch',
      'contracts.certificate.status', 'contracts.contract.status',
    ]) {
      expect(names('r-commercial-manager', p), `the Commercial Manager must name ${p}`).toBe(true);
    }
    // …and keeps the day-to-day it was already doing.
    for (const p of [
      'contracts.contract.update', 'contracts.contract.revisions', 'contracts.contract.negotiation',
      'contracts.clause.update', 'contracts.obligation.status', 'contracts.bond.status',
      'contracts.contract.sign', 'contracts.ipc.create', 'contracts.ipc.certify',
    ]) {
      expect(holds('r-commercial-manager', p), `the Commercial Manager must still hold ${p}`).toBe(true);
    }
  });

  it('keeps the terminal commands out of the roles that only read contracts', () => {
    for (const roleId of ['r-sales', 'r-sales-manager', 'r-pm', 'r-finance', 'r-finance-controller', 'r-executive', 'r-client']) {
      for (const p of ['contracts.contract.complete', 'contracts.contract.cancel']) {
        expect(holds(roleId, p), `${roleId} must not hold ${p}`).toBe(false);
      }
    }
    // The two roles that DO act on contracts keep exactly what they had: the Sales Manager creates
    // one from a won tender, the PM raises payment certificates, Finance certifies them.
    expect(holds('r-sales-manager', 'contracts.contract.create')).toBe(true);
    expect(holds('r-pm', 'contracts.certificate.create')).toBe(true);
    expect(holds('r-finance', 'contracts.certificate.certify')).toBe(true);
  });

  it('leaves no try/catch that would flatten a refusal on either terminal command', () => {
    // The finding, asserted against the source rather than described: both handlers now let the
    // global taxonomy classify, as the generic status route already did.
    const src = readFileSync(resolve(__dirname, 'contracts.controller.ts'), 'utf8');
    const complete = src.slice(src.indexOf("@Post(':id/complete')"), src.indexOf("@Get()"));
    expect(complete).not.toMatch(/BadRequestException\(e instanceof Error/);
    expect(complete).toMatch(/@Permissions\('contracts\.contract\.complete'\)/);
    expect(complete).toMatch(/@Permissions\('contracts\.contract\.cancel'\)/);
  });
});
