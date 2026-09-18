import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PurchaseOrderService } from './purchase-order.service';

/**
 * J3-01's standing guard: A GENERIC MUTATION PATH MUST NEVER OWN A GOVERNED LIFECYCLE TRANSITION.
 *
 * The finding was recorded as "an update-only actor can set status=approved", and that string had
 * been refused for a long time while the record stayed open. It stayed open because refusing one
 * value in a list left the shape untouched: `PATCH /purchase-orders/:id/status`, carrying
 * `procurement.po.update`, accepting `draft`, `issued`, `closed` and `cancelled`. Executed against
 * the running API, a Buyer holding only update could still issue an order to a supplier, cancel a
 * Director-approved order of 90,000 — reversing its committed cost in the ledger — and close one.
 *
 * So this guards the shape rather than the string. The temptation it exists to defeat is real and
 * specific: adding one more status to that list is a one-line diff that looks like a small
 * convenience, and it silently re-opens every hole the commands were built to close.
 */

const SRC = __dirname;

function sourceWithoutComments(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no generic path owns a purchase order lifecycle transition', () => {
  const service = () => sourceWithoutComments(path.join(SRC, 'purchase-order.service.ts'));

  it('the generic status method writes nothing at all', () => {
    const s = service();
    const body = s.slice(s.indexOf('async changeStatus'), s.indexOf('async issue'));
    expect(body, 'changeStatus must refuse, not transition').toContain('throw new Error');
    for (const banned of ['this.transition(', 'this.store.update', 'appendWithClient']) {
      expect(body, `changeStatus must not ${banned}`).not.toContain(banned);
    }
    // And the list of statuses it used to wave through is gone, not shortened.
    expect(body).not.toMatch(/\[\s*'draft'\s*,\s*'issued'/);
  });

  it('each act exists as its own command', () => {
    for (const command of ['submitForApproval', 'approve', 'issue', 'cancel', 'close']) {
      expect(PurchaseOrderService.prototype, `${command} must be its own command`).toHaveProperty(command);
    }
  });

  it('issuing is reachable only from approved, and asks the domain rather than deciding itself', () => {
    const s = service();
    const body = s.slice(s.indexOf('async issue'), s.indexOf('async cancel'));
    expect(body).toContain('issuability(existing)');
    // The old inline gate — "if it is under the threshold, issue it anyway" — must not come back.
    expect(body, 'the threshold decides WHO approves, not WHETHER approval happens')
      .not.toContain('autoApproved');
  });

  it('cancelling reverses only what is cancellable, and records why', () => {
    const s = service();
    const body = s.slice(s.indexOf('async cancel'), s.indexOf('async close'));
    expect(body).toContain('cancellationPosition(');
    expect(body).toContain('assertApprovalAuthority');
    // The event carries the CANCELLABLE figure. Carrying `value` alone is what made the ledger
    // reverse a whole commitment on a part-delivered order.
    expect(body).toContain('cancelledValue: verdict.cancellable');
    expect(body).toContain('cancellationReason');
  });

  it('closing asks its own question and never borrows the approval authority', () => {
    const s = service();
    const body = s.slice(s.indexOf('async close'), s.indexOf('private async position'));
    expect(body).toContain('closureReadiness(');
    expect(body, 'closing is operational completion, not the undoing of a commitment')
      .not.toContain('assertApprovalAuthority');
  });

  it('a position that cannot be read refuses, rather than reading as "nothing has happened"', () => {
    const s = service();
    const body = s.slice(s.indexOf('private async position'));
    expect(body).toContain('known');
    expect(body, 'zero would make every order look freely cancellable exactly when the system is blind')
      .toContain('throw new Error');
  });

  it('the HTTP surface gives every act its own permission', () => {
    const controller = path.resolve(SRC, '..', '..', '..', 'apps', 'api', 'src', 'procurement', 'procurement.controller.ts');
    const s = sourceWithoutComments(controller);
    for (const permission of ['procurement.po.issue', 'procurement.po.cancel', 'procurement.po.close']) {
      expect(s, `${permission} must govern its own route`).toContain(permission);
    }
    // The generic route still exists so a stale caller is told where the acts went — and does nothing.
    expect(s).toMatch(/changePoStatus\(\)\s*:\s*never/);
    expect(s, 'the generic route must not reach the service').not.toMatch(/pos\.changeStatus\(/);
  });

  it('the Buyer holds none of the three', () => {
    // Not a test of a role's contents for their own sake: the Buyer's description has always said
    // "prepares purchase orders without approving their own order", and until each act had its own
    // permission that sentence was not true.
    const roles = sourceWithoutComments(
      path.resolve(SRC, '..', '..', '..', 'core', 'src', 'identity', 'standard-elv-roles.ts'),
    );
    const buyer = roles.slice(roles.indexOf("id: 'r-procurement'"), roles.indexOf("id: 'r-procurement-manager'"));
    for (const permission of ['procurement.po.issue', 'procurement.po.cancel', 'procurement.po.close']) {
      expect(buyer, `the Buyer must not hold ${permission}`).not.toContain(permission);
    }
    expect(buyer, 'and still prepares orders').toContain('procurement.po.submit');
  });
});
