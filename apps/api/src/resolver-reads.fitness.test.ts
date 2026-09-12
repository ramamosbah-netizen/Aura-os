import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolver-read fitness test (TC-GATE-19).
 *
 * THE BUG THIS EXISTS TO PREVENT, which this repository shipped three separate times:
 *
 *   - TC-GATE-17 validated a spare's stock reference against `listItems`, capped at 200. Past two
 *     hundred parts the write REFUSED a real part.
 *   - Commissioning's "Engineering released" gate read `listDrawings`, capped at 100 and ordered
 *     newest-first. A drawing row is a REVISION, so a hundred is an ordinary project — and because
 *     the cap keeps the newest, it discarded settled approved drawings FIRST. The gate then stated a
 *     count it had not taken.
 *   - Procurement's sourcing signal read the purchase-request and RFQ registers with
 *     `list({ tenantId })`, capped at 100 and tenant-wide. Any tenant with a hundred requests lost
 *     the project's, so no RFQ could be matched to the project and the signal reported CLEAR.
 *
 * THE RULE. A capped list read answers "show me some rows". It may not answer a question about a
 * WHOLE set — is this released, how many are overdue, does this reference exist. Those need a read
 * that cannot be truncated, and the way to get one is to ask for less: an aggregate, a status
 * filter, a set of ids.
 *
 * Nothing else could have caught any of the three. The compiler cannot see a row limit. The in-memory
 * adapters apply NO default cap, so every unit test passed — the two adapters disagree about `list`,
 * which is precisely why the defects were invisible until a real database held real volume.
 *
 * This lives in the application layer because it is the one place that legitimately reads across
 * every module.
 */

const ROOT = join(__dirname, '..', '..', '..');
const MODULES = join(ROOT, 'modules');

/** `filter.limit ?? 100` and friends — a read that silently stops. */
const DEFAULT_CAP = /(?:filter|page)?\.?limit\s*\?\?\s*(\d+)/;

function methodAt(lines: string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const m = /^\s{2}(?:async\s+)?(?:private\s+)?([A-Za-z_][\w]*)\s*\(/.exec(lines[i]);
    if (m) return m[1];
  }
  return '?';
}

/** Every default-capped read in every Postgres adapter, as `module/file#method`. */
function cappedReads(): string[] {
  const found: string[] = [];
  for (const mod of readdirSync(MODULES)) {
    const src = join(MODULES, mod, 'src');
    let entries: string[];
    try {
      entries = readdirSync(src);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.startsWith('postgres-') || !file.endsWith('.ts') || file.includes('.test.')) continue;
      const lines = readFileSync(join(src, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (DEFAULT_CAP.test(line)) found.push(`${mod}/${file}#${methodAt(lines, i)}`);
      });
    }
  }
  return [...new Set(found)].sort();
}

/**
 * THE INVENTORY, recorded so that adding a capped read is a deliberate act.
 *
 * Every entry here is a LISTING read and is fine as one. What this list is for is the moment someone
 * adds the next one: the diff makes them say so, and whoever reviews it gets to ask the question
 * this gate had to ask thirty times by hand — is anything answering a whole-set question with it?
 */
const RECORDED_CAPS = [
  'contracts/postgres-clause-store.ts#list',
  'contracts/postgres-contract-store.ts#list',
  'contracts/postgres-obligation-store.ts#list',
  'contracts/postgres-payment-certificate-store.ts#list',
  'crm/postgres-account-store.ts#list',
  'crm/postgres-activity-store.ts#list',
  'crm/postgres-contact-store.ts#list',
  'crm/postgres-lead-store.ts#list',
  'crm/postgres-opportunity-store.ts#list',
  'crm/postgres-pricing-sheet-store.ts#list',
  'crm/postgres-quotation-store.ts#list',
  'crm/postgres-signal-store.ts#list',
  'engineering/postgres-bim-model-store.ts#list',
  'engineering/postgres-design-change-store.ts#list',
  'engineering/postgres-drawing-store.ts#list',
  'engineering/postgres-engineering-document-store.ts#list',
  'engineering/postgres-rfi-store.ts#list',
  'engineering/postgres-submittal-store.ts#list',
  'engineering/postgres-technical-query-store.ts#list',
  'finance/postgres-bank-guarantee-store.ts#list',
  'finance/postgres-customer-invoice-store.ts#list',
  'finance/postgres-invoice-store.ts#list',
  'finance/postgres-journal-store.ts#list',
  'finance/postgres-payment-store.ts#list',
  'finance/postgres-petty-cash-store.ts#listFunds',
  'finance/postgres-post-dated-cheque-store.ts#list',
  'inventory/postgres-goods-receipt-store.ts#list',
  'inventory/postgres-stock-store.ts#listItems',
  'inventory/postgres-transfer-store.ts#list',
  'market-intelligence/postgres-market-item-store.ts#list',
  'procurement/postgres-framework-agreement-store.ts#list',
  'procurement/postgres-purchase-order-store.ts#list',
  'procurement/postgres-purchase-request-store.ts#list',
  'procurement/postgres-rfq-store.ts#list',
  'procurement/postgres-supplier-store.ts#list',
  'projects/postgres-closeout-store.ts#list',
  'projects/postgres-cost-ledger-store.ts#list',
  'projects/postgres-project-store.ts#list',
  'projects/postgres-quantity-ledger-store.ts#list',
  'projects/postgres-variation-store.ts#list',
  'tendering/postgres-bid-score-store.ts#list',
  'tendering/postgres-clarification-store.ts#list',
  'tendering/postgres-submission-store.ts#list',
  'tendering/postgres-tender-store.ts#list',
  'tendering/postgres-win-loss-store.ts#list',
];

