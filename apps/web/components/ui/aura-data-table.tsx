'use client';

import React, { useState, useMemo, type CSSProperties } from 'react';

export interface AuraColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
  priority?: 'primary' | 'secondary' | 'muted';
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
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
}: AuraDataTableProps<T>) {
  const [density, setDensity] = useState<'comfortable' | 'compact'>(defaultDensity);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Filtered & Sorted Data computation
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const query = search.toLowerCase().trim();
    return data.filter((item) => {
      if (searchFields && searchFields.length > 0) {
        return searchFields.some((field) => {
          const val = item[field];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(query);
        });
      }
      return Object.values(item).some(
        (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(query)
      );
    });
  }, [data, search, searchFields]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      const cmp = valA < valB ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return;
    if (e.target.checked) {
      const allKeys = new Set(sortedData.map((row, idx) => keyExtractor(row, idx)));
      onSelectionChange(allKeys);
    } else {
      onSelectionChange(new Set());
    }
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

  return (
    <div style={st.container}>
      {/* Table Controls Toolbar */}
      <div style={st.toolbar}>
        {searchable && (
          <div style={st.searchBox}>
            <span style={st.searchIcon}>🔎</span>
            <input
              type="text"
              style={st.searchInput}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" style={st.clearSearchBtn} onClick={() => setSearch('')}>
                ✕
              </button>
            )}
          </div>
        )}

        <div style={st.toolbarRight}>
          {selectable && selectedKeys.size > 0 && (
            <div style={st.selectionBar}>
              <span style={st.selectionCount}>{selectedKeys.size} selected</span>
              {bulkActions}
            </div>
          )}

          {/* Density Selector */}
          <div style={st.densityGroup}>
            <button
              type="button"
              style={density === 'comfortable' ? st.densityBtnActive : st.densityBtn}
              onClick={() => setDensity('comfortable')}
              title="Comfortable row spacing"
            >
              ☰ Comfortable
            </button>
            <button
              type="button"
              style={density === 'compact' ? st.densityBtnActive : st.densityBtn}
              onClick={() => setDensity('compact')}
              title="Compact high-density row spacing"
            >
              ≡ Compact
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Scroll Container with Sticky Header */}
      <div style={st.tableContainer}>
        <table style={st.table}>
          <thead style={stickyHeader ? st.stickyThead : undefined}>
            <tr>
              {selectable && (
                <th style={{ ...st.th, width: 38, padding }}>
                  <input
                    type="checkbox"
                    checked={sortedData.length > 0 && selectedKeys.size === sortedData.length}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    ...st.th,
                    padding,
                    textAlign: col.align ?? 'left',
                    width: col.width,
                    cursor: col.sortable ? 'pointer' : 'default',
                  }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>{col.label}</span>
                    {col.sortable && sortKey === col.key && (
                      <span style={{ fontSize: 10, color: 'var(--accent)' }}>
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Loading Skeletons */}
            {loading && (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} style={st.row}>
                  {selectable && <td style={{ ...st.td, padding }}><div style={st.skeletonCell} /></td>}
                  {columns.map((col) => (
                    <td key={col.key} style={{ ...st.td, padding }}>
                      <div style={st.skeletonCell} />
                    </td>
                  ))}
                </tr>
              ))
            )}

            {/* Empty State */}
            {!loading && sortedData.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} style={st.emptyTd}>
                  <div style={st.emptyBox}>
                    <span style={st.emptyIcon}>📂</span>
                    <h4 style={st.emptyTitle}>{emptyTitle}</h4>
                    <p style={st.emptyDesc}>{emptyDescription}</p>
                    {onEmptyAction && emptyActionLabel && (
                      <button type="button" style={st.emptyBtn} onClick={onEmptyAction}>
                        + {emptyActionLabel}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {/* Data Rows */}
            {!loading &&
              sortedData.map((row, idx) => {
                const key = keyExtractor(row, idx);
                const isSelected = selectedKeys.has(key);
                const expanded = isRowExpanded ? isRowExpanded(row) : false;

                return (
                  <React.Fragment key={key}>
                    <tr
                      style={{
                        ...st.row,
                        ...(isSelected ? st.selectedRow : {}),
                        ...(expanded ? st.expandedRowHead : {}),
                      }}
                    >
                      {selectable && (
                        <td style={{ ...st.td, padding }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(key)}
                          />
                        </td>
                      )}
                      {columns.map((col) => {
                        const cellVal = row[col.key];
                        const isPrimary = col.priority === 'primary';
                        const isMuted = col.priority === 'muted';

                        return (
                          <td
                            key={col.key}
                            style={{
                              ...st.td,
                              padding,
                              textAlign: col.align ?? 'left',
                              fontWeight: isPrimary ? 700 : 400,
                              color: isMuted ? 'var(--muted)' : 'var(--text)',
                            }}
                          >
                            {col.render ? col.render(row, idx) : (cellVal ?? '—')}
                          </td>
                        );
                      })}
                    </tr>
                    {expanded && renderExpandedRow && (
                      <tr>
                        <td
                          colSpan={columns.length + (selectable ? 1 : 0)}
                          style={{ ...st.td, background: 'var(--panel-2)', padding: '12px 16px' }}
                        >
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

      {/* Row count footer */}
      <div style={st.footer}>
        <span>Showing {sortedData.length} of {data.length} line items</span>
        {search && <span>(Filtered from {data.length} total)</span>}
      </div>
    </div>
  );
}

const st = {
  container: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%' } as CSSProperties,
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 } as CSSProperties,
  searchBox: { position: 'relative', display: 'flex', alignItems: 'center', minWidth: 260 } as CSSProperties,
  searchIcon: { position: 'absolute', left: 10, fontSize: 13, color: 'var(--muted)' } as CSSProperties,
  searchInput: {
    width: '100%',
    padding: '7px 10px 7px 32px',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12.5,
    color: 'var(--text)',
  } as CSSProperties,
  clearSearchBtn: { position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 } as CSSProperties,
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 } as CSSProperties,
  selectionBar: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } as CSSProperties,
  selectionCount: { fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  densityGroup: { display: 'flex', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 } as CSSProperties,
  densityBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6 } as CSSProperties,
  densityBtnActive: { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--accent)', padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 6 } as CSSProperties,
  tableContainer: {
    maxHeight: 'calc(100vh - 280px)',
    minHeight: 250,
    overflow: 'auto',
    border: '1px solid var(--border)',
    borderRadius: 12,
    background: 'var(--panel)',
    position: 'relative',
  } as CSSProperties,
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 } as CSSProperties,
  stickyThead: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--panel)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  } as CSSProperties,
  th: {
    background: 'var(--panel)',
    borderBottom: '2px solid var(--border)',
    color: 'var(--muted)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    userSelect: 'none',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  row: { transition: 'background-color 0.15s ease' } as CSSProperties,
  selectedRow: { background: 'rgba(255, 193, 7, 0.08)' } as CSSProperties,
  expandedRowHead: { background: 'var(--panel-2)' } as CSSProperties,
  td: { borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  emptyTd: { padding: 40, textAlign: 'center' } as CSSProperties,
  emptyBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 } as CSSProperties,
  emptyIcon: { fontSize: 32 } as CSSProperties,
  emptyTitle: { fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' } as CSSProperties,
  emptyDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, maxWidth: 360 } as CSSProperties,
  emptyBtn: { marginTop: 6, background: 'var(--accent)', color: 'var(--accent-ink)', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' } as CSSProperties,
  skeletonCell: { height: 16, background: 'var(--panel-2)', borderRadius: 4, width: '80%' } as CSSProperties,
  footer: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', padding: '4px 6px' } as CSSProperties,
};
