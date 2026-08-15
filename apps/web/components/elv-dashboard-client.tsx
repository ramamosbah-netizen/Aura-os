'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { summariseElv, type ElvAttentionItem } from '@/lib/elv-dashboard';
import { DataState } from '@/components/ui/data-state';
import type { ElvDevice } from '@/lib/elv';

const REGISTER = '/elv/devices';

const sevColor = (s: ElvAttentionItem['severity']) =>
  s === 'critical' ? 'var(--bad)' : s === 'warn' ? 'var(--warn)' : 'var(--info)';

function Kpi({ label, value, tone, href }: { label: string; value: string | number; tone?: string; href?: string }) {
  const body = (
    <div style={st.kpi}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={{ ...st.kpiValue, color: tone ?? 'var(--text)' }}>{value}</div>
    </div>
  );
  return href ? <Link href={href} style={st.kpiLink}>{body}</Link> : body;
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div style={st.barTrack} aria-hidden>
      <div style={{ ...st.barFill, width: `${Math.min(100, Math.max(0, pct))}%`, background: tone }} />
    </div>
  );
}

export default function ElvDashboardClient({ devices }: { devices: ElvDevice[] }) {
  const s = summariseElv(devices);
  const progTone = s.commissionedPct >= 80 ? 'var(--good)' : s.commissionedPct >= 40 ? 'var(--warn)' : 'var(--bad)';

  return (
    <div style={st.page}>
      <div style={st.head}>
        <div>
          <h1 style={st.h1}>ELV Overview</h1>
          <p style={st.sub}>Commissioning progress across the device schedule — where the systems stand and what is blocking handover.</p>
        </div>
        <Link href={REGISTER} style={st.registerLink}>Open device register →</Link>
      </div>

      <DataState empty={s.total === 0} subject="ELV devices" emptyTitle="No ELV devices yet"
        emptyDescription="Add devices in the register to see commissioning progress here."
        emptyAction={<Link href={REGISTER} style={st.registerLink}>Go to the register →</Link>}>

        <div style={st.kpiRow}>
          <Kpi label="Devices" value={s.live} href={REGISTER} />
          <Kpi label="Commissioned" value={`${s.commissioned} · ${s.commissionedPct}%`} tone={progTone} href={`${REGISTER}?elv_f_status=commissioned`} />
          <Kpi label="Faulty" value={s.byStatus.faulty} tone={s.byStatus.faulty ? 'var(--bad)' : undefined} href={`${REGISTER}?elv_f_status=faulty`} />
          <Kpi label="Not started" value={s.byStatus.planned} tone={s.byStatus.planned ? 'var(--warn)' : undefined} href={`${REGISTER}?elv_f_status=planned`} />
        </div>

        <div style={st.grid}>
          <section style={st.card}>
            <div style={st.cardHead}>Systems — commissioning progress</div>
            {s.systems.length === 0 ? (
              <p style={st.muted}>No systems with devices yet.</p>
            ) : (
              <div style={st.sysList}>
                {s.systems.map((sys) => {
                  const tone = sys.pct >= 80 ? 'var(--good)' : sys.pct >= 40 ? 'var(--warn)' : 'var(--accent)';
                  return (
                    <Link key={sys.system} href={`${REGISTER}?elv_f_system=${sys.system}`} style={st.sysRow}>
                      <div style={st.sysTop}>
                        <span style={st.sysName}>{sys.label}</span>
                        <span style={st.sysCount}>
                          {sys.commissioned}/{sys.total} · {sys.pct}%
                          {sys.faulty > 0 && <span style={st.faultyTag}> · {sys.faulty} faulty</span>}
                        </span>
                      </div>
                      <Bar pct={sys.pct} tone={tone} />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <aside style={st.card}>
            <div style={st.cardHead}>Needs attention</div>
            {s.attention.length === 0 ? (
              <p style={st.muted}>Nothing flagged — the schedule is clean.</p>
            ) : (
              <ul style={st.attnList}>
                {s.attention.map((a, i) => {
                  const row = (
                    <div style={st.attnRow}>
                      <span style={{ ...st.attnDot, background: sevColor(a.severity) }} aria-hidden />
                      <span style={st.attnLabel}>{a.label}</span>
                      {a.href && <span style={st.attnGo}>→</span>}
                    </div>
                  );
                  return (
                    <li key={i}>
                      {a.href ? <Link href={a.href} style={st.attnLink}>{row}</Link> : row}
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </DataState>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontSize: 26, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'var(--muted)', margin: 0, maxWidth: 640, lineHeight: 1.5 },
  registerLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  kpiLink: { textDecoration: 'none', color: 'inherit' },
  kpi: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', background: 'var(--panel)' },
  kpiLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(240px, 1fr)', gap: 16, alignItems: 'start' },
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--panel)' },
  cardHead: { fontSize: 13, fontWeight: 700, marginBottom: 12 },
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 },
  sysList: { display: 'flex', flexDirection: 'column', gap: 12 },
  sysRow: { display: 'block', textDecoration: 'none', color: 'inherit' },
  sysTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 5, flexWrap: 'wrap' },
  sysName: { fontSize: 13, fontWeight: 600 },
  sysCount: { fontSize: 12, color: 'var(--muted)' },
  faultyTag: { color: 'var(--bad)', fontWeight: 600 },
  barTrack: { height: 8, borderRadius: 999, background: 'var(--panel-2)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, transition: 'width .3s ease' },
  attnList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  attnLink: { textDecoration: 'none', color: 'inherit' },
  attnRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  attnDot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  attnLabel: { flex: 1, minWidth: 0 },
  attnGo: { color: 'var(--accent)', fontWeight: 700 },
};
