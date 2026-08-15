'use client';

import React, { useState, useMemo, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useIsMobile } from '@/lib/use-media-query';
import {
  applySearch, applyFilters, applySort, paginate, pageCountOf, clampPage,
  serializeQuery, type TableQueryState,
} from './table-query';

// AuraDataTable — the ONE operational register for AURA OS.
//
// The per-page UX scorecard found 102 components hand-rolling raw <table> with no pagination
// (1), sort (2), or search (12) despite `/paged` on nearly every endpoint — and this component,
// which had search+sort, adopted exactly once. This upgrade turns it into the standard register
// so every list inherits the same behaviour instead of re-inventing it 100 times:
//
//   • search · column sort · faceted filters · column visibility
//   • pagination (client slicing, or server mode via totalCount + onQueryChange)
//   • URL-persisted state (opt-in `urlKey`) — shareable links AND a surface the AI can read/drive
//   • row deep-linking (rowHref) — the connectivity the audit found missing
//   • responsive card mode — below 768px each row becomes a card (information architecture,
//     not just CSS), so a field engineer can actually use it on a phone
//
// Every new prop is optional with a default that preserves the original behaviour, so the sole
// existing consumer (tender-pricing-client) is unaffected.

export interface AuraColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
  priority?: 'primary' | 'secondary' | 'muted';
  sortable?: boolean;
  /** Hidden by default (user can re-enable via the columns menu when columnToggle is on). */
  defaultHidden?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
}

/** A faceted filter — a select over one field's discrete values. */
export interface FacetFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/** The full register query, emitted to the parent in server mode and mirrored to the URL. */
export interface TableQuery {
  search: string;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  filters: Record<string, string>;
}

export interface AuraDataTableProps<T> {
  columns: AuraColumn<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  stickyHeader?: boolean;
  defaultDensity?: 'comfortable' | 'compact';
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFields?: (keyof T)[];
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  bulkActions?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  loading?: boolean;
  renderExpandedRow?: (row: T) => React.ReactNode;
  isRowExpanded?: (row: T) => boolean;

  // ── New: operational-register features (all opt-in) ──────────────────────────────
  /** Header title above the toolbar. */
  title?: React.ReactNode;
  /** Extra controls on the toolbar's right (e.g. a Create button, export). */
  toolbarExtra?: React.ReactNode;
  /** Rows per page. When set, the table paginates. Omit to show all rows (original behaviour). */
  pageSize?: number;
  /** Faceted filters rendered as selects in the toolbar. */
  filters?: FacetFilter[];
  /** Show a columns-visibility menu. */
  columnToggle?: boolean;
  /** Make each row a link to the record — the connectivity primitive. */
  rowHref?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  /** Custom mobile card. If omitted, a card is auto-built from the visible columns. */
  renderCard?: (row: T, index: number) => React.ReactNode;
  initialSort?: { key: string; dir?: 'asc' | 'desc' };
  /** Persist search/sort/page/filters to the URL under this prefix (enables shareable/AI URLs). */
  urlKey?: string;
  /** Server mode: total row count. When set with onQueryChange, the table stops filtering/
   *  sorting/paginating locally and reports state so the parent can refetch a page. */
  totalCount?: number;
  onQueryChange?: (q: TableQuery) => void;
}

