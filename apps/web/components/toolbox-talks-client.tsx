'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface ToolboxTalk {
  id: string;
  projectId: string;
  projectName: string | null;
  topic: string;
  conductedBy: string;
  talkDate: string;
  attendeeCount: number;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function ToolboxTalksClient({ initialTalks }: { initialTalks: ToolboxTalk[] }) {
  const [talks, setTalks] = useState(initialTalks);
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [topic, setTopic] = useState('');
  const [conductedBy, setConductedBy] = useState('');
  const [talkDate, setTalkDate] = useState(today());
  const [attendeeCount, setAttendeeCount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const todays = talks.filter((t) => t.talkDate === today());
    return { count: talks.length, todayCount: todays.length, todayAttendees: todays.reduce((s, t) => s + t.attendeeCount, 0) };
  }, [talks]);

  const record = async () => {
    setError('');
    if (!projectId.trim()) return setError('Project ID is required');
    if (!topic.trim() || !conductedBy.trim()) return setError('Topic and conductor are required');
    if (!(Number(attendeeCount) >= 1)) return setError('Attendees must be at least 1');
    try {
      const res = await fetch('/api/hse/toolbox-talks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, projectName: projectName || undefined, topic, conductedBy, talkDate, attendeeCount: Number(attendeeCount), notes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setTalks((prev) => [data, ...prev]);
      setTopic(''); setAttendeeCount(''); setNotes('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Total talks</div><div style={st.cardVal}>{totals.count}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Today</div><div style={st.cardVal}>{totals.todayCount}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Today&apos;s attendees</div><div style={st.cardVal}>{totals.todayAttendees}</div></div>
      </div>

      <div style={st.form}>
        <label style={st.label}>Project ID<input style={st.input} value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Project name<input style={st.input} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Tower A" /></label>
        <label style={st.label}>Topic<input style={st.input} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Working at height" /></label>
        <label style={st.label}>Conducted by<input style={st.input} value={conductedBy} onChange={(e) => setConductedBy(e.target.value)} placeholder="HSE Officer" /></label>
        <label style={st.label}>Date<input style={st.input} type="date" value={talkDate} onChange={(e) => setTalkDate(e.target.value)} /></label>
        <label style={st.label}>Attendees<input style={st.input} type="number" min="1" value={attendeeCount} onChange={(e) => setAttendeeCount(e.target.value)} placeholder="12" /></label>
        <label style={st.label}>Notes<input style={st.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="(optional)" /></label>
        <button style={st.btn} onClick={record}>Record</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Talk history</h2>
      {talks.length === 0 ? (
        <p style={st.muted}>No toolbox talks recorded yet.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Date</th><th style={st.th}>Topic</th><th style={st.th}>Conducted by</th><th style={st.th}>Project</th><th style={st.thR}>Attendees</th><th style={st.th}>Notes</th></tr></thead>
          <tbody>
            {talks.map((t) => (
              <tr key={t.id}>
                <td style={st.td}>{t.talkDate}</td>
                <td style={st.td}>{t.topic}</td>
                <td style={st.td}>{t.conductedBy}</td>
                <td style={st.td}>{t.projectName || t.projectId.slice(0, 8) + '…'}</td>
                <td style={st.tdR}>{t.attendeeCount}</td>
                <td style={st.td}>{t.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 22 } as CSSProperties,
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 130 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 22 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
