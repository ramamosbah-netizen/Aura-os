import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
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
  nextCalibrationDate: string | null;
  nextInspectionDate: string | null;
}

interface Maintenance {
  id: string;
  date: string;
  description: string;
  cost: number;
  status: string;
}

interface Disposal {
  id: string;
  method: string;
  disposalDate: string;
  proceeds: number;
  bookValue: number;
  gainLoss: number;
}

interface Detail {
  asset: Asset;
  maintenance: Maintenance[];
  openMaintenance: number;
  disposal: Disposal | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  maintenance: 'In Maintenance',
  inactive: 'Inactive',
  disposed: 'Disposed',
};

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '3px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700 };
  const map: Record<string, CSSProperties> = {
    active: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    maintenance: { background: 'rgba(245,158,11,.16)', color: '#d97706' },
    inactive: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
    disposed: { background: 'rgba(100,116,139,.18)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.inactive) };
}

const money = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function Asset360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<Detail>(`/api/assets/${id}/detail`);
  if (!detail?.asset) notFound();

  const { asset, maintenance, openMaintenance, disposal } = detail;
  const disposable = asset.status !== 'disposed' && openMaintenance === 0;

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/assets/control" style={st.crumbLink}>Assets</a>
        <span style={st.crumbSep}>/</span>
        <a href="/assets/register" style={st.crumbLink}>Register</a>
        <span style={st.crumbSep}>/</span>
        <span>{asset.serialNumber}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{asset.name}</h1>
          <p style={st.sub}>
            {asset.serialNumber} · {asset.category} · purchased {asset.purchaseDate} for {money(asset.purchaseCost)}
          </p>
        </div>
        <span style={statusStyle(asset.status)} data-testid="asset-status">
          {STATUS_LABEL[asset.status] ?? asset.status}
        </span>
      </div>

      {/* ── Disposal readiness ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Disposal readiness</h2>
        {asset.status === 'disposed' ? (
          <p style={st.muted} data-testid="asset-disposed-note">
            This asset has left the register. A disposed asset never returns — its book value was
            settled by the disposal below, and depreciation stops there.
          </p>
        ) : disposable ? (
          <p style={st.gateOk} data-testid="asset-disposable">
            ✓ Ready to dispose — no maintenance is open against this asset.
          </p>
        ) : (
          <p style={st.gateBad} data-testid="asset-disposal-blocked">
            ✕ Cannot be disposed — {openMaintenance} maintenance job{openMaintenance === 1 ? '' : 's'} still
            open. Work booked against a disposed asset would post cost to something no longer owned.
          </p>
        )}
      </section>

      {/* ── Maintenance history ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Maintenance</h2>
        {maintenance.length === 0 ? (
          <p style={st.muted} data-testid="asset-no-maintenance">No maintenance recorded.</p>
        ) : (
          <table style={st.table} data-testid="asset-maintenance">
            <thead>
              <tr>{['Date', 'Description', 'Cost', 'Status'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {maintenance.map((m) => (
                <tr key={m.id}>
                  <td style={st.tdMuted}>{m.date}</td>
                  <td style={st.td}>{m.description}</td>
                  <td style={st.tdMuted}>{money(m.cost)}</td>
                  <td style={st.td}>
                    <span style={m.status === 'completed' ? st.chipDone : st.chipOpen}>{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Disposal record ── */}
      {disposal ? (
        <section style={st.panel}>
          <h2 style={st.h2}>Disposal</h2>
          <dl style={st.dl} data-testid="asset-disposal">
            <div style={st.dRow}><dt style={st.dt}>Method</dt><dd style={st.dd}>{disposal.method}</dd></div>
            <div style={st.dRow}><dt style={st.dt}>Date</dt><dd style={st.dd}>{disposal.disposalDate}</dd></div>
            <div style={st.dRow}><dt style={st.dt}>Proceeds</dt><dd style={st.dd}>{money(disposal.proceeds)}</dd></div>
            <div style={st.dRow}><dt style={st.dt}>Book value</dt><dd style={st.dd}>{money(disposal.bookValue)}</dd></div>
            <div style={st.dRow}>
              <dt style={st.dt}>Gain / loss</dt>
              <dd style={{ ...st.dd, color: disposal.gainLoss >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                {money(disposal.gainLoss)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* ── Compliance dates ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Warranty &amp; compliance</h2>
        <dl style={st.dl}>
          <div style={st.dRow}><dt style={st.dt}>Warranty expiry</dt><dd style={st.dd}>{asset.warrantyExpiry ?? '—'}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Next calibration</dt><dd style={st.dd}>{asset.nextCalibrationDate ?? '—'}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Next inspection</dt><dd style={st.dd}>{asset.nextInspectionDate ?? '—'}</dd></div>
        </dl>
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10, flexWrap: 'wrap' } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: 0, maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
  panel: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: '18px 20px', marginBottom: 18 } as CSSProperties,
  h2: { fontSize: 16, margin: '0 0 10px' } as CSSProperties,
  gateOk: { color: '#16a34a', fontWeight: 600, fontSize: 13.5, margin: 0 } as CSSProperties,
  gateBad: { color: '#dc2626', fontWeight: 600, fontSize: 13.5, margin: 0 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13.5, margin: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdMuted: { padding: '8px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  chipOpen: { padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: 'rgba(245,158,11,.16)', color: '#d97706' } as CSSProperties,
  chipDone: { padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: 'rgba(34,197,94,.15)', color: '#16a34a' } as CSSProperties,
  dl: { margin: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  dRow: { display: 'flex', gap: 12 } as CSSProperties,
  dt: { width: 140, color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  dd: { margin: 0, fontSize: 13.5 } as CSSProperties,
};
