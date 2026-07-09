'use client';

import type { CSSProperties, ReactNode } from 'react';

// Small client-side UI kit for the Administration Center (phase-1.5 professional pass).
// Pairs with the server-safe chrome in admin-chrome.tsx. All styling rides the theme
// tokens + the .adm-* classes in globals.css.

/** Accessible on/off switch (role=switch). */
export function Toggle({
  on,
  onChange,
  disabled,
  title,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="adm-switch"
      title={title}
      disabled={disabled}
      onClick={() => onChange(!on)}
    />
  );
}

/** A matrix cell: filled = direct ✓, soft = inherited (e.g. via wildcard), empty = off. */
export function MatrixCell({
  on,
  inherited,
  onToggle,
  disabled,
  title,
}: {
  on: boolean;
  inherited?: boolean;
  onToggle: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="adm-cell"
      data-on={on || undefined}
      data-inherit={!on && inherited ? true : undefined}
      disabled={disabled}
      title={title}
      onClick={onToggle}
    >
      ✓
    </button>
  );
}

/** Status pill with a semantic tone. */
export function Pill({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'info' | 'muted'; children: ReactNode }) {
  const tones: Record<string, CSSProperties> = {
    good: { background: 'var(--good-soft)', color: 'var(--good)' },
    warn: { background: 'var(--warn-soft)', color: 'var(--warn)' },
    bad: { background: 'var(--bad-soft)', color: 'var(--bad)' },
    info: { background: 'var(--info-soft)', color: 'var(--info)' },
    muted: { background: 'var(--panel-2)', color: 'var(--muted)' },
  };
  return (
    <span className="adm-pill" style={tones[tone]}>
      {children}
    </span>
  );
}

/** Inline error banner shared by the admin clients. */
export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--bad)',
        borderRadius: 10,
        background: 'var(--bad-soft)',
        color: 'var(--bad)',
        marginBottom: 14,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
