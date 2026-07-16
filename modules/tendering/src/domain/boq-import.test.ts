import { describe, expect, it } from 'vitest';
import { parseBoqRows, parseImportNumber } from './boq-import';

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
      { itemCode: '1.1', description: 'CCTV cameras', unit: 'no', quantity: 10, rate: 1200, ifcGuid: 'IFC-1' },
      { itemCode: '1.2', description: 'Cable trays', unit: 'm', quantity: 150, rate: 45, ifcGuid: undefined },
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
    expect(items).toEqual([{ itemCode: 'A1', description: 'Fire alarm panel', unit: 'no', quantity: 1, rate: 12000, ifcGuid: undefined }]);
  });
});
