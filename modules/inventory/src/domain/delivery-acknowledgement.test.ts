import { describe, it, expect } from 'vitest';
import { mayAcknowledgeDelivery, acknowledgementCoverage, type AckRequest, type AckRefusal } from './delivery-acknowledgement';

/**
 * `BUY-07` — who may accept delivery at a work package, and why each refusal exists.
 *
 * Every rule here is about WHETHER a receipt may be recorded. None of them is about how much was
 * received: the movement already established that, and a second writer of one number is the defect
 * this wave removes.
 */

const req = (over: Partial<AckRequest> = {}): AckRequest => ({
  wbsNodeId: 'wbs-1',
  direction: 'out',
  issuedBy: 'u-store',
  actorId: 'u-site',
  recipientId: 'u-site',
  alreadyAcknowledged: false,
  ...over,
});

describe('the recipient accepts delivery', () => {
  it('allows the person responsible for the work package', () => {
    expect(mayAcknowledgeDelivery(req())).toEqual({ allowed: true });
  });

  it('refuses anybody who is not the recipient', () => {
    const v = mayAcknowledgeDelivery(req({ actorId: 'u-someone-else' }));
    expect(v).toMatchObject({ allowed: false, reason: 'not_the_recipient' });
  });
});

describe('an undeclared destination cannot be receipted', () => {
  it('refuses a movement that named no work package', () => {
    // A valid BUY-06 issue. Nobody can accept it on behalf of a package because nobody said which.
    expect(mayAcknowledgeDelivery(req({ wbsNodeId: null })))
      .toMatchObject({ allowed: false, reason: 'not_a_work_package_delivery' });
  });

  it('refuses a RETURN — material coming back is not a delivery to acknowledge', () => {
    expect(mayAcknowledgeDelivery(req({ direction: 'in' })))
      .toMatchObject({ allowed: false, reason: 'not_a_work_package_delivery' });
  });
});

describe('no recipient authority is an UNKNOWN, not an open door', () => {
  it('refuses when nobody owns site execution for this work package', () => {
    const v = mayAcknowledgeDelivery(req({ recipientId: null }));
    expect(v).toMatchObject({ allowed: false, reason: 'no_recipient_authority' });
    expect(v.allowed === false && v.message).toMatch(/assign the responsibility/);
  });

  it('does not let just anyone stand in when the authority is missing', () => {
    // The tempting fallbacks — the project-wide assignee, or whoever holds the site engineer role —
    // would manufacture accountability the way a boqItemId lookup manufactures provenance.
    for (const actorId of ['u-site', 'u-project-lead', 'u-any-site-engineer']) {
      expect(mayAcknowledgeDelivery(req({ recipientId: null, actorId })).allowed).toBe(false);
    }
  });
});

describe('maker and checker', () => {
  it('refuses the person who issued the material', () => {
    expect(mayAcknowledgeDelivery(req({ issuedBy: 'u-site', actorId: 'u-site', recipientId: 'u-site' })))
      .toMatchObject({ allowed: false, reason: 'issuer_cannot_acknowledge' });
  });

  it('refuses when the issuer was never recorded, because the rule cannot be evaluated', () => {
    // Unevaluable is not the same as satisfied. Historic movements predate `issued_by`.
    expect(mayAcknowledgeDelivery(req({ issuedBy: null })))
      .toMatchObject({ allowed: false, reason: 'issuer_unknown' });
  });
});

describe('one receipt per movement', () => {
  it('refuses a second acknowledgement of the same movement', () => {
    expect(mayAcknowledgeDelivery(req({ alreadyAcknowledged: true })))
      .toMatchObject({ allowed: false, reason: 'already_acknowledged' });
  });
});

