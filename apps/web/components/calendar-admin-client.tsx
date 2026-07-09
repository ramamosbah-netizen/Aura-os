'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ErrorBanner, MatrixCell, Pill } from './admin-ui';

// Business calendar admin (Admin Center phase 2, Vol 15 §2.1). Weekend days edit as a
// Sun–Sat toggle matrix; public holidays and operational adjustments (Ramadan hours)
// manage inline. The kernel CalendarService drives working-day math everywhere.

export interface CalendarDef {
  id: string;
  companyId: string | null;
  name: string;
  weekends: number[];
  standardHoursPerDay: number;
}
interface Holiday {
  date: string;
  description: string | null;
}
interface Adjustment {
  id: string;
  startDate: string;
  endDate: string;
  workingHoursPerDay: number;
  description: string | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarAdminClient({ initialCalendars }: { initialCalendars: CalendarDef[] }) {
  const [calendars, setCalendars] = useState<CalendarDef[]>(initialCalendars);
  const [selected, setSelected] = useState<string | null>(initialCalendars[0]?.id ?? null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [nName, setNName] = useState('');
  const [hDate, setHDate] = useState('');
  const [hDesc, setHDesc] = useState('');
  const [aStart, setAStart] = useState('');
  const [aEnd, setAEnd] = useState('');
  const [aHours, setAHours] = useState(6);
  const [aDesc, setADesc] = useState('Ramadan working hours');

  const current = calendars.find((c) => c.id === selected) ?? null;

  const fail = async (res: Response, fallback: string): Promise<void> => {
    const d = await res.json().catch(() => ({}));
    setErr(d.message ?? d.error ?? fallback);
  };

  const refreshCalendars = async (): Promise<void> => {
    const res = await fetch('/api/admin/calendar', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setCalendars(d);
    }
  };

  const loadSub = async (id: string): Promise<void> => {
    const [h, a] = await Promise.all([
      fetch(`/api/admin/calendar/${encodeURIComponent(id)}/holidays`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/admin/calendar/${encodeURIComponent(id)}/adjustments`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
    ]);
    setHolidays(Array.isArray(h) ? h : []);
    setAdjustments(Array.isArray(a) ? a : []);
  };

  useEffect(() => {
    if (selected) void loadSub(selected);
  }, [selected]);

  const saveCalendar = async (cal: Partial<CalendarDef> & { name: string }): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cal),
      });
      if (!res.ok) return fail(res, 'Failed to save calendar');
      const saved = await res.json().catch(() => null);
      await refreshCalendars();
      if (!selected && saved?.id) setSelected(saved.id);
    } finally {
      setBusy(false);
    }
  };

  const toggleWeekend = (day: number): void => {
    if (!current) return;
    const weekends = current.weekends.includes(day)
      ? current.weekends.filter((d) => d !== day)
      : [...current.weekends, day].sort();
    void saveCalendar({ ...current, weekends });
  };

  const setHours = (hours: number): void => {
    if (!current) return;
    void saveCalendar({ ...current, standardHoursPerDay: hours });
  };

  const addCalendar = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    await saveCalendar({ name: nName.trim(), weekends: [0, 6], standardHoursPerDay: 8 });
    setNName('');
  };

  const addHoliday = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/${encodeURIComponent(selected)}/holidays`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: hDate, description: hDesc }),
      });
      if (!res.ok) return fail(res, 'Failed to add holiday');
      setHDate('');
      setHDesc('');
      await loadSub(selected);
    } finally {
      setBusy(false);
    }
  };

