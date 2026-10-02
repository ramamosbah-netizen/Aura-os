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
  /**
   * Where the row came from — the spreadsheet row, or the line of pasted text — so a reviewer can
   * check it against the source before anything is written (F-12). Never persisted.
   */
  sourceRow?: number;
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
      sourceRow: rowNo,
    });
  }

  return { items, issues, headerRow: headerIdx + 1, columns };
}

/** The columns pasted text is read in, in order — the paste box says so. */
const PASTE_HEADER = ['Code', 'Description', 'Unit', 'Quantity', 'Rate', 'IFC GUID'];

/**
 * PASTED BOQ LINES, read by the SAME rules as a spreadsheet (F-12).
 *
 * The paste box used to parse in the browser by its own looser rules: a line with an unreadable
 * quantity was imported at quantity 0, and a line that did not parse vanished without a word —
 * while the box promised "nothing is invented". Here each line is one row (code, description,
 * unit, quantity, rate[, IFC GUID]) — split on tabs when the line has any, as text copied from a
 * spreadsheet does, otherwise on commas — and goes through `parseBoqRows`, so a pasted line and a
 * spreadsheet row are judged identically. Row numbers in the result are the pasted LINE numbers.
 * A description containing commas cannot be told from extra columns in comma-separated text; such
 * a line fails on its quantity and is reported, never guessed.
 */
export function parsePastedBoqLines(text: string): BoqImportResult {
  const lines = text.split(/\r?\n/);
  const fieldIssues: BoqImportIssue[] = [];
  const rows: unknown[][] = [PASTE_HEADER, ...lines.map((line, i) => {
    const fields = (line.includes('\t') ? line.split('\t') : line.split(',')).map((cell) => cell.trim());
    // More fields than the format has means a description carried commas: "Cable, CAT6, 305m roll"
    // would otherwise be read as 305 of unit "CAT6". Refused whole, never reinterpreted.
    if (fields.length > PASTE_HEADER.length) {
      fieldIssues.push({
        row: i + 1,
        problem: `has ${fields.length} fields — expected code, description, unit, quantity, rate[, IFC GUID]; a description with commas must be pasted from a spreadsheet (tab-separated) — line skipped`,
      });
      return [];
    }
    // A line with no separator at all is a heading ("SECTION 2 - ACCESS CONTROL"): read it as a
    // description, where the shared rule recognises a heading, not as an item code missing the rest.
    if (fields.length === 1 && fields[0]) return ['', fields[0]];
    return fields;
  })];
  const parsed = parseBoqRows(rows, 1);
  // Row n of `rows` is pasted line n-1: the synthetic header occupies row 1.
  return {
    ...parsed,
    headerRow: 0,
    items: parsed.items.map((item) => {
      const line = (item.sourceRow ?? 1) - 1;
      // A code-less line is named for its LINE, not for a spreadsheet row it never had.
      return { ...item, itemCode: item.itemCode === `R${item.sourceRow}` ? `L${line}` : item.itemCode, sourceRow: line };
    }),
    issues: [...parsed.issues.map((issue) => ({ ...issue, row: issue.row - 1 })), ...fieldIssues].sort((a, b) => a.row - b.row),
  };
}
