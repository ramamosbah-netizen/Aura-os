'use client';

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';

// My Day is now nine cards deep, and not every role reads the same day: a sales
// engineer does not care about the approvals queue, a commercial manager does not
// work the appointment list. This lets each person switch cards off.
//
// Preference is stored per browser, in localStorage, on the precedent already set
// by the record tab strip (`aura.record-tabs`). It deliberately does NOT go to
// /api/workspace/config — that endpoint is TENANT-scoped, so writing a personal
// layout there would rearrange My Day for every user in the company. A real
// per-user preferences API is the proper home for this; until one exists, a
// browser-local preference is honest about what it is.

const STORE = 'aura.my-day-hidden';

export interface DaySection {
  key: string;
  /** Shown on the toggle chip. */
  label: string;
  node: ReactNode;
}

function readHidden(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export default function MyDayLayout({ sections }: { sections: DaySection[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  // Read after mount, never during render: the server has no localStorage, and
  // seeding state from it directly would desync hydration. The cost is that a
  // hidden card is briefly visible on first paint — the same trade the tab strip
  // makes. Correctness over the flash.
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setHidden(readHidden());
    setReady(true);
  }, []);

  function persist(next: string[]) {
    setHidden(next);
    try {
      window.localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // A full or blocked storage quota must not take the page down — the layout
      // simply stops being remembered.
    }
  }

  const toggle = (key: string) =>
    persist(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);

  // Before the preference is read, render everything: that is what the server sent.
  const visible = ready ? sections.filter((s) => !hidden.includes(s.key)) : sections;
  const hiddenCount = ready ? hidden.filter((k) => sections.some((s) => s.key === k)).length : 0;

  return (
    <>
      <div style={st.bar}>
        <button
          type="button"
          style={st.link}
          aria-expanded={editing}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? 'Done' : 'Customise'}
          {hiddenCount > 0 && !editing ? ` · ${hiddenCount} hidden` : ''}
        </button>
        {editing && hiddenCount > 0 && (
          <button type="button" style={st.link} onClick={() => persist([])}>
            Show all
          </button>
        )}
      </div>

      {editing && (
        <div style={st.chips}>
          {sections.map((s) => {
            const off = hidden.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                style={off ? { ...st.chip, ...st.chipOff } : st.chip}
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
              >
                {off ? '＋' : '✓'} {s.label}
              </button>
            );
          })}
        </div>
      )}

      {visible.map((s) => (
        <div key={s.key}>{s.node}</div>
      ))}

      {visible.length === 0 && (
        <p style={st.empty}>
          Every card is hidden. Use <b>Customise</b> above to bring some back.
        </p>
      )}
    </>
  );
}

const st = {
  bar: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginBottom: 8 } as CSSProperties,
  link: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 4px',
    textDecoration: 'underline',
  } as CSSProperties,
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 } as CSSProperties,
  chip: {
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--accent)',
    borderRadius: 999,
    padding: '4px 11px',
    fontSize: 12,
    cursor: 'pointer',
  } as CSSProperties,
  chipOff: { color: 'var(--muted)', borderColor: 'var(--border)' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
