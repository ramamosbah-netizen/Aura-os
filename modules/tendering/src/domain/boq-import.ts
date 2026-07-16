// Tendering domain — framework-free. T5 (vision §2.2 "BOQ Import"): the spreadsheet → BOQ
// parser, as a PURE function over rows (the controller owns the xlsx binary; the domain owns
// the interpretation). Design goals, learned from real client BOQs:
//
//   * The header is rarely row 1 — title blocks, project names and revision tables sit above
//     it. The parser SCANS for the row that looks like a header instead of assuming.
//   * Numbers arrive as "1,200.50", "AED 380" or "  45 000 " — they are cleaned, not
//     parseFloat'd into silent garbage (parseFloat("1,200") is 1).
//   * Nothing is skipped silently: every row that could not be imported becomes an ISSUE with
//     its spreadsheet row number, so the estimator can fix the sheet instead of discovering a
//     hole at submission time.

export interface BoqImportRow {
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  ifcGuid?: string;
}

export interface BoqImportIssue {
  /** 1-based spreadsheet row number, as the estimator sees it in Excel. */
  row: number;
  problem: string;
}

export interface BoqImportResult {
  items: BoqImportRow[];
  issues: BoqImportIssue[];
  /** 1-based row the header was found on. */
  headerRow: number;
  /** Detected 0-based column index per field (-1 = not present; ifcGuid is optional). */
  columns: { itemCode: number; description: number; unit: number; quantity: number; rate: number; ifcGuid: number };
}

/** Column synonyms — lowercase substring match, first hit wins, in listed priority. */
const SYNONYMS: Record<keyof BoqImportResult['columns'], string[]> = {
  itemCode: ['item code', 'code', 'item no', 'item', 'no.', 'sn', 'ref', 'sr'],
  description: ['description', 'desc', 'particular', 'activity', 'scope', 'title', 'work'],
  unit: ['unit', 'uom'],
  quantity: ['qty', 'quant'],
  rate: ['rate', 'unit price', 'price'],
  ifcGuid: ['ifc', 'guid'],
};

const REQUIRED: Array<keyof BoqImportResult['columns']> = ['itemCode', 'description', 'unit', 'quantity', 'rate'];

const cellText = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** "AED 1,200.50" / "1 200,5"-style money/quantity cells → number, or NaN when not numeric. */
export function parseImportNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const raw = cellText(v);
  if (!raw) return NaN;
  // Strip currency words/symbols, thousands separators and inner spaces; keep digits . -
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(/,/g, '.');
  // "TBD"/"by others" clean down to nothing — that is not a zero, it is not a number.
  if (!/\d/.test(cleaned)) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function detectColumns(row: unknown[]): BoqImportResult['columns'] | null {
  const headers = row.map((h) => cellText(h).toLowerCase());
  const columns = { itemCode: -1, description: -1, unit: -1, quantity: -1, rate: -1, ifcGuid: -1 };
  const fields = Object.keys(SYNONYMS) as Array<keyof typeof SYNONYMS>;
  // Two passes: exact header matches claim their columns first ("uom" → unit, "unit price" →
  // rate), THEN substring matches fill what is left — otherwise unit's substring 'unit' would
  // greedily claim a "Unit Price" column and orphan the rate.
  for (const exact of [true, false]) {
    for (const field of fields) {
      if (columns[field] !== -1) continue;
      for (const syn of SYNONYMS[field]) {
        const idx = headers.findIndex(
          (h, i) => (exact ? h === syn : h.includes(syn)) && !Object.values(columns).includes(i),
        );
        if (idx !== -1) { columns[field] = idx; break; }
      }
    }
  }
  const found = REQUIRED.filter((f) => columns[f] !== -1).length;
  return found === REQUIRED.length ? columns : null;
}

/**
 * Parse spreadsheet rows (array-of-arrays, as xlsx's `header: 1` yields) into BOQ items +
 * issues. Scans the first `headerScanDepth` rows for the header. Pure — same rows, same result.
 * Throws only when no usable header exists at all (there is nothing to report per-row then).
 */
export function parseBoqRows(rows: unknown[][], headerScanDepth = 10): BoqImportResult {
  let columns: BoqImportResult['columns'] | null = null;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, headerScanDepth); i++) {
    columns = detectColumns(rows[i] ?? []);
    if (columns) { headerIdx = i; break; }
  }
  if (!columns || headerIdx === -1) {
    throw new Error(
      'could not detect a BOQ header row — the sheet must have columns for Code, Description, Unit, Quantity and Rate (searched the first ' +
        Math.min(rows.length, headerScanDepth) + ' rows)',
    );
  }

  const items: BoqImportRow[] = [];
  const issues: BoqImportIssue[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNo = i + 1; // as seen in Excel
    const itemCode = cellText(row[columns.itemCode]);
    const description = cellText(row[columns.description]);
    const unit = cellText(row[columns.unit]);
    const qtyCell = row[columns.quantity];
    const rateCell = row[columns.rate];

    // A fully empty line (spacer/section break) is not an issue.
    if (!itemCode && !description && !unit && !cellText(qtyCell) && !cellText(rateCell)) continue;

    // Section headings carry a description but no unit/qty — common in real BOQs; note, skip.
    if (description && !unit && !cellText(qtyCell)) {
      issues.push({ row: rowNo, problem: `"${description.slice(0, 60)}" has no unit/quantity — treated as a section heading, not imported` });
      continue;
    }
    if (!itemCode && !description) {
      issues.push({ row: rowNo, problem: 'no item code or description — row skipped' });
      continue;
    }

    const quantity = parseImportNumber(qtyCell);
    const rate = parseImportNumber(rateCell);
    if (Number.isNaN(quantity)) {
      issues.push({ row: rowNo, problem: `quantity "${cellText(qtyCell)}" is not a number — row skipped` });
      continue;
    }
    if (quantity < 0 || (!Number.isNaN(rate) && rate < 0)) {
      issues.push({ row: rowNo, problem: 'negative quantity or rate — row skipped' });
      continue;
    }
    // A blank rate imports at 0 (the estimate prices it later) — but it is worth a note.
    if (Number.isNaN(rate)) {
      issues.push({ row: rowNo, problem: `rate "${cellText(rateCell)}" is not a number — imported at 0 (price it via the estimate)` });
    }

    const ifcGuid = columns.ifcGuid !== -1 ? cellText(row[columns.ifcGuid]) : '';
    items.push({
      itemCode: itemCode || `R${rowNo}`,
      description: description || itemCode,
      unit,
      quantity,
      rate: Number.isNaN(rate) ? 0 : rate,
      ifcGuid: ifcGuid || undefined,
    });
  }

  return { items, issues, headerRow: headerIdx + 1, columns };
}
