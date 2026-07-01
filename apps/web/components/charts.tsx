'use client';

import { type CSSProperties } from 'react';

const PALETTE = ['#2563eb', '#16a34a', '#d9883b', '#dc2626', '#7c3aed', '#0891b2', '#64748b'];
const fmt = (n: number) => n.toLocaleString('en-AE', { maximumFractionDigits: 0 });

/** Simple dependency-free SVG bar chart. */
export function BarChart({ data, height = 180, unit = '' }: { data: { label: string; value: number }[]; height?: number; unit?: string }) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const bw = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${100}`} preserveAspectRatio="none" style={{ width: '100%', height }} role="img">
      {data.map((d, i) => {
        const h = (Math.abs(d.value) / max) * 82;
        return <rect key={i} x={i * bw + bw * 0.15} y={90 - h} width={bw * 0.7} height={h} fill={PALETTE[i % PALETTE.length]} rx={0.6} />;
      })}
    </svg>
  );
}

/** Bar chart with labels + values (HTML, avoids SVG text scaling issues). */
export function BarList({ data, unit = 'AED' }: { data: { label: string; value: number }[]; unit?: string }) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div style={s.barList}>
      {data.map((d, i) => (
        <div key={i} style={s.barRow}>
          <span style={s.barLabel}>{d.label}</span>
          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: `${(Math.abs(d.value) / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
          </div>
          <span style={s.barValue}>{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Dependency-free SVG donut. */
export function Donut({ data, size = 160 }: { data: { label: string; value: number }[]; size?: number }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  if (total <= 0) return <Empty />;
  const r = 40, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={s.donutWrap}>
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }} role="img">
        {data.map((d, i) => {
          const frac = Math.max(0, d.value) / total;
          const seg = <circle key={i} cx={50} cy={50} r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={16}
            strokeDasharray={`${frac * c} ${c}`} strokeDashoffset={-offset * c} transform="rotate(-90 50 50)" />;
          offset += frac;
          return seg;
        })}
      </svg>
      <div style={s.legend}>
        {data.map((d, i) => (
          <div key={i} style={s.legendItem}><span style={{ ...s.dot, background: PALETTE[i % PALETTE.length] }} />{d.label}: <b>{fmt(d.value)}</b></div>
        ))}
      </div>
    </div>
  );
}

function Empty() { return <div style={s.empty}>No data</div>; }

const s = {
  barList: { display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  barRow: { display: 'grid', gridTemplateColumns: '90px 1fr 90px', alignItems: 'center', gap: 8, fontSize: 12.5 } as CSSProperties,
  barLabel: { color: 'var(--muted)' } as CSSProperties,
  barTrack: { background: 'var(--panel-2)', borderRadius: 6, height: 14, overflow: 'hidden' } as CSSProperties,
  barFill: { height: '100%', borderRadius: 6 } as CSSProperties,
  barValue: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  donutWrap: { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  legend: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 } as CSSProperties,
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' } as CSSProperties,
  dot: { width: 10, height: 10, borderRadius: 3, display: 'inline-block' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' } as CSSProperties,
};
