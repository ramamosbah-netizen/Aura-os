'use client';

import { type CSSProperties, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// My Day's work lists, made actionable. The page itself stays a server component —
// this is the client island it embeds, the same shape as <RecordChrome>.
//
// The rule this closes: My Day is where the day is DECIDED, so the two decisions a
// salesperson makes most (I've started this / I'm done with this) must not cost a
// navigation. Every row used to be a link out, which meant acting on your own day
// destroyed the view of it.

export type When = 'OVERDUE' | 'TODAY' | 'THIS_WEEK' | 'LATER' | 'UNDATED';

export interface Task {
  id: string;
  type: string;
  subject: string;
  when: When;
  dueDate: string | null;
  started: boolean;
  relatedType: string | null;
  relatedName: string | null;
  href: string | null;
}

/** Optimistic per-row state. `null` = untouched, server truth stands. */
type RowState = 'starting' | 'started' | 'completing' | 'completed' | 'failed';

export default function MyDayTasks({ tasks, empty }: { tasks: Task[]; empty: string }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, RowState>>({});
  // router.refresh() re-runs the server page so the KPI counts above these lists
  // stay honest after an action — without it the row would update but the
  // "overdue / due today" numbers would silently lie.
  const [, startRefresh] = useTransition();

  async function act(task: Task, action: 'start' | 'complete') {
    const pending: RowState = action === 'start' ? 'starting' : 'completing';
    const settled: RowState = action === 'start' ? 'started' : 'completed';
    setState((s) => ({ ...s, [task.id]: pending }));
    try {
      const res = await fetch(`/api/crm/activities/${task.id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState((s) => ({ ...s, [task.id]: settled }));
      startRefresh(() => router.refresh());
    } catch {
      // Revert to server truth rather than leaving a lie on screen.
      setState((s) => ({ ...s, [task.id]: 'failed' }));
    }
  }

  if (tasks.length === 0) return <p style={st.empty}>{empty}</p>;

  return (
    <ul style={st.list}>
      {tasks.map((t) => {
        const row = state[t.id];
        const done = row === 'completed';
        const busy = row === 'starting' || row === 'completing';
        // NOTE: 'starting' deliberately does NOT count as started — otherwise the Start
        // button unmounts the instant it is clicked and its "…" pending state is never
        // seen. It stays mounted, disabled, until the server confirms.
        const started = row === 'started' || (t.started && !row);
        const late = t.when === 'OVERDUE' && !done;

        return (
          <li key={t.id} style={{ ...st.row, ...(done ? st.rowDone : {}) }}>
            <span style={st.type}>{t.type.replace(/_/g, ' ')}</span>

            <span style={st.subject}>
              <span style={done ? st.subjectDone : undefined}>{t.subject}</span>
              {started && !done && <Chip text="started" tone="warn" />}
              {done && <Chip text="done" tone="good" />}
              {row === 'failed' && <Chip text="could not save — retry" tone="bad" />}
            </span>

            <span style={st.related}>
              {t.href && t.relatedName ? (
                <Link href={t.href} style={st.link}>
                  {t.relatedName}
                </Link>
              ) : (
                t.relatedName
              )}
            </span>

            <span style={{ ...st.due, color: late ? 'var(--bad)' : 'var(--muted)' }}>
              {t.dueDate ?? 'no date'}
            </span>

            <span style={st.actions}>
              {!done && !started && (
                <button
                  type="button"
                  style={st.btn}
                  disabled={busy}
                  aria-label={`Start: ${t.subject}`}
                  onClick={() => act(t, 'start')}
                >
                  {row === 'starting' ? '…' : 'Start'}
                </button>
              )}
              {!done && (
                <button
                  type="button"
                  style={{ ...st.btn, ...st.btnPrimary }}
                  disabled={busy}
                  aria-label={`Mark done: ${t.subject}`}
                  onClick={() => act(t, 'complete')}
                >
                  {row === 'completing' ? '…' : 'Done'}
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ text, tone }: { text: string; tone: 'bad' | 'warn' | 'good' }) {
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'good' ? 'var(--good)' : 'var(--accent)';
  return <span style={{ ...st.chip, color, borderColor: color }}>{text}</span>;
}

const st = {
  list: { listStyle: 'none', margin: 0, padding: 0 } as CSSProperties,
  // 5th column added for the actions; the first four match the page's read-only rows
  // so the lists still line up with "My leads" / "My deals" below them.
  row: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr 1fr 92px 118px',
    gap: 10,
    alignItems: 'center',
    padding: '8px 0',
    borderTop: '1px solid var(--border)',
    fontSize: 13,
  } as CSSProperties,
  rowDone: { opacity: 0.55 } as CSSProperties,
  type: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  subject: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' } as CSSProperties,
  subjectDone: { textDecoration: 'line-through' } as CSSProperties,
  related: { color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  due: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  actions: { display: 'flex', gap: 6, justifyContent: 'flex-end' } as CSSProperties,
  btn: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border-strong)',
    borderRadius: 7,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  } as CSSProperties,
  btnPrimary: { borderColor: 'var(--accent)', color: 'var(--accent)' } as CSSProperties,
  chip: { borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '1px 7px', fontSize: 10, whiteSpace: 'nowrap' } as CSSProperties,
  empty: { color: 'var(--muted)', margin: 0, fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
