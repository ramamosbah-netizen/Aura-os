import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { mayReturnFromProject } from '@aura/inventory';

/**
 * RETURNABLE IS THE GOVERNED NET ISSUED POSITION — never the gross historical issue, and never a
 * missing position read as zero.
 *
 * This is a standing invariant rather than a slice's test, because of what breaking it costs. The
 * defect was found by probing the running system during `BUY-06`, and it is not in that capability's
 * frozen acceptance sentence at all: issue 20, return 50, and the BOQ item's position read
 *
 *   issued  −30     "we have sent minus thirty metres to site"
 *   onSite   30     the opposite sign, so a reader is told thirty metres ARE on site
 *   wastage −30     negative waste
 *
 * Nothing refused it. Progress, wastage and remaining-to-order all read from that position, so the
 * corruption is silent and spreads. A test that lives only inside the slice that happened to find it
 * would not stop the next author reintroducing it, which is why this is pinned here beside the other
 * architectural gates.
 *
 * Two properties, and the second is the one that is easy to lose:
 *
 *   NET, NOT GROSS — 20 issued and 5 returned leaves 15 that can come back, not 20. The measure is
 *   the position as it stands, not the history of what once went out.
 *
 *   NULL STAYS UNKNOWN — a position that could not be read is refused, never coerced to 0 and never
 *   waved through. Optional dependency, never optional evidence: the dependency on the quantity
 *   ledger is optional by construction (Inventory does not import Projects), so the tempting shape
 *   is "no reader bound, nothing to check, allow it". That is the one direction where being wrong
 *   corrupts the position with nobody noticing.
 */

const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('returnable is the governed net issued position', () => {
  it('refuses a return larger than what is currently out, measured on the NET', () => {
    // 20 went out and 5 came back, so 15 is the position — the gross 20 is not returnable.
    expect(mayReturnFromProject(15, 16).allowed).toBe(false);
    expect(mayReturnFromProject(15, 16).reason).toMatch(/only 15/);
    expect(mayReturnFromProject(15, 15).allowed).toBe(true);
    expect(mayReturnFromProject(15, 1).allowed).toBe(true);
  });

  it('refuses when nothing is issued, rather than letting a return create a negative position', () => {
    expect(mayReturnFromProject(0, 1).allowed).toBe(false);
    // Already negative from legacy data is not deepened either.
    expect(mayReturnFromProject(-30, 1).allowed).toBe(false);
  });

  it('treats an unreadable position as UNKNOWN and fails closed', () => {
    const verdict = mayReturnFromProject(null, 1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/could not be read|nobody could read|unavailable/);
    // Not zero, and not permission: a null must never behave like a readable balance of any size.
    expect(mayReturnFromProject(null, 0.0001).allowed).toBe(false);
    expect(mayReturnFromProject(null, Number.MAX_SAFE_INTEGER).allowed).toBe(false);
  });

  it('refuses before the balance is compared, so an unknown position cannot fall through to arithmetic', () => {
    const source = read('modules/inventory/src/domain/material-return.ts');
    const nullGuard = source.indexOf('netIssued === null');
    const firstComparison = source.search(/netIssued <= 0|quantity > netIssued/);
    expect(nullGuard, 'the null guard must exist').toBeGreaterThan(-1);
    expect(nullGuard).toBeLessThan(firstComparison);
  });

  it('is reached from the only write path, and an absent reader yields null rather than zero', () => {
    const service = read('modules/inventory/src/stock.service.ts');
    expect(service).toContain('mayReturnFromProject');

    // The whole point of the gate is that an UNBOUND port is indistinguishable from an unreadable
    // position — both are null, and null is refused. `: 0` here would silently permit every return
    // in any deployment that has not wired the ledger.
    const fallback = service.match(/this\.issuedPosition\s*\r?\n?\s*\?[\s\S]{0,200}?:\s*(null|0)/);
    expect(fallback, 'the issued-position read must have an explicit fallback').not.toBeNull();
    expect(fallback![1]).toBe('null');
  });

  it('never coerces a missing position into a number', () => {
    for (const path of [
      'modules/inventory/src/stock.service.ts',
      'modules/inventory/src/domain/material-return.ts',
      'modules/inventory/src/issued-position.port.ts',
      'apps/api/src/wiring/gates.module.ts',
    ]) {
      const source = read(path);
      // `netIssued ?? 0` / `netIssued || 0` is the exact shape that turns "we could not check" into
      // "there is none", which then reads as "nothing may be returned" or, worse, gets inverted.
      expect(source, path).not.toMatch(/netIssued\s*(\?\?|\|\|)\s*0/);
      expect(source, path).not.toMatch(/netIssued\s*(\?\?|\|\|)\s*Number/);
    }
  });

  it('keeps the position behind a port, so Inventory still does not import Projects', () => {
    const port = read('modules/inventory/src/issued-position.port.ts');
    expect(port).toContain('ISSUED_POSITION');
    expect(port).toMatch(/netIssued\(/);
    const service = read('modules/inventory/src/stock.service.ts');
    expect(service, 'Inventory must not import the quantity ledger directly').not.toMatch(
      /from '@aura\/projects'/,
    );
  });
});
