'use client';

import { type CSSProperties } from 'react';

export interface ExportColumn { key: string; label?: string }

/** Reusable CSV export — turns any row array into a downloaded .csv (no dependency). */
export default function ExportButton({ rows, filename, columns }: { rows: Array<Record<string, unknown>>; filename: string; columns?: ExportColumn[] }) {
  function download(): void {
    if (!rows || rows.length === 0) return;
    const cols: ExportColumn[] = columns ?? Object.keys(rows[0]).map((k) => ({ key: k }));
    const esc = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = cols.map((c) => esc(c.label ?? c.key)).join(',');
    const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" style={s.btn} onClick={download} disabled={!rows?.length} title="Export current rows to CSV">
      ⬇ Export CSV
    </button>
  );
}

const s = {
  btn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
};
