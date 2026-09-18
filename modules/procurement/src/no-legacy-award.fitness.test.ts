import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as rfq from './domain/rfq';
import { RfqService } from './rfq.service';
import { SourcingAwardService } from './sourcing-award.service';

/**
 * SUP-13/SUP-14's standing guard: NOTHING RAISES A PURCHASE ORDER FROM A QUOTE'S HEADER NUMBER.
 *
 * What was retired, and why each one mattered:
 *
 *   `lowestQuote(quotes)`      returned the smallest `quote.amount` as "the default award
 *                              recommendation". Those amounts are bare numbers — no currency, no tax
 *                              treatment, no freight — so the comparison was between figures that
 *                              were never comparable, and calling the result a recommendation gave a
 *                              sort order the standing of a decision.
 *
 *   `RfqService.award()`       marked the winning quote and raised a purchase order valued at
 *                              `winner.amount`: one header figure and NO LINES. Nothing to receive
 *                              against, nothing to match an invoice to, no currency stated, no
 *                              technical verdict consulted, and no check that the person clicking
 *                              Award could commit the amount.
 *
 *   `PATCH rfqs/:id/award`     the route that called it.
 *
 * An award is now `SourcingAwardService.award` — an approved recommendation, one order per supplier,
 * each in that supplier's own currency with the lines they quoted.
 *
 * STRUCTURAL AND BEHAVIOURAL, like the FX and quotation-line guards. A source scan alone misses the
 * same thing reintroduced under another name; a behavioural check alone misses a function that is
 * written but never wired. The two together are what make this hard to undo by accident.
 */

const SRC = path.join(__dirname);

/** Source with comments stripped — the retirement is explained in prose, and prose is not code. */
function sourceWithoutComments(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the legacy award stays retired', () => {
  it('exports no lowestQuote, and nothing in the module calls one', () => {
    expect(rfq, 'lowestQuote ranked incomparable figures and called the result a recommendation')
      .not.toHaveProperty('lowestQuote');

    const offenders = fs
      .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((f) => typeof f === 'string' && f.endsWith('.ts') && !f.endsWith('no-legacy-award.fitness.test.ts'))
      .filter((f) => sourceWithoutComments(path.join(SRC, f)).includes('lowestQuote'));
    expect(offenders, 'lowestQuote is retired — a recommendation is a recorded decision (SUP-13)').toEqual([]);
  });

  it('gives the RFQ service no way to award and no way to raise an order', () => {
    // The method is gone from the prototype, not merely unexported.
    expect(RfqService.prototype, 'awarding from a quote header is SUP-14’s job now').not.toHaveProperty('award');

    /**
     * And the dependency it used is gone with it. This is the part that makes the retirement stick:
     * with no purchase-order service injected, the old path cannot creep back as a one-line
     * convenience — somebody would have to re-add the constructor argument to write it at all.
     */
    const src = sourceWithoutComments(path.join(SRC, 'rfq.service.ts'));
    expect(src).not.toContain('PurchaseOrderService');
    expect(src, 'the RFQ read must not hand back a "recommended" quote').not.toMatch(/recommended\s*:/);
  });

  it('keeps the RFQ read free of a winner, and the legacy quote free of an award path', () => {
    const src = sourceWithoutComments(path.join(SRC, 'domain', 'rfq.ts'));
    // The legacy `amount` scalar itself survives — quotations captured before the family model carry
    // it, and deleting it would invalidate history rather than improve it. What must not come back
    // is anything that RANKS or AWARDS on it.
    expect(src).toContain('amount');
    for (const banned of ['lowestQuote', 'cheapestQuote', 'bestQuote', 'recommendedQuote']) {
      expect(src, `${banned} would be lowestQuote under another name`).not.toContain(banned);
    }
  });

  it('routes every award through an approved recommendation', () => {
    const src = sourceWithoutComments(path.join(SRC, 'sourcing-award.service.ts'));
    // The refusals that make the award governed rather than mechanical.
    expect(src).toContain("recommendation.status !== 'approved'");
    expect(src).toContain('staleness.stale');
    // The order is raised through the order service — which numbers it, emits `po.created` so the
    // commitment reaches project cost, and refuses an unapproved supplier.
    expect(src).toContain('this.orders.create(order');
    expect(SourcingAwardService.prototype).toHaveProperty('award');
  });

  it('leaves no HTTP route able to raise an order from a quote', () => {
    const controller = path.resolve(__dirname, '..', '..', '..', 'apps', 'api', 'src', 'procurement', 'procurement.controller.ts');
    const src = sourceWithoutComments(controller);
    // The route still exists so a stale caller is TOLD where the award went rather than getting a
    // 404 that reads like a bug — but it must not reach a service to do it.
    expect(src).toContain("@Patch('rfqs/:id/award')");
    expect(src, 'the legacy route must refuse, not award').not.toMatch(/rfqs\.award\(/);
    expect(src).toMatch(/awardRfq\(\)\s*:\s*never/);
  });
});
