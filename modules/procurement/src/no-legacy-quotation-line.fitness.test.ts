import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeQuotationLine } from './domain/quotation-line';

/**
 * QC-01's standing guard: a quotation line belongs to a REVISION and to nothing else.
 *
 * `quotation_id` and `is_alternate` are retired (migrations 0351, 0352). Both were convenient, and
 * both are the kind of field that creeps back — a line "temporarily" hung off a quotation while
 * something is wired up, an alternate flag added because it is quicker than modelling a second
 * offer. What they cost is exactly what QC-01 was raised for: a quotation-scoped line let a supplier
 * revision overwrite the price before it, and a line-level alternate flag could not hold a second
 * variant at all, because a line is unique per requisition line per revision.
 *
 * Structural AND behavioural, for the same reason the FX guard is both: a source scan misses a field
 * reintroduced under another name, and a behavioural check misses one that is written but unread.
 */

const DOMAIN = path.join(__dirname, 'domain', 'quotation-line.ts');

/** Source with comments stripped — the retirement is explained in prose, and prose is not code. */
function sourceWithoutComments(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('a quotation line belongs to a revision, and to nothing else', () => {
  it('has no quotationId and no isAlternate on the line', () => {
    const src = sourceWithoutComments(DOMAIN);
    expect(src, 'quotationId was retired by migration 0352 and must not return').not.toContain('quotationId');
    expect(src, 'isAlternate was retired by migration 0351 — an alternative is an OFFER').not.toContain('isAlternate');
    // …and the field that replaced them is still there, so this fails loudly if the file is gutted.
    expect(src).toContain('revisionId');
  });

  it('refuses to construct a line that belongs to no revision', () => {
    expect(() => makeQuotationLine({ tenantId: 't1', prLineId: 'pr1' } as never))
      .toThrow(/must belong to a quotation revision/);
    expect(() => makeQuotationLine({ tenantId: 't1', prLineId: 'pr1', revisionId: '' } as never))
      .toThrow(/must belong to a quotation revision/);
  });

  it('builds a line bound to a revision, carrying the fields that replaced the retired ones', () => {
    const line = makeQuotationLine({
      tenantId: 't1', revisionId: 'rev-1', prLineId: 'pr1',
      quantity: 12, uom: 'nr', unitPrice: 100,
      supplierDescription: '4MP dome', partNumber: 'PN-1', commercialDeviation: '50% advance',
    });
    expect(line).toMatchObject({
      revisionId: 'rev-1', supplierDescription: '4MP dome', partNumber: 'PN-1',
      commercialDeviation: '50% advance',
    });
    expect(line).not.toHaveProperty('quotationId');
    expect(line).not.toHaveProperty('isAlternate');
  });

  it('keeps the line stores free of any read keyed on a quotation', () => {
    for (const file of ['quotation-line.store.ts', 'in-memory-quotation-line-store.ts', 'postgres-quotation-line-store.ts']) {
      const src = sourceWithoutComments(path.join(__dirname, file));
      expect(src, `${file} must not key a read on a quotation`).not.toMatch(/listByQuotation|findForRequirement/);
      expect(src, `${file} must not reference the dropped column`).not.toContain('quotation_id');
      expect(src).not.toContain('is_alternate');
    }
  });
});
