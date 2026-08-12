import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Asset {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  status: string;
  warrantyExpiry: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  maintenance: 'In Maintenance',
  inactive: 'Inactive',
  disposed: 'Disposed',
};

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
  const map: Record<string, CSSProperties> = {
    active: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    maintenance: { background: 'rgba(245,158,11,.16)', color: '#d97706' },
    inactive: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
    disposed: { background: 'rgba(100,116,139,.18)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.inactive) };
}

const money = (n: number): string => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');

export default async function AssetRegisterPage() {
  const assets = (await getJson<Asset[]>('/api/assets')) ?? [];
  const rank = (s: string): number => (s === 'disposed' ? 1 : 0);
  const rows = [...assets].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));

  const inMaintenance = rows.filter((a) => a.status === 'maintenance').length;

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/assets/control" style={st.crumbLink}>Assets</a>
        <span style={st.crumbSep}>/</span>
        <span>Register</span>
      </div>
      <h1 style={st.h1}>Asset Register</h1>
      <p style={st.sub}>
        Every asset and where it is in its life. Scheduling maintenance takes an asset out of
        service and completing the last open job returns it. An asset{' '}
        <strong>cannot be disposed while maintenance is still open</strong> against it, and once
        disposed it never returns — the disposal is the accounting event that settles its book value.
      </p>

      {inMaintenance > 0 ? (
        <div style={st.info} data-testid="assets-in-maintenance">
          {inMaintenance} asset{inMaintenance === 1 ? '' : 's'} currently out of service for maintenance.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div style={st.empty} data-testid="asset-register-empty">
          No assets yet. Register one from the <a href="/assets/control" style={st.crumbLink}>Assets</a> workspace.
        </div>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table} data-testid="asset-register">
            <thead>
              <tr>
                {['Asset', 'Serial', 'Category', 'Purchased', 'Cost', 'Status', ''].map((h) => (
                  <th key={h} style={st.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} style={a.status === 'disposed' ? st.rowMuted : undefined}>
                  <td style={st.tdName}>{a.name}</td>
                  <td style={st.tdCode}>{a.serialNumber}</td>
                  <td style={st.tdMuted}>{a.category}</td>
                  <td style={st.tdMuted}>{a.purchaseDate}</td>
                  <td style={st.tdMuted}>{money(a.purchaseCost)}</td>
                  <td style={st.td}>
                    <span style={statusStyle(a.status)} data-testid={`asset-status-${a.id}`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td style={st.td}>
                    <a href={`/assets/register/${a.id}`} style={st.open} data-testid={`open-asset-${a.id}`}>
                      Open →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.5 } as CSSProperties,
  info: { border: '1px solid rgba(245,158,11,.4)', background: 'rgba(245,158,11,.07)', borderRadius: 10, padding: '11px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdName: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600 } as CSSProperties,
  tdCode: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontFamily: 'var(--mono, ui-monospace, monospace)', color: 'var(--muted)' } as CSSProperties,
  tdMuted: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  rowMuted: { opacity: 0.55 } as CSSProperties,
  open: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
