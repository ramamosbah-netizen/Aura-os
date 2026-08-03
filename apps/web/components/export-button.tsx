'use client';

import { type CSSProperties } from 'react';

export interface ExportColumn { key: string; label?: string }

interface ExportProps {
  rows: Array<Record<string, unknown>>;
  filename: string;
  columns?: ExportColumn[];
  /** Heading printed on the Excel sheet and the print view. Defaults to the filename. */
  title?: string;
}

// Shared reporting control — one drop-in that exports the current rows as CSV or Excel,
// or opens a clean print view (Save-as-PDF from the browser dialog). Dependency-free: CSV and
// the .xls (SpreadsheetML-as-HTML) are built from the same rows/columns, and print opens a styled
// window. Adopted across every register so reporting is uniform, not per-module one-offs.

const stamp = (): string => new Date().toISOString().slice(0, 10);
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

export default function ExportButton({ rows, filename, columns, title }: ExportProps) {
  const disabled = !rows?.length;
  const cols = () => resolveCols(rows, columns);
  const heading = title ?? filename;

  function exportCsv(): void {
    if (disabled) return;
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

  function exportExcel(): void {
    if (disabled) return;
    // Excel opens an HTML table saved as .xls — no library needed.
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"><style>th{background:#eee;font-weight:bold;text-align:left}td,th{border:1px solid #ccc;padding:4px}</style></head>
<body><h3>${htmlEsc(heading)}</h3>${tableHtml()}</body></html>`;
    downloadBlob(new Blob([doc], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${filename}-${stamp()}.xls`);
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
      <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
    w.document.close();
  }

  return (
    <span style={s.group} role="group" aria-label="Export">
      <button type="button" style={s.btn} onClick={exportCsv} disabled={disabled} title="Export current rows to CSV">⬇ CSV</button>
      <button type="button" style={s.btn} onClick={exportExcel} disabled={disabled} title="Export current rows to Excel">⬇ Excel</button>
      <button type="button" style={s.btn} onClick={printView} disabled={disabled} title="Print / Save as PDF">🖨 Print</button>
    </span>
  );
}

const s = {
  group: { display: 'inline-flex', gap: 6 } as CSSProperties,
  btn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
};
