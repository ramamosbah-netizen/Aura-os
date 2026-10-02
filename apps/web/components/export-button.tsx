'use client';

import { type CSSProperties, useState } from 'react';
import { businessDateInputValue } from '@/lib/locale';

export interface ExportColumn {
  key: string;
  label?: string;
  /**
   * How the workbook types this column (F-03). Read from the values when absent — numbers stay
   * numbers, ISO dates become dates, anything mixed stays text.
   */
  type?: 'text' | 'number' | 'integer' | 'money' | 'percent' | 'date' | 'datetime' | 'boolean';
  /** Add this column to the workbook's Total row (which follows the filter). */
  total?: boolean;
}

interface ExportProps {
  rows: Array<Record<string, unknown>>;
  filename: string;
  columns?: ExportColumn[];
  /** Heading printed on the Excel sheet and the print view. Defaults to the filename. */
  title?: string;
  /** Optional server export endpoint for a complete filtered register (not just the visible page). */
  csvUrl?: string;
}

// Shared reporting control — one drop-in that exports the current rows as CSV or Excel,
// or opens a clean print view (Save-as-PDF from the browser dialog). Adopted across every register
// so reporting is uniform, not per-module one-offs.
//
// EXCEL IS A REAL WORKBOOK (F-03). It used to be an HTML table saved as .xls, which Excel opens
// behind a format warning, every value text. The rows now go to the governed workbook builder and
// come back as native .xlsx — typed, filtered, header frozen, with an "About this export" sheet
// that says these are the rows that were on screen, not necessarily the whole register.

const stamp = (): string => businessDateInputValue();
const esc = (v: unknown): string => (v == null ? '' : String(v));
const htmlEsc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function resolveCols(rows: Array<Record<string, unknown>>, columns?: ExportColumn[]): ExportColumn[] {
  return columns ?? (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k })) : []);
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportButton({ rows, filename, columns, title, csvUrl }: ExportProps) {
  const disabled = !rows?.length;
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [excelLoading, setExcelLoading] = useState(false);
  const cols = () => resolveCols(rows, columns);
  const heading = title ?? filename;

  async function exportCsv(): Promise<void> {
    if (disabled) return;
    setCsvError('');
    if (csvUrl) {
      setCsvLoading(true);
      try {
        const res = await fetch(csvUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('Export could not be generated');
        downloadBlob(await res.blob(), `${filename}-${stamp()}.csv`);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Export could not be generated');
      } finally {
        setCsvLoading(false);
      }
      return;
    }
    const c = cols();
    const q = (v: unknown): string => {
      const s = esc(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = c.map((x) => q(x.label ?? x.key)).join(',');
    const body = rows.map((r) => c.map((x) => q(r[x.key])).join(',')).join('\n');
    downloadBlob(new Blob([`${header}\n${body}\n`], { type: 'text/csv;charset=utf-8;' }), `${filename}-${stamp()}.csv`);
  }

  function tableHtml(): string {
    const c = cols();
    const head = c.map((x) => `<th>${htmlEsc(x.label ?? x.key)}</th>`).join('');
    const body = rows
      .map((r) => `<tr>${c.map((x) => `<td>${htmlEsc(esc(r[x.key]))}</td>`).join('')}</tr>`)
      .join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async function exportExcel(): Promise<void> {
    if (disabled) return;
    setExcelLoading(true);
    setCsvError('');
    try {
      const res = await fetch('/api/documents/workbook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: heading,
          filename: `${filename}-${stamp()}`,
          columns: cols().map((c) => ({ key: c.key, label: c.label ?? c.key, type: c.type, total: c.total })),
          rows,
        }),
      });
      if (!res.ok) throw new Error(`Excel export failed (${res.status})`);
      downloadBlob(await res.blob(), `${filename}-${stamp()}.xlsx`);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Excel export failed');
    } finally {
      setExcelLoading(false);
    }
  }

  function printView(): void {
    if (disabled) return;
    const w = window.open('', '_blank', 'width=1024,height=768');
    if (!w) return;
    w.document.write(`<html><head><title>${htmlEsc(heading)}</title><style>
      body{font-family:system-ui,Arial,sans-serif;margin:28px;color:#111}
      h2{font-size:18px;margin:0 0 2px} .meta{color:#666;font-size:12px;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f3f4f6;text-align:left} td,th{border:1px solid #d1d5db;padding:6px 8px}
      @media print{@page{margin:14mm}}
    </style></head><body>
      <h2>${htmlEsc(heading)}</h2>
      <p class="meta">${rows.length} row(s) · ${stamp()}</p>
      ${tableHtml()}
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    w.document.close();
  }

  return (
    <span style={s.group} role="group" aria-label="Export">
      <button type="button" style={s.btn} onClick={() => void exportCsv()} disabled={disabled || csvLoading} title={csvUrl ? 'Export all filtered rows to CSV' : 'Export current rows to CSV'}>{csvLoading ? '… CSV' : '⬇ CSV'}</button>
      <button type="button" style={s.btn} onClick={() => void exportExcel()} disabled={disabled || excelLoading} title="Export the rows shown to a native Excel workbook" data-testid="export-excel">{excelLoading ? '… Excel' : '⬇ Excel'}</button>
      <button type="button" style={s.btn} onClick={printView} disabled={disabled} title="Print / Save as PDF">🖨 Print</button>
      {csvError && <span role="alert" style={s.error}>{csvError}</span>}
    </span>
  );
}

const s = {
  group: { display: 'inline-flex', gap: 6 } as CSSProperties,
  btn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12, alignSelf: 'center' } as CSSProperties,
};
