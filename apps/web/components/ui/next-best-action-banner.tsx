'use client';

import { type CSSProperties } from 'react';

interface NextBestActionBannerProps {
  status: string;
  recommendedAction: string;
  explanation: string;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}

export default function NextBestActionBanner({
  status,
  recommendedAction,
  explanation,
  actionLabel,
  onAction,
  busy = false,
}: NextBestActionBannerProps) {
  return (
    <div style={s.banner}>
      <div style={s.iconWrap}>⚡</div>
      <div style={s.content}>
        <div style={s.statusRow}>
          <span style={s.tag}>Next Best Action</span>
          <span style={s.statusBadge}>Status: {status}</span>
        </div>
        <div style={s.recTitle}>{recommendedAction}</div>
        <div style={s.explanation}>{explanation}</div>
      </div>
      {actionLabel && onAction && (
        <button type="button" style={s.ctaBtn} onClick={onAction} disabled={busy}>
          {busy ? 'Processing…' : actionLabel}
        </button>
      )}
    </div>
  );
}

const s = {
  banner: {
    background: 'linear-gradient(135deg, rgba(245, 166, 35, 0.12) 0%, rgba(255, 107, 53, 0.08) 100%)',
    border: '1px solid var(--accent-soft)',
    borderRadius: 12,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    boxShadow: '0 2px 12px rgba(245, 166, 35, 0.06)',
  } as CSSProperties,
  iconWrap: {
    fontSize: 20,
    background: 'var(--accent-soft)',
    borderRadius: 10,
    width: 38,
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as CSSProperties,
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  } as CSSProperties,
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,
  tag: {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--accent)',
  } as CSSProperties,
  statusBadge: {
    fontSize: 11,
    color: 'var(--muted)',
    background: 'var(--panel-2)',
    padding: '1px 6px',
    borderRadius: 4,
  } as CSSProperties,
  recTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text)',
  } as CSSProperties,
  explanation: {
    fontSize: 12.5,
    color: 'var(--muted)',
    lineHeight: 1.4,
  } as CSSProperties,
  ctaBtn: {
    background: 'var(--accent-grad)',
    border: 'none',
    color: 'var(--accent-ink)',
    fontWeight: 700,
    fontSize: 13,
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px var(--accent-soft)',
    flexShrink: 0,
  } as CSSProperties,
};