/**
 * The resolvers this gate fixed, pinned by the call they must and must not make.
 *
 * Deliberately a named list rather than a rule inferred from the source: "is this method answering a
 * question about a whole set" is a judgement, and a test that guessed at it would either miss cases
 * or cry wolf. Named, it cannot drift — and what it covers is exactly what it says.
 */
const RESOLVERS: Array<{ file: string; method: string; mustCall: string[]; mustNotCall: string[] }> = [
  {
    file: 'engineering/src/engineering.service.ts',
    method: 'readProjectDrawingRelease',
    mustCall: ['summariseRelease('],
    mustNotCall: ['listDrawings(', '.list('],
  },
  {
    file: 'engineering/src/engineering.service.ts',
    method: 'readProjectEngineeringDeliveryImpact',
    mustCall: ['drawingStore.listByStatus(', 'tqStore.listByStatus('],
    mustNotCall: ['listDrawings(', 'listTechnicalQueries('],
  },
  {
    file: 'procurement/src/rfq.service.ts',
    method: 'readProjectProcurementSourcingReadiness',
    mustCall: ['listIdsForProject(', 'listByPrIds('],
    mustNotCall: ['requests.list(', 'store.list('],
  },
  {
    // TC-GATE-18's fix, pinned here so the port cannot quietly go back to reading the catalogue
    // and searching it — which is how it shipped, and how it refused a real part.
    file: 'inventory/src/stock.service.ts',
    method: 'readStockItems',
    mustCall: ['getItemByCode('],
    mustNotCall: ['listItems('],
  },
  {
    // TC-GATE-20. Not a gate or a signal — the NUMBER. This summed a capped read of one BOQ item's
    // ledger, and newest-first drops the `boq` baseline first, so a fully installed item reported a
    // target of zero and no progress at all.
    file: 'projects/src/quantity-ledger.service.ts',
    method: 'position',
    mustCall: ['listForBoqItem('],
    mustNotCall: ['store.list('],
  },
  {
    // TC-GATE-20. Searched a capped project ledger for the ORIGINAL billed fact, which is older than
    // the cancellation reversing it. Not finding it reads as "nothing to reverse" and returns null,
    // so the billed quantity stayed standing and the cancellation reported success.
    file: 'projects/src/quantity-ledger.service.ts',
    method: 'reverseBilled',
    mustCall: ['findByDedupeKey('],
    mustNotCall: ['store.list('],
  },
  {
    // TC-GATE-20. Both the certified source and the effective-total guard came off the same capped
    // read, so an aged source refused a valid correction outright.
    file: 'projects/src/quantity-ledger.service.ts',
    method: 'correctCertified',
    mustCall: ['findByDedupeKey(', 'listForBoqItem('],
    mustNotCall: ['store.list('],
  },
];

/**
 * The body of a named method: past the parameter list, then from the brace that ends the signature.
 *
 * Both halves are load-bearing, and both were learned by getting them wrong.
 *
 *   - Not the first `{`. A signature like `async reverseBilled(input: {` opens a brace inside its
 *     own PARAMETER TYPE, so counting from there returns the parameter list and nothing else.
 *     So the scan first walks to the `)` that closes the parameters.
 *   - Then not simply the next `{` either: `): Promise<Array<{ id: string }>> {` opens and closes
 *     one inside its RETURN TYPE. A brace at END OF LINE is what this codebase's formatting
 *     guarantees for a body, so that is the anchor.
 *
 * A body cut short makes every `mustNotCall` pass while reading nothing, which is why each resolver
 * above also carries a `mustCall`: that assertion is what proves the body was actually found. It is
 * how this very bug was caught rather than shipped as eight green checks.
 */
function bodyOf(source: string, method: string): string {
  const start = source.search(new RegExp(`^\\s{2}(?:async\\s+)?${method}\\s*\\(`, 'm'));
  if (start === -1) return '';

  // Walk the parameter list to its closing paren.
  const firstParen = source.indexOf('(', start);
  if (firstParen === -1) return '';
  let parens = 0;
  let afterParams = -1;
  for (let i = firstParen; i < source.length; i += 1) {
    if (source[i] === '(') parens += 1;
    else if (source[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        afterParams = i;
        break;
      }
    }
  }
  if (afterParams === -1) return '';

  const opener = /\{\r?\n/g;
  opener.lastIndex = afterParams;
  const open = opener.exec(source);
  if (!open) return '';

  let depth = 0;
  for (let i = open.index; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

describe('resolver reads', () => {
  it('records every default-capped list read, so a new one is a deliberate act', () => {
    expect(cappedReads()).toEqual(RECORDED_CAPS);
  });

  for (const r of RESOLVERS) {
    it(`${r.method} reads through something that cannot truncate`, () => {
      const source = readFileSync(join(MODULES, ...r.file.split('/')), 'utf8');
      const body = bodyOf(source, r.method);
      expect(body, `${r.method} not found in ${r.file} — rename it here too`).not.toBe('');

      for (const call of r.mustCall) {
        expect(body, `${r.method} must resolve through ${call}`).toContain(call);
      }
      for (const call of r.mustNotCall) {
        expect(
          body.includes(call),
          `${r.method} reads through ${call}, which stops at a default row cap — a question about a whole set may not be answered from a capped list`,
        ).toBe(false);
      }
    });
  }
});
