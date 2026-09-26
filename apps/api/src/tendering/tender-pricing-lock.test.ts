import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tenderPricingLockRefusal, type GeneratedOffer } from './tender-pricing-lock';

/**
 * The tender costing lock is ONE rule (EST-17: "approvers review the same frozen build-up"): refused
 * while a generated offer is with a reviewer, and while one stands committed to the client. The legacy
 * `POST /tendering/estimates` route used to carry its own copy of only the committed half.
 */
const offer = (status: GeneratedOffer['status'], revision = 0): GeneratedOffer => ({ quoteNumber: 'QUO-2026-000042', revision, status });

describe('the tender pricing lock', () => {
  it('is open with no offer, a never-submitted draft, or only dead and superseded offers', () => {
    expect(tenderPricingLockRefusal([])).toBeNull();
    expect(tenderPricingLockRefusal([offer('draft')])).toBeNull();
    expect(tenderPricingLockRefusal([offer('revised'), offer('rejected', 1), offer('expired', 2), offer('cancelled', 3)])).toBeNull();
  });

  it('refuses while a reviewer is deciding — and names the revision and the way out', () => {
    expect(tenderPricingLockRefusal([offer('revised'), offer('internal_review', 1)])).toBe(
      'tender pricing sheet is locked: QUO-2026-000042 Rev 1 is with a commercial reviewer, and the costing behind ' +
        'figures somebody is deciding on cannot be re-worked while they decide. To change it, have the reviewer ' +
        'return the offer for revision.',
    );
  });

  it('refuses while an offer is committed to the client, pointing at the route that exists', () => {
    for (const status of ['approved', 'sent', 'under_negotiation'] as const) {
      expect(tenderPricingLockRefusal([offer(status)])).toMatch(/committed to the client — the costing behind a committed price is immutable\. To change it, raise a quotation revision to re-price\.$/);
    }
    expect(tenderPricingLockRefusal([offer('under_negotiation')])).toContain('QUO-2026-000042 Rev 0 (under negotiation)');
    expect(tenderPricingLockRefusal([offer('accepted')])).toMatch(/change it through a contract variation\.$/);
  });

  it('names the review first when both hold — the reviewer is who has to act', () => {
    expect(tenderPricingLockRefusal([offer('approved'), offer('internal_review', 1)])).toContain('is with a commercial reviewer');
  });
});

describe('one rule for every route that re-works a tender costing (fitness)', () => {
  const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
  const pricing = read('pricing.controller.ts');
  const legacy = read('estimates.controller.ts');

  const body = (source: string, method: string): string => {
    const start = source.indexOf(`async ${method}(`);
    expect(start, `${method} exists`).toBeGreaterThan(-1);
    const next = source.indexOf('\n  @', start);
    return source.slice(start, next < 0 ? undefined : next);
  };

  it('every costing write calls the shared lock', () => {
    for (const method of ['priceItem', 'sourceComponent', 'unsourceComponent']) {
      expect(body(pricing, method), `pricing sheet ${method}`).toContain('this.pricingLock.assertOpen(');
    }
    expect(body(legacy, 'buildRate'), 'legacy POST /tendering/estimates').toContain('this.pricingLock.assertOpen(');
  });

  it('no controller keeps its own copy of the rule', () => {
    // A copy is recognisable by what the rule does — filter the generated offers under review, or
    // refuse in the lock's own words — not by any mention of a status (the offer routes name them).
    for (const [name, source] of [['pricing sheet', pricing], ['legacy estimates', legacy]] as const) {
      expect(source, name).not.toMatch(/filter\(\(?\w+\)?\s*=>\s*\w+\.status === 'internal_review'\)/);
      expect(source, name).not.toContain('tender pricing sheet is locked');
      expect(source, name).not.toContain('tender estimate is locked');
    }
    expect(pricing).not.toContain('assertEstimateNotCommitted');
    expect(legacy).not.toContain('isQuotationCommitted');
    expect(legacy).not.toContain('QuotationService');
  });
});
