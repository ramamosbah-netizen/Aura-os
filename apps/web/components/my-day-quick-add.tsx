'use client';

import { type CSSProperties, type FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Capture, without leaving the day. The second half of making My Day a command
// centre rather than a dashboard: you could not previously write anything down
// here — every capture meant navigating to Activities and losing the view you
// were reasoning about.

// Mirrors ActivityType in modules/crm/src/domain/activity.ts. It cannot be imported:
// apps/web depends on @aura/shared only, and the vocabulary lives in @aura/crm. The
// API validates against the domain list (@IsIn(ACTIVITY_TYPES)), so drift here fails
// loudly as a 400 — it can never persist a type the domain does not know.
const TYPES = [
  'task',
  'call',
  'follow_up',
  'whatsapp',
  'meeting',
  'site_visit',
  'technical_discovery',
  'demo',
  'presentation',
  'reminder',
  'email',
  'note',
] as const;

type ActivityType = (typeof TYPES)[number];

const label = (t: string) => t.replace(/_/g, ' ');

export default function MyDayQuickAdd({ assigneeId }: { assigneeId: string | null }) {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>('task');
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startRefresh] = useTransition();

  // A note records something that already happened — it is not outstanding work, so
  // it must not sit in "Now" forever waiting to be ticked. Everything else is work.
  const isNote = type === 'note';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = subject.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/crm/activities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          subject: trimmed,
          // The API defaults the assignee to the request actor, which is null in dev —
          // an unassigned activity never appears in anyone's day, so the capture would
          // silently vanish. Always claim it for the person typing.
          ...(assigneeId ? { assigneeId } : {}),
          ...(isNote ? { status: 'completed' } : dueDate ? { dueDate } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSubject('');
      startRefresh(() => router.refresh());
    } catch {
      setError('Could not save — nothing was created. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form style={st.form} onSubmit={submit}>
      <select
        style={st.select}
        value={type}
        aria-label="Activity type"
        onChange={(e) => setType(e.target.value as ActivityType)}
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {label(t)}
          </option>
        ))}
      </select>

      <input
        style={st.input}
        value={subject}
        placeholder={isNote ? 'Note to self…' : 'What needs doing?'}
        aria-label={isNote ? 'Note' : 'Task subject'}
        onChange={(e) => setSubject(e.target.value)}
      />

      {!isNote && (
        <input
          type="date"
          style={st.date}
          value={dueDate}
          aria-label="Due date"
          onChange={(e) => setDueDate(e.target.value)}
        />
      )}

      <button type="submit" style={st.btn} disabled={busy || !subject.trim()}>
        {busy ? 'Saving…' : isNote ? 'Log note' : 'Add'}
      </button>

      {error && (
        <span role="status" style={st.error}>
          {error}
        </span>
      )}
    </form>
  );
}

const st = {
  form: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  select: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '6px 8px',
    fontSize: 12.5,
    textTransform: 'capitalize',
  } as CSSProperties,
  input: {
    flex: 1,
    minWidth: 180,
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '6px 10px',
    fontSize: 13,
  } as CSSProperties,
  date: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '6px 8px',
    fontSize: 12.5,
  } as CSSProperties,
  btn: {
    background: 'var(--panel-2)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 7,
    padding: '6px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12, flexBasis: '100%' } as CSSProperties,
};
