import { describe, expect, it } from 'vitest';
import { parseBoqRows, parseImportNumber, parsePastedBoqLines } from './boq-import';

describe('parseImportNumber', () => {
  it('cleans real-world money/quantity cells', () => {
    expect(parseImportNumber(1200.5)).toBe(1200.5);
    expect(parseImportNumber('1,200.50')).toBe(1200.5);
    expect(parseImportNumber('AED 380')).toBe(380);
    expect(parseImportNumber(' 45,000 ')).toBe(45000);
    expect(parseImportNumber('12,5')).toBe(12.5); // EU decimal comma
  });

  it('NaN for non-numbers and blanks', () => {
    expect(Number.isNaN(parseImportNumber('TBD'))).toBe(true);
    expect(Number.isNaN(parseImportNumber(''))).toBe(true);
    expect(Number.isNaN(parseImportNumber(null))).toBe(true);
  });
});

describe('parseBoqRows', () => {
  const header = ['Item Code', 'Description', 'Unit', 'Qty', 'Rate (AED)', 'IFC GUID'];

  it('parses a plain sheet and reports the detected header', () => {
    const { items, issues, headerRow, columns } = parseBoqRows([
      header,
      ['1.1', 'CCTV cameras', 'no', 10, '1,200.00', 'IFC-1'],
      ['1.2', 'Cable trays', 'm', '150', 45, ''],
    ]);
    expect(headerRow).toBe(1);
    expect(columns.rate).toBe(4);
    expect(issues).toEqual([]);
    expect(items).toEqual([
      { itemCode: '1.1', description: 'CCTV cameras', unit: 'no', quantity: 10, rate: 1200, ifcGuid: 'IFC-1', sourceRow: 2 },
      { itemCode: '1.2', description: 'Cable trays', unit: 'm', quantity: 150, rate: 45, ifcGuid: undefined, sourceRow: 3 },
    ]);
  });

  it('finds the header below a title block — row 1 is NOT assumed', () => {
    const { items, headerRow } = parseBoqRows([
      ['METRO DEPOT — ELV PACKAGE'],
      ['Bill of Quantities', '', 'Rev', 'B'],
      [],
      header,
      ['2.1', 'Access control doors', 'no', 8, 950],
    ]);
    expect(headerRow).toBe(4);
    expect(items).toHaveLength(1);
  });

  it('reports issues per spreadsheet row instead of skipping silently', () => {
    const { items, issues } = parseBoqRows([
      header,
      ['SECTION A — HEAD END', '', '', '', ''],           // heading (code col holds text, no unit/qty)
      ['3.1', 'NVR 64ch', 'no', 'TBD', 500],              // bad qty → skipped
      ['3.2', 'Monitor 55"', 'no', 2, 'by others'],       // bad rate → imported at 0, noted
      ['3.3', 'Rack 42U', 'no', -1, 100],                 // negative → skipped
      [],                                                  // spacer → silent
      ['3.4', 'UPS 6kVA', 'no', 2, 3200],
    ]);
    expect(items.map((i) => i.itemCode)).toEqual(['3.2', '3.4']);
    expect(items[0].rate).toBe(0);
    expect(issues.map((i) => i.row)).toEqual([2, 3, 4, 5]);
    expect(issues[1].problem).toContain('not a number');
  });

  it('throws when no usable header exists', () => {
    expect(() => parseBoqRows([['just'], ['prose'], ['here']])).toThrow(/could not detect a BOQ header/);
  });

  it('handles synonym headers (No. / Particulars / UOM / Quant / Unit Price)', () => {
    const { items } = parseBoqRows([
      ['No.', 'Particulars of work', 'UOM', 'Quant.', 'Unit Price'],
      ['A1', 'Fire alarm panel', 'no', 1, '12,000'],
    ]);
    expect(items).toEqual([{ itemCode: 'A1', description: 'Fire alarm panel', unit: 'no', quantity: 1, rate: 12000, ifcGuid: undefined, sourceRow: 2 }]);
  });
});

/**
 * F-12 — pasted lines are judged by the spreadsheet's rules, with their LINE numbers, so a reviewer
 * sees exactly what will be written and what will not, and why, before anything is.
 */
describe('parsePastedBoqLines', () => {
  it('reads tab- or comma-separated lines and keeps each line number', () => {
    const parsed = parsePastedBoqLines(['1.1, Earthworks, m3, 1500, 45', '1.2\tCCTV camera\tno\t24\t650\tIFC-9'].join('\n'));
    expect(parsed.items).toEqual([
      { itemCode: '1.1', description: 'Earthworks', unit: 'm3', quantity: 1500, rate: 45, ifcGuid: undefined, sourceRow: 1 },
      { itemCode: '1.2', description: 'CCTV camera', unit: 'no', quantity: 24, rate: 650, ifcGuid: 'IFC-9', sourceRow: 2 },
    ]);
    expect(parsed.issues).toEqual([]);
  });

  it('never invents a quantity, and names every line it will not import', () => {
    const parsed = parsePastedBoqLines([
      '2.1, Cable tray, m, TBD, 30',              // quantity is not a number
      '',                                          // a blank line is not an issue
      '2.2, Patch panel, no, 4,',                  // blank rate: imported at 0, with a note
      'SECTION 3 - ACCESS CONTROL',                // a heading
      '2.3, Cable, CAT6, 305m roll, box, 10, 120', // commas in the description: fails on quantity
    ].join('\n'));
    expect(parsed.items.map((i) => [i.itemCode, i.quantity, i.rate, i.sourceRow])).toEqual([['2.2', 4, 0, 3]]);
    expect(parsed.issues.map((i) => i.row)).toEqual([1, 3, 4, 5]);
    expect(parsed.issues[0].problem).toContain('quantity "TBD" is not a number');
    expect(parsed.issues[1].problem).toContain('imported at 0');
    // "305m roll" would have been read as 305 of unit CAT6: a line with more fields than the paste
    // format has is refused whole, not reinterpreted.
    expect(parsed.issues[3].problem).toContain('has 7 fields');
    expect(parsed.issues[2].problem).toContain('treated as a section heading');
  });
});
