import * as XLSX from 'xlsx';
import { sumMoney } from '@aura/shared';

/**
 * THE GOVERNED WORKBOOK (F-03) — one way AURA writes an operational Excel file.
 *
 * What a register export used to be: every value written as text (amounts that Excel could not sum,
 * dates it could not sort), no filter, no frozen header, nothing saying where the rows came from —
 * and the shared "Excel" button was an HTML table saved as .xls, which Excel opens behind a format
 * warning. A workbook built here is native .xlsx and carries:
 *
 *   typed cells     numbers and money as numbers with a number format, dates as dates, yes/no as
 *                   booleans; an empty value is an empty cell, never the text "" or "—"
 *   a filter        an autofilter over the header and the data
 *   a frozen header the header row stays on screen while scrolling
 *   totals          a "Total" row for the columns that are summable — SUBTOTAL(109,…), so it follows
 *                   the filter, with the computed value cached for viewers that do not recalculate
 *   lineage         an "About this export" sheet: what it is, where its rows came from, which
 *                   filters, who exported it and when, under which issuer — and, in words, whether
 *                   it is the COMPLETE set the person may see or only the rows that were on screen
 *
 * SheetJS's community edition cannot style cells or write Excel tables; the header is plain and the
 * branding is the issuer's identity in words. It also cannot freeze panes, so the header freeze is
 * written into each sheet's view after the book is produced.
 */

export type WorkbookColumnType = 'text' | 'number' | 'integer' | 'money' | 'percent' | 'date' | 'datetime' | 'boolean';

export interface WorkbookColumn<T> {
  label: string;
  type: WorkbookColumnType;
  value: (row: T) => unknown;
  /** Add this column to the Total row. Only meaningful for number, integer and money. */
  total?: boolean;
  /** Width in characters; estimated from the content when absent. */
  width?: number;
}

export interface WorkbookLineage {
  title: string;
  /** Where the rows came from, in words: "CRM accounts register". */
  source: string;
  /**
   * The completeness statement, in words, which the reader must not have to infer — e.g. "All 1,204
   * accounts you are permitted to see." or "The 25 rows shown on screen when exported — not
   * necessarily the whole register."
   */
  completeness: string;
  filters?: Array<[string, string]>;
  generatedAt: string;
  generatedBy: string;
  /** The issuer's identity line(s) — legal name, TRN — from the governed document identity. */
  issuer?: string[];
  currency?: string;
  /** Anything else a reader must know to use the numbers correctly. */
  notes?: string[];
}

const FORMATS: Partial<Record<WorkbookColumnType, string>> = {
  integer: '#,##0',
  money: '#,##0.00',
  percent: '0.0%',
  date: 'yyyy-mm-dd',
  datetime: 'yyyy-mm-dd hh:mm',
};

/** Days since Excel's epoch (1899-12-30), for a calendar date. */
function serialOfDate(y: number, m: number, d: number): number {
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/**
 * A wall-clock instant in the company's business zone as an Excel serial. Excel has no time zones:
 * the number is what the reader will see, so it is the Dubai wall clock (CC-01), not UTC.
 */
function serialOfInstant(iso: string): number | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  return serialOfDate(parts.year, parts.month, parts.day) + ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second) / 86_400;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** One typed cell, or null for an empty one. Exported for the generic export's type inference. */
export function typedCell(type: WorkbookColumnType, raw: unknown): XLSX.CellObject | null {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (type) {
    case 'number':
    case 'integer':
    case 'money':
    case 'percent': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(n)) return { t: 's', v: String(raw) };
      return { t: 'n', v: n, ...(FORMATS[type] ? { z: FORMATS[type] } : {}) };
    }
    case 'date': {
      const text = String(raw).slice(0, 10);
      const m = DATE_ONLY.exec(text);
      if (!m) return { t: 's', v: String(raw) };
      return { t: 'n', v: serialOfDate(Number(m[1]), Number(m[2]), Number(m[3])), z: FORMATS.date };
    }
    case 'datetime': {
      const serial = serialOfInstant(String(raw));
      return serial === null ? { t: 's', v: String(raw) } : { t: 'n', v: serial, z: FORMATS.datetime };
    }
    case 'boolean':
      return typeof raw === 'boolean' ? { t: 'b', v: raw } : { t: 's', v: String(raw) };
    default:
      return { t: 's', v: String(raw) };
  }
}

function widthOf<T>(column: WorkbookColumn<T>, rows: readonly T[]): number {
  if (column.width) return column.width;
  let widest = column.label.length;
  for (const row of rows.slice(0, 500)) {
    const raw = column.value(row);
    const shown = raw === null || raw === undefined ? '' : column.type === 'datetime' ? '0000-00-00 00:00' : String(raw);
    widest = Math.max(widest, shown.length);
  }
  return Math.min(60, Math.max(8, widest + 2));
}