  const removeHoliday = async (date: string): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/${encodeURIComponent(selected)}/holidays?date=${encodeURIComponent(date)}`, { method: 'DELETE' });
      if (!res.ok) return fail(res, 'Failed to remove holiday');
      await loadSub(selected);
    } finally {
      setBusy(false);
    }
  };

  const addAdjustment = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/${encodeURIComponent(selected)}/adjustments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: aStart, endDate: aEnd, workingHoursPerDay: aHours, description: aDesc }),
      });
      if (!res.ok) return fail(res, 'Failed to add adjustment');
      setAStart('');
      setAEnd('');
      await loadSub(selected);
    } finally {
      setBusy(false);
    }
  };

  const removeAdjustment = async (id: string): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/${encodeURIComponent(selected)}/adjustments?adjustmentId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) return fail(res, 'Failed to remove adjustment');
      await loadSub(selected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>

      {/* Calendar picker + create */}
      <section style={st.card}>
        <div style={st.pickerRow}>
          {calendars.map((c) => (
            <button
              key={c.id}
              style={{ ...st.calTab, ...(c.id === selected ? st.calTabOn : {}) }}
              onClick={() => setSelected(c.id)}
            >
              {c.name}
            </button>
          ))}
          <form onSubmit={addCalendar} style={st.addForm}>
            <input className="input" style={st.addInput} placeholder="new calendar (e.g. UAE Standard)" value={nName} onChange={(e) => setNName(e.target.value)} required />
            <button className="btn" disabled={busy} type="submit">+ Add</button>
          </form>
        </div>

        {current && (
          <div style={st.weekRow}>
            <div>
              <div style={st.lbl}>Weekend days</div>
              <table className="adm-matrix" style={{ width: 'auto' }}>
                <thead>
                  <tr>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr>
                </thead>
                <tbody>
                  <tr>
                    {DAYS.map((_, i) => (
                      <td key={i}>
                        <MatrixCell
                          on={current.weekends.includes(i)}
                          onToggle={() => toggleWeekend(i)}
                          disabled={busy}
                          title={current.weekends.includes(i) ? `${DAYS[i]} is a weekend` : `Make ${DAYS[i]} a weekend`}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <div style={st.lbl}>Standard hours / day</div>
              <input
                className="input"
                style={{ width: 90, textAlign: 'center' }}
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={current.standardHoursPerDay}
                onChange={(e) => setHours(Number(e.target.value) || 8)}
              />
            </div>
          </div>
        )}
      </section>

      {current && (
        <div style={st.twoCol}>
          {/* Holidays */}
          <section style={st.card}>
            <h2 style={st.h2}>Public holidays <Pill tone="muted">{holidays.length}</Pill></h2>
            <table style={st.table}>
              <tbody>
                {holidays.length === 0 ? (
                  <tr><td style={st.empty}>No holidays recorded.</td></tr>
                ) : (
                  holidays.map((h) => (
                    <tr key={h.date}>
                      <td style={st.tdDate}>{h.date}</td>
                      <td style={st.td}>{h.description || '—'}</td>
                      <td style={st.tdRight}>
                        <button className="btn btn-ghost" style={st.xBtn} disabled={busy} onClick={() => void removeHoliday(h.date)}>✕</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <form onSubmit={addHoliday} style={st.subForm}>
              <input className="input" style={{ width: 150 }} type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} required />
              <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="e.g. Eid Al Fitr" value={hDesc} onChange={(e) => setHDesc(e.target.value)} />
              <button className="btn btn-primary" disabled={busy} type="submit">Add</button>
            </form>
          </section>

          {/* Adjustments */}
          <section style={st.card}>
            <h2 style={st.h2}>Hour adjustments <Pill tone="muted">{adjustments.length}</Pill></h2>
            <p style={st.hint}>Reduced-hour periods (e.g. Ramadan) — timesheets and schedules use these caps.</p>
            <table style={st.table}>
              <tbody>
                {adjustments.length === 0 ? (
                  <tr><td style={st.empty}>No adjustment periods.</td></tr>
                ) : (
                  adjustments.map((a) => (
                    <tr key={a.id}>
                      <td style={st.tdDate}>{a.startDate} → {a.endDate}</td>
                      <td style={st.td}><Pill tone="warn">{a.workingHoursPerDay}h/day</Pill> {a.description || ''}</td>
                      <td style={st.tdRight}>
                        <button className="btn btn-ghost" style={st.xBtn} disabled={busy} onClick={() => void removeAdjustment(a.id)}>✕</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <form onSubmit={addAdjustment} style={st.subForm}>
              <input className="input" style={{ width: 140 }} type="date" title="start" value={aStart} onChange={(e) => setAStart(e.target.value)} required />
              <input className="input" style={{ width: 140 }} type="date" title="end" value={aEnd} onChange={(e) => setAEnd(e.target.value)} required />
              <input className="input" style={{ width: 70, textAlign: 'center' }} type="number" min={0} max={24} step={0.5} title="hours/day" value={aHours} onChange={(e) => setAHours(Number(e.target.value))} />
              <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="description" value={aDesc} onChange={(e) => setADesc(e.target.value)} />
              <button className="btn btn-primary" disabled={busy} type="submit">Add</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

const st = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    background: 'var(--panel)',
    boxShadow: 'var(--shadow-sm)',
  } as CSSProperties,
  pickerRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 } as CSSProperties,
  calTab: {
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: 'var(--muted)',
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 9,
    cursor: 'pointer',
  } as CSSProperties,
  calTabOn: { background: 'var(--accent-grad)', color: 'var(--accent-ink)', borderColor: 'transparent', fontWeight: 700 } as CSSProperties,
  addForm: { display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' } as CSSProperties,
  addInput: { width: 220, padding: '7px 10px', fontSize: 12.5 } as CSSProperties,
  weekRow: { display: 'flex', gap: 28, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' } as CSSProperties,
  lbl: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 } as CSSProperties,
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: '0 0 10px', display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  td: { padding: '7px 8px', borderTop: '1px solid var(--border)' } as CSSProperties,
  tdDate: { padding: '7px 8px', borderTop: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12, whiteSpace: 'nowrap' } as CSSProperties,
  tdRight: { padding: '7px 0', borderTop: '1px solid var(--border)', textAlign: 'right', width: 40 } as CSSProperties,
  empty: { padding: '10px 8px', color: 'var(--muted)' } as CSSProperties,
  xBtn: { fontSize: 12, padding: '2px 8px' } as CSSProperties,
  subForm: { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
};