export default function AuraDataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  stickyHeader = true,
  defaultDensity = 'comfortable',
  searchable = true,
  searchPlaceholder = 'Search line items...',
  searchFields,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  bulkActions,
  emptyTitle = 'No line items found',
  emptyDescription = 'There are no items matching your criteria in this view.',
  onEmptyAction,
  emptyActionLabel,
  loading = false,
  renderExpandedRow,
  isRowExpanded,
  title,
  toolbarExtra,
  pageSize,
  filters,
  columnToggle = false,
  rowHref,
  onRowClick,
  renderCard,
  initialSort,
  urlKey,
  totalCount,
  onQueryChange,
}: AuraDataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const server = typeof totalCount === 'number' && !!onQueryChange;
  const paginating = typeof pageSize === 'number' && pageSize > 0;

  // URL param names, prefixed so multiple tables on one page never collide.
  const pfx = urlKey ? `${urlKey}_` : '';
  const read = (k: string, dflt: string) => (urlKey ? (searchParams.get(pfx + k) ?? dflt) : dflt);

  const [density, setDensity] = useState<'comfortable' | 'compact'>(defaultDensity);
  const [search, setSearch] = useState(() => read('q', ''));
  const [sortKey, setSortKey] = useState<string | null>(() => read('sort', initialSort?.key ?? '') || null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (read('dir', initialSort?.dir ?? 'asc') === 'desc' ? 'desc' : 'asc'));
  const [page, setPage] = useState<number>(() => Math.max(1, parseInt(read('page', '1'), 10) || 1));
  const [filterVals, setFilterVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of filters ?? []) init[f.key] = read(`f_${f.key}`, '');
    return init;
  });
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const effPageSize = pageSize ?? (data.length || 1);

  // Sync state → URL and → parent (server mode). Runs when any query dimension changes.
  useEffect(() => {
    if (onQueryChange) {
      onQueryChange({ search, sortKey, sortDir, page, pageSize: effPageSize, filters: filterVals });
    }
    if (urlKey) {
      const state: TableQueryState = { search, sortKey, sortDir, page, filters: filterVals };
      const next = serializeQuery(new URLSearchParams(Array.from(searchParams.entries())), urlKey, state, (filters ?? []).map((f) => f.key));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [search, sortKey, sortDir, page, JSON.stringify(filterVals)]);

  // ── Local filter → sort → paginate (skipped entirely in server mode) ─────────────
  const sortedData = useMemo(() => {
    if (server) return data;
    const filtered = applyFilters(applySearch(data, search, searchFields), filterVals);
    return applySort(filtered, sortKey, sortDir);
  }, [server, data, search, searchFields, filterVals, sortKey, sortDir]);

  const total = server ? (totalCount as number) : sortedData.length;
  const pageCount = paginating ? pageCountOf(total, effPageSize) : 1;
  const currentPage = clampPage(page, pageCount);
  const pagedData = useMemo(() => {
    if (server || !paginating) return sortedData;
    return paginate(sortedData, currentPage, effPageSize);
  }, [server, paginating, sortedData, currentPage, effPageSize]);

  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };
  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };
  const onFilterChange = (k: string, v: string) => { setFilterVals((p) => ({ ...p, [k]: v })); setPage(1); };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return;
    if (e.target.checked) onSelectionChange(new Set(pagedData.map((row, idx) => keyExtractor(row, idx))));
    else onSelectionChange(new Set());
  };
  const handleSelectRow = (key: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };

  const isCompact = density === 'compact';
  const padding = isCompact ? '6px 10px' : '10px 14px';
  const activeFilterCount = Object.values(filterVals).filter(Boolean).length + (search ? 1 : 0);

  const renderAutoCard = (row: T, idx: number) => {
    const primary = visibleColumns.find((c) => c.priority === 'primary') ?? visibleColumns[0];
    const rest = visibleColumns.filter((c) => c !== primary);
    const cell = (col: AuraColumn<T>) => (col.render ? col.render(row, idx) : (row[col.key] ?? '—'));
    return (
      <div style={st.cardInner}>
        <div style={st.cardTitle}>{primary ? cell(primary) : keyExtractor(row, idx)}</div>
        <div style={st.cardRows}>
          {rest.map((col) => (
            <div key={col.key} style={st.cardRow}>
              <span style={st.cardLabel}>{col.label}</span>
              <span style={st.cardValue}>{cell(col)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={st.container}>
      {title && <div style={st.tableTitle}>{title}</div>}

      {/* Toolbar */}
      <div style={st.toolbar}>
        <div style={st.toolbarLeft}>
          {searchable && (
            <div style={st.searchBox}>
              <span style={st.searchIcon}>🔎</span>
              <input
                type="search"
                aria-label="Search"
                style={st.searchInput}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {search && (
                <button type="button" aria-label="Clear search" style={st.clearSearchBtn} onClick={() => onSearchChange('')}>✕</button>
              )}
            </div>
          )}
          {(filters ?? []).map((f) => (
            <select
              key={f.key}
              aria-label={f.label}
              value={filterVals[f.key] ?? ''}
              onChange={(e) => onFilterChange(f.key, e.target.value)}
              style={st.filterSelect}
            >
              <option value="">{f.label}: All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {activeFilterCount > 0 && (
            <button type="button" style={st.clearAll} onClick={() => { setSearch(''); setFilterVals({}); setPage(1); }}>
              Clear ({activeFilterCount})
            </button>
          )}
        </div>

        <div style={st.toolbarRight}>
          {selectable && selectedKeys.size > 0 && (
            <div style={st.selectionBar}>
              <span style={st.selectionCount}>{selectedKeys.size} selected</span>
              {bulkActions}
            </div>
          )}
          {toolbarExtra}
          {columnToggle && (
            <div style={{ position: 'relative' }}>
              <button type="button" style={st.iconBtn} onClick={() => setColMenuOpen((o) => !o)} aria-expanded={colMenuOpen}>
                ▦ Columns
              </button>
              {colMenuOpen && (
                <div style={st.colMenu}>
                  {columns.map((c) => (
                    <label key={c.key} style={st.colMenuItem}>
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(c.key)}
                        onChange={() => setHiddenCols((prev) => {
                          const n = new Set(prev);
                          if (n.has(c.key)) n.delete(c.key); else n.add(c.key);
                          return n;
                        })}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={st.densityGroup}>
            <button type="button" style={density === 'comfortable' ? st.densityBtnActive : st.densityBtn} onClick={() => setDensity('comfortable')} title="Comfortable">☰</button>
            <button type="button" style={density === 'compact' ? st.densityBtnActive : st.densityBtn} onClick={() => setDensity('compact')} title="Compact">≡</button>
          </div>
        </div>
      </div>

      {/* Mobile card list OR desktop table */}
      {isMobile && !loading && pagedData.length > 0 ? (
        <div style={st.cardList}>
          {pagedData.map((row, idx) => {
            const key = keyExtractor(row, idx);
            const href = rowHref?.(row, idx);
            const body = renderCard ? renderCard(row, idx) : renderAutoCard(row, idx);
            return href ? (
              <Link key={key} href={href} style={st.cardLink}>{body}</Link>
            ) : (
              <div key={key} style={st.card} onClick={onRowClick ? () => onRowClick(row, idx) : undefined}>{body}</div>
            );
          })}
        </div>
      ) : (
        <div style={st.tableContainer}>
          <table style={st.table}>
            <thead style={stickyHeader ? st.stickyThead : undefined}>
              <tr>
                {selectable && (
                  <th style={{ ...st.th, width: 38, padding }}>
                    <input type="checkbox" aria-label="Select all" checked={pagedData.length > 0 && selectedKeys.size >= pagedData.length} onChange={handleSelectAll} />
                  </th>
                )}
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    style={{ ...st.th, padding, textAlign: col.align ?? 'left', width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                    onClick={() => col.sortable && handleSort(col.key)}
                    aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>{col.label}</span>
                      {col.sortable && sortKey === col.key && (
                        <span style={{ fontSize: 10, color: 'var(--accent)' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} style={st.row}>
                    {selectable && <td style={{ ...st.td, padding }}><div className="skeleton" style={st.skeletonCell} /></td>}
                    {visibleColumns.map((col) => (
                      <td key={col.key} style={{ ...st.td, padding }}><div className="skeleton" style={st.skeletonCell} /></td>
                    ))}
                  </tr>
                ))}

              {!loading && pagedData.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} style={st.emptyTd}>
                    <div style={st.emptyBox}>
                      <span style={st.emptyIcon}>📂</span>
                      <h4 style={st.emptyTitle}>{emptyTitle}</h4>
                      <p style={st.emptyDesc}>{emptyDescription}</p>
                      {onEmptyAction && emptyActionLabel && (
                        <button type="button" style={st.emptyBtn} onClick={onEmptyAction}>+ {emptyActionLabel}</button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                pagedData.map((row, idx) => {
                  const key = keyExtractor(row, idx);
                  const isSelected = selectedKeys.has(key);
                  const expanded = isRowExpanded ? isRowExpanded(row) : false;
                  const href = rowHref?.(row, idx);
                  const clickable = !!href || !!onRowClick;
                  return (
                    <React.Fragment key={key}>
                      <tr
                        style={{ ...st.row, ...(isSelected ? st.selectedRow : {}), ...(expanded ? st.expandedRowHead : {}), ...(clickable ? st.clickableRow : {}) }}
                        onClick={onRowClick && !href ? () => onRowClick(row, idx) : undefined}
                      >
                        {selectable && (
                          <td style={{ ...st.td, padding }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" aria-label="Select row" checked={isSelected} onChange={() => handleSelectRow(key)} />
                          </td>
                        )}
                        {visibleColumns.map((col, ci) => {
                          const cellVal = row[col.key];
                          const isPrimary = col.priority === 'primary';
                          const isMuted = col.priority === 'muted';
                          const content = col.render ? col.render(row, idx) : (cellVal ?? '—');
                          return (
                            <td
                              key={col.key}
                              style={{ ...st.td, padding, textAlign: col.align ?? 'left', fontWeight: isPrimary ? 700 : 400, color: isMuted ? 'var(--muted)' : 'var(--text)' }}
                            >
                              {href && ci === 0 && !col.render ? <Link href={href} style={st.rowLink}>{content}</Link> : content}
                            </td>
                          );
                        })}
                      </tr>
                      {expanded && renderExpandedRow && (
                        <tr>
                          <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} style={{ ...st.td, background: 'var(--panel-2)', padding: '12px 16px' }}>
                            {renderExpandedRow(row)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer: count + pagination */}
      <div style={st.footer}>
        <span>
          {paginating && total > 0
            ? `${(currentPage - 1) * effPageSize + 1}–${Math.min(currentPage * effPageSize, total)} of ${total}`
            : `${total} ${total === 1 ? 'record' : 'records'}`}
          {!server && search && ` (filtered from ${data.length})`}
        </span>
        {paginating && pageCount > 1 && (
          <div style={st.pager}>
            <button type="button" style={st.pageBtn} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹ Prev</button>
            <span style={st.pageInfo}>Page {currentPage} / {pageCount}</span>
            <button type="button" style={st.pageBtn} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%' },
  tableTitle: { fontSize: 15, fontWeight: 700 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 },
  searchBox: { position: 'relative', display: 'flex', alignItems: 'center', minWidth: 220, flex: '0 1 320px' },
  searchIcon: { position: 'absolute', left: 10, fontSize: 13, color: 'var(--muted)' },
  searchInput: { width: '100%', padding: '7px 28px 7px 32px', background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12.5, color: 'var(--text)' },
  clearSearchBtn: { position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 },
  filterSelect: { padding: '7px 10px', background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' },
  clearAll: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  selectionBar: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  selectionCount: { fontWeight: 700, color: 'var(--accent)' },
  iconBtn: { background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--text)', padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 8 },
  colMenu: { position: 'absolute', right: 0, top: '110%', zIndex: 20, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, minWidth: 180, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 4 },
  colMenuItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 4px', cursor: 'pointer' },
  densityGroup: { display: 'flex', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 },
  densityBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', padding: '4px 9px', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 6 },
  densityBtnActive: { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--accent)', padding: '4px 9px', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 6 },
  tableContainer: { maxHeight: 'calc(100vh - 300px)', minHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', position: 'relative' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 },
  stickyThead: { position: 'sticky', top: 0, zIndex: 10, background: 'var(--panel)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  th: { background: 'var(--panel)', borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, userSelect: 'none', whiteSpace: 'nowrap' },
  row: { transition: 'background-color 0.15s ease' },
  clickableRow: { cursor: 'pointer' },
  selectedRow: { background: 'var(--accent-soft)' },
  expandedRowHead: { background: 'var(--panel-2)' },
  td: { borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  rowLink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
  emptyTd: { padding: 40, textAlign: 'center' },
  emptyBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' },
  emptyDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, maxWidth: 360 },
  emptyBtn: { marginTop: 6, background: 'var(--accent)', color: 'var(--accent-ink)', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' },
  skeletonCell: { height: 16, borderRadius: 4, width: '80%' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'var(--muted)', padding: '4px 6px', flexWrap: 'wrap', gap: 8 },
  pager: { display: 'flex', alignItems: 'center', gap: 8 },
  pageBtn: { background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--text)', padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  pageInfo: { fontSize: 12, color: 'var(--muted)' },
  // mobile cards
  cardList: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: 14 },
  cardLink: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: 14, textDecoration: 'none', color: 'inherit', display: 'block' },
  cardInner: { display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitle: { fontSize: 14.5, fontWeight: 700, color: 'var(--text)' },
  cardRows: { display: 'flex', flexDirection: 'column', gap: 4 },
  cardRow: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 },
  cardLabel: { color: 'var(--muted)' },
  cardValue: { color: 'var(--text)', textAlign: 'right', minWidth: 0 },
};