function dataSheet<T>(columns: readonly WorkbookColumn<T>[], rows: readonly T[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  columns.forEach((column, c) => { ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: column.label }; });
  const summed: number[][] = columns.map(() => []);
  rows.forEach((row, i) => {
    columns.forEach((column, c) => {
      const cell = typedCell(column.type, column.value(row));
      if (!cell) return;
      ws[XLSX.utils.encode_cell({ r: i + 1, c })] = cell;
      if (column.total && cell.t === 'n') summed[c].push(cell.v as number);
    });
  });
  const lastDataRow = rows.length; // 0-based index of the last data row
  const lastCol = Math.max(0, columns.length - 1);
  let lastRow = lastDataRow;
  if (rows.length > 0 && columns.some((column) => column.total)) {
    lastRow = lastDataRow + 1;
    ws[XLSX.utils.encode_cell({ r: lastRow, c: 0 })] = { t: 's', v: 'Total' };
    columns.forEach((column, c) => {
      if (!column.total || c === 0) return;
      const col = XLSX.utils.encode_col(c);
      ws[XLSX.utils.encode_cell({ r: lastRow, c })] = {
        t: 'n',
        // Money is summed by the money authority (decimal, rounded to the fils): the cached value a
        // non-recalculating viewer shows must not print floating-point dust.
        v: column.type === 'money' ? Number(sumMoney(summed[c])) : summed[c].reduce((a, b) => a + b, 0),
        f: `SUBTOTAL(109,${col}2:${col}${lastDataRow + 1})`,
        ...(FORMATS[column.type] ? { z: FORMATS[column.type] } : {}),
      };
    });
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } });
  // The filter covers the header and the data — never the Total row, which must not be sorted in.
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(lastDataRow, 1), c: lastCol } }) };
  ws['!cols'] = columns.map((column) => ({ wch: widthOf(column, rows) }));
  return ws;
}

function aboutSheet(lineage: WorkbookLineage, rowCount: number): XLSX.WorkSheet {
  const rows: Array<[string, string]> = [
    ['Export', lineage.title],
    ['Source', lineage.source],
    ['Rows', String(rowCount)],
    ['Completeness', lineage.completeness],
    ...(lineage.filters ?? []).map(([name, value]) => [`Filter: ${name}`, value] as [string, string]),
    ['Generated at', lineage.generatedAt],
    ['Generated by', lineage.generatedBy],
    ...(lineage.issuer?.length ? [['Issued under', lineage.issuer.join(' · ')] as [string, string]] : []),
    ...(lineage.currency ? [['Currency', lineage.currency] as [string, string]] : []),
    ...(lineage.notes ?? []).map((note) => ['Note', note] as [string, string]),
  ];
  const ws = XLSX.utils.aoa_to_sheet([['About this export', ''], ...rows]);
  ws['!cols'] = [{ wch: 22 }, { wch: 100 }];
  return ws;
}

/**
 * Freeze the header row of every worksheet that has data — written into the sheet view, because the
 * community edition of SheetJS writes no panes. The book is read back as a zip, each worksheet's
 * empty sheetView gains a frozen pane below row 1, and the zip is written again.
 */
function freezeHeaders(bytes: Buffer, sheetCount: number): Buffer {
  const CFB = (XLSX as unknown as { CFB: { read: (b: Buffer, o: object) => unknown; find: (c: unknown, p: string) => { content: Uint8Array } | null; write: (c: unknown, o: object) => Buffer } }).CFB;
  const zip = CFB.read(bytes, { type: 'buffer' });
  for (let n = 1; n <= sheetCount; n += 1) {
    const entry = CFB.find(zip, `/xl/worksheets/sheet${n}.xml`);
    if (!entry) continue;
    const xml = Buffer.from(entry.content).toString('utf8');
    const frozen = xml.replace(
      /<sheetView workbookViewId="0"\/>/,
      '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>',
    );
    if (frozen !== xml) entry.content = Buffer.from(frozen, 'utf8');
  }
  return CFB.write(zip, { fileType: 'zip', type: 'buffer', compression: true });
}

/** A native workbook: the data sheet first, then "About this export". */
export function buildWorkbook<T>(sheetName: string, columns: readonly WorkbookColumn<T>[], rows: readonly T[], lineage: WorkbookLineage): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet(columns, rows), sheetName.slice(0, 31) || 'Data');
  XLSX.utils.book_append_sheet(workbook, aboutSheet(lineage, rows.length), 'About this export');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
  // Only the data sheet is frozen; the About sheet is short and read top to bottom.
  return freezeHeaders(bytes, 1);
}

/** The wall-clock moment of export, in the business zone, as people read it. */
export function exportedAt(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }).format(at) + ' (Asia/Dubai)';
}
