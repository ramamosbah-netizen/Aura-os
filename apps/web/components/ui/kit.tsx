'use client';

/**
 * AURA shared UI kit — the single source of truth for buttons, inputs, cards, KPI tiles,
 * badges and tables, built ONLY on the real design tokens (--text / --panel / --accent /
 * --border / --muted / --good / --bad / --warn). Screens should compose these instead of
 * re-declaring inline style objects or reaching for undefined tokens (--fg / --surface) or
 * hardcoded hex — the drift that made the operational screens look unprofessional and, on
 * some, rendered input text invisible. One kit → consistent buttons, layout and colour, and
 * correct light/dark theming everywhere.
 */

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TdHTMLAttributes,
} from 'react';

export type Tone = 'primary' | 'neutral' | 'danger' | 'ghost';

/* ─────────────────────────── Button ─────────────────────────── */

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  borderRadius: 7,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid transparent',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  transition: 'filter .12s ease, opacity .12s ease',
};

const btnSize = {
  sm: { padding: '5px 11px', fontSize: 12 } as CSSProperties,
  md: { padding: '8px 16px', fontSize: 14 } as CSSProperties,
};

const btnTone: Record<Tone, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' },
  neutral: { background: 'var(--panel)', color: 'var(--text)', borderColor: 'var(--border-strong)' },
  danger: { background: 'var(--bad)', color: '#fff', borderColor: 'var(--bad)' },
  ghost: { background: 'transparent', color: 'var(--text)', borderColor: 'transparent' },
};

export function Button({
  tone = 'primary',
  size = 'md',
  style,
  disabled,
  children,
  ...rest
}: {
  tone?: Tone;
  size?: 'sm' | 'md';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...btnBase,
        ...btnSize[size],
        ...btnTone[tone],
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Field + inputs ─────────────────────────── */

const controlStyle: CSSProperties = {
  padding: '7px 10px',
  borderRadius: 7,
  border: '1px solid var(--border-strong)',
  fontSize: 14,
  background: 'var(--panel)',
  color: 'var(--text)',
  minWidth: 120,
  fontFamily: 'inherit',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: 13,
  fontWeight: 600,
  gap: 4,
  color: 'var(--text)',
};

/** A labelled form control wrapper — label above the control, consistent spacing. */
export function Field({ label, children, style }: { label: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ ...labelStyle, ...style }}>
      {label}
      {children}
    </label>
  );
}

export function Input({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} style={{ ...controlStyle, ...style }} />;
}

export function Select({ style, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} style={{ ...controlStyle, cursor: 'pointer', ...style }}>
      {children}
    </select>
  );
}

/* ─────────────────────────── Card ─────────────────────────── */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--panel)',
        padding: 16,
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────── KPI tile ─────────────────────────── */

const toneColor = { good: 'var(--good)', bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' } as const;

export function KpiTile({
  label,
  value,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'good' | 'bad' | 'warn' | 'info';
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 18px',
        minWidth: 130,
        background: 'var(--panel)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: tone ? toneColor[tone] : 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}

/* ─────────────────────────── Badge ─────────────────────────── */

const badgeTone = {
  good: { bg: 'var(--good-soft)', fg: 'var(--good)' },
  bad: { bg: 'var(--bad-soft)', fg: 'var(--bad)' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  info: { bg: 'var(--info-soft)', fg: 'var(--info)' },
  neutral: { bg: 'var(--accent-soft)', fg: 'var(--muted)' },
} as const;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof badgeTone }) {
  const t = badgeTone[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
      }}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────── Table primitives ─────────────────────────── */

export function Table({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...style }}>{children}</table>;
}

export function Th({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{ textAlign: align, padding: '8px 12px', borderBottom: '2px solid var(--border)', fontWeight: 600, color: 'var(--muted)' }}>
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', style, ...rest }: { align?: 'left' | 'right' | 'center' } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: align, color: 'var(--text)', verticalAlign: 'top', ...style }}>
      {children}
    </td>
  );
}
