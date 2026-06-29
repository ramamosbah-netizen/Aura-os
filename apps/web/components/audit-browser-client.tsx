'use client';

import { type CSSProperties, useEffect, useState } from 'react';

interface AuditEntry {
  id: string;
  tenant_id: string;
  company_id: string;
  actor_id: string;
  module: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
}

const MODULES = ['', 'crm', 'finance', 'procurement', 'projects', 'tendering', 'hr', 'inventory', 'subcontracts', 'engineering', 'hse', 'quality', 'fleet', 'assets'];
const ACTIONS = ['', 'created', 'updated', 'approved', 'rejected', 'deleted', 'submitted'];

/**
 * Audit Trail Browser — /admin/audit
 *
 * Interactive viewer for the kernel immutable audit log.
 * Supports filtering by module, action, actor, entity, and date range.
 *
 * Blueprint Reference: Phase 8 — Week 1-2, Task K2 (Audit Trail Browser UI)
 */
export default function AuditBrowserClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ module: '', action: '', actorId: '', entityType: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const limit = 25;

  async function fetchAudit() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.module) params.set('module', filters.module);
    if (filters.action) params.set('action', filters.action);
    if (filters.actorId) params.set('actorId', filters.actorId);
    if (filters.entityType) params.set('entityType', filters.entityType);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));

    try {
      const res = await fetch(`/api/audit?${params.toString()}`);
      const json = await res.json();
      setEntries(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      console.error('Failed to fetch audit log:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAudit(); }, [page]);

  function applyFilters() { setPage(0); fetchAudit(); }

  const actionColor = (action: string) => {
    switch (action) {
      case 'created': return 'var(--good)';
      case 'approved': return '#5b8cff';
      case 'rejected': case 'deleted': return 'var(--bad)';
      case 'updated': return '#f0a040';
      default: return 'var(--muted)';
    }
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={s.title}>🔍 Audit Trail Browser</h1>
        <span style={s.subtitle}>{total.toLocaleString()} records</span>
      </div>

      {/* ── Filter Bar ── */}
      <div style={s.filterBar}>
        <select style={s.select} value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })}>
          <option value="">All Modules</option>
          {MODULES.filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select style={s.select} value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
          <option value="">All Actions</option>
          {ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input style={s.input} type="text" placeholder="Actor ID" value={filters.actorId} onChange={(e) => setFilters({ ...filters, actorId: e.target.value })} />
        <input style={s.input} type="text" placeholder="Entity Type" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} />
        <input style={s.dateInput} type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input style={s.dateInput} type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <button type="button" style={s.filterBtn} onClick={applyFilters}>Apply</button>
      </div>

      {/* ── Data Table ── */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Timestamp</th>
              <th style={s.th}>Module</th>
              <th style={s.th}>Entity</th>
              <th style={s.th}>Action</th>
              <th style={s.th}>Actor</th>
              <th style={s.th}>Changes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={s.loading}>Loading audit entries…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={6} style={s.loading}>No audit entries found.</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id} style={s.row}>
                <td style={s.td}>{new Date(e.created_at).toLocaleString()}</td>
                <td style={s.td}><span style={s.badge}>{e.module}</span></td>
                <td style={s.td}><span style={s.entityTag}>{e.entity_type}:{e.entity_id}</span></td>
                <td style={s.td}><span style={{ ...s.actionBadge, color: actionColor(e.action) }}>{e.action}</span></td>
                <td style={s.td}>{e.actor_id}</td>
                <td style={s.td}><code style={s.code}>{JSON.stringify(e.changes)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div style={s.pagination}>
        <button type="button" style={s.pageBtn} onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>← Previous</button>
        <span style={s.pageInfo}>Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}</span>
        <button type="button" style={s.pageBtn} onClick={() => setPage(page + 1)} disabled={(page + 1) * limit >= total}>Next →</button>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = {
  container: { padding: '28px 32px', maxWidth: 1400 } as CSSProperties,
  header: { display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 20 } as CSSProperties,
  title: { fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' } as CSSProperties,
  subtitle: { fontSize: 13, color: 'var(--muted)' } as CSSProperties,
  filterBar: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, padding: 16, background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)' } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', width: 130 } as CSSProperties,
  dateInput: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', width: 150 } as CSSProperties,
  filterBtn: { background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' } as CSSProperties,
  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' } as CSSProperties,
  th: { textAlign: 'left', padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  td: { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  row: { transition: 'background 0.1s' } as CSSProperties,
  badge: { background: 'var(--panel-2)', padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500 } as CSSProperties,
  entityTag: { fontSize: 12, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  actionBadge: { fontWeight: 600, fontSize: 12, textTransform: 'uppercase' } as CSSProperties,
  code: { fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', maxWidth: 300, display: 'inline-block' } as CSSProperties,
  loading: { padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 } as CSSProperties,
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 } as CSSProperties,
  pageBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' } as CSSProperties,
  pageInfo: { fontSize: 13, color: 'var(--muted)' } as CSSProperties,
};
