'use client';

import React, { type CSSProperties } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

export interface AuditDiffField {
  fieldName: string;
  label: string;
  oldValue: any;
  newValue: any;
}

export interface AuraAuditDiffViewerProps {
  title?: string;
  entityId: string;
  entityType: string;
  actorName?: string;
  timestamp?: string;
  reason?: string;
  diffs: AuditDiffField[];
  isOpen: boolean;
  onClose: () => void;
}

export default function AuraAuditDiffViewer({
  title = 'Field-Level Audit Diff Viewer',
  entityId,
  entityType,
  actorName = 'System / Admin',
  timestamp,
  reason,
  diffs,
  isOpen,
  onClose,
}: AuraAuditDiffViewerProps) {
  if (!isOpen) return null;

  return (
    <div style={st.overlay}>
      <div style={st.modalBox}>
        {/* Header */}
        <div style={st.modalHead}>
          <div>
            <div style={st.eyebrow}>AUDIT TRAIL INSPECTOR</div>
            <h3 style={st.title}>{title}</h3>
            <div style={st.meta}>
              <span>Entity: <strong>{entityType} ({entityId})</strong></span> ·{' '}
              <span>Actor: <strong>{actorName}</strong></span>
              {timestamp && <span> · <strong>{new Date(timestamp).toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })}</strong></span>}
            </div>
          </div>
          <button type="button" style={st.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Reason / Justification Tag if present */}
        {reason && (
          <div style={st.reasonBox}>
            <span style={{ fontWeight: 700 }}>Audit Reason:</span> {reason}
          </div>
        )}

        {/* Diffs Table: Side-by-Side Comparison */}
        <div style={st.diffWrap}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={{ ...st.th, width: '25%' }}>Field Name</th>
                <th style={{ ...st.th, width: '37.5%', background: 'var(--bad-soft, rgba(220,53,69,0.08))', color: 'var(--bad)' }}>
                  🔴 Previous Value (Before)
                </th>
                <th style={{ ...st.th, width: '37.5%', background: 'var(--good-soft, rgba(40,167,69,0.08))', color: 'var(--good)' }}>
                  🟢 New Value (After)
                </th>
              </tr>
            </thead>
            <tbody>
              {diffs.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ ...st.td, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                    No field changes recorded in this audit payload.
                  </td>
                </tr>
              ) : (
                diffs.map((diff, i) => (
                  <tr key={i} style={st.row}>
                    <td style={st.tdField}>{diff.label || diff.fieldName}</td>
                    <td style={st.tdOld}>
                      <span style={st.oldBadge}>{String(diff.oldValue ?? '—')}</span>
                    </td>
                    <td style={st.tdNew}>
                      <span style={st.newBadge}>{String(diff.newValue ?? '—')}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div style={st.modalFoot}>
          <button type="button" style={st.btnSecondary} onClick={onClose}>
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  } as CSSProperties,
  modalBox: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    maxWidth: 720,
    width: '92%',
    padding: 20,
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as CSSProperties,
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } as CSSProperties,
  eyebrow: { fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: 'var(--accent)', marginBottom: 2 } as CSSProperties,
  title: { fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: 'var(--text)' } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  closeBtn: { background: 'none', border: 'none', fontSize: 18, color: 'var(--muted)', cursor: 'pointer' } as CSSProperties,
  reasonBox: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12.5,
    color: 'var(--text)',
  } as CSSProperties,
  diffWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  row: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdField: { padding: '10px 12px', fontWeight: 600, color: 'var(--text)' } as CSSProperties,
  tdOld: { padding: '10px 12px', background: 'rgba(220, 53, 69, 0.03)' } as CSSProperties,
  tdNew: { padding: '10px 12px', background: 'rgba(40, 167, 69, 0.03)' } as CSSProperties,
  oldBadge: {
    color: 'var(--bad)',
    textDecoration: 'line-through',
    background: 'var(--bad-soft, rgba(220,53,69,0.1))',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  } as CSSProperties,
  newBadge: {
    color: 'var(--good)',
    background: 'var(--good-soft, rgba(40,167,69,0.1))',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
  } as CSSProperties,
  modalFoot: { display: 'flex', justifyContent: 'flex-end', marginTop: 4 } as CSSProperties,
  btnSecondary: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
};