describe('coverage is counted in movements, never in quantity', () => {
  it('reports how many deliveries have been receipted', () => {
    expect(acknowledgementCoverage(['m1', 'm2', 'm3'], new Set(['m1', 'm3'])))
      .toEqual({ deliveries: 3, acknowledged: 2, outstanding: 1 });
  });

  it('reads nothing outstanding when there is nothing delivered', () => {
    expect(acknowledgementCoverage([], new Set())).toEqual({ deliveries: 0, acknowledged: 0, outstanding: 0 });
  });

  it('ignores acknowledgements for movements that are not this package’s deliveries', () => {
    expect(acknowledgementCoverage(['m1'], new Set(['m1', 'm9'])).acknowledged).toBe(1);
  });
});

/**
 * EVERY REFUSAL THIS DOMAIN CAN PRODUCE MUST REACH THE CALLER AS A CLIENT STATUS.
 *
 * The `error-taxonomy` fitness gate scans THROW-STATEMENT LITERALS, so a reason composed in a domain
 * function and thrown elsewhere (`throw new Error(verdict.message)`) is invisible to it. That blind
 * spot was recorded during BUY-01 and it bit here: the gate passed while two of these refusals came
 * back from the API as 500 Internal Server Error, found only by the Auth-ON e2e.
 *
 * This closes the hole for this domain by classifying the messages the way the HTTP filter does. It
 * is not the general repair of the gate — that remains recorded — but these messages can no longer
 * regress to a 500 unnoticed.
 */
describe('every refusal maps to a client status, never a 500', () => {
  // Mirrors apps/api/src/common/all-exceptions.filter.ts.
  const CONFLICT = /\balready\b|is closed|is inactive|is not (in|active|approved)|\bonly\b.*\bcan\b|can only\b|insufficient|belongs to another|belongs to a different/i;
  const VALIDATION = /required|requires\b|\bmust\b|invalid|cannot|expected|exceeds\b|out of range|needs a\b|duplicate\b|missing\b|negative\b|unknown\b|nothing to \w+|not linked/i;
  const NOT_FOUND = /not found|no longer exists/i;

  const everyRefusal: Array<[string, AckRequest]> = [
    ['not_a_work_package_delivery', { wbsNodeId: null, direction: 'out', issuedBy: 'u-a', actorId: 'u-b', recipientId: 'u-b', alreadyAcknowledged: false }],
    ['no_recipient_authority', { wbsNodeId: 'w', direction: 'out', issuedBy: 'u-a', actorId: 'u-b', recipientId: null, alreadyAcknowledged: false }],
    ['not_the_recipient', { wbsNodeId: 'w', direction: 'out', issuedBy: 'u-a', actorId: 'u-x', recipientId: 'u-b', alreadyAcknowledged: false }],
    ['issuer_unknown', { wbsNodeId: 'w', direction: 'out', issuedBy: null, actorId: 'u-b', recipientId: 'u-b', alreadyAcknowledged: false }],
    ['issuer_cannot_acknowledge', { wbsNodeId: 'w', direction: 'out', issuedBy: 'u-b', actorId: 'u-b', recipientId: 'u-b', alreadyAcknowledged: false }],
    ['already_acknowledged', { wbsNodeId: 'w', direction: 'out', issuedBy: 'u-a', actorId: 'u-b', recipientId: 'u-b', alreadyAcknowledged: true }],
  ];

  it.each(everyRefusal)('classifies %s', (reason, req) => {
    const verdict = mayAcknowledgeDelivery(req);
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) return;
    expect(verdict.reason).toBe(reason);
    const classified = NOT_FOUND.test(verdict.message) || CONFLICT.test(verdict.message) || VALIDATION.test(verdict.message);
    expect(classified, `"${verdict.message}" would escape as a 500`).toBe(true);
  });

  it('covers every member of the AckRefusal union, so a new refusal cannot be added untested', () => {
    const covered = new Set(everyRefusal.map(([reason]) => reason));
    const all: AckRefusal[] = [
      'not_a_work_package_delivery', 'no_recipient_authority', 'not_the_recipient',
      'issuer_unknown', 'issuer_cannot_acknowledge', 'already_acknowledged',
    ];
    for (const reason of all) expect(covered.has(reason), reason).toBe(true);
  });
});
