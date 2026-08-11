'use client';

import React, { useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Backup & Restore panel — the confirmation guards are real; the operations behind them are NOT
 * built yet (gap register N-04).
 *
 * This panel previously reported `✅ Database Restore executed successfully. Audit event logged:
 * {…}` while making zero API calls. Nothing was backed up, nothing was restored, and nothing
 * reached aura_audit_log — there is no server-side endpoint for either operation anywhere under
 * apps/api or core. A UI that claims an audit entry it did not write is worse than one that does
 * nothing, because it tells an operator the record exists.
 *
 * The typed-confirmation and justification guards are kept and exercised by
 * apps/web/e2e/admin-control-center.spec.ts — they are the part that works, and they are what the
 * real operation will need when it is built. Until then the panel says plainly that it cannot
 * execute.
 */
export default function BackupRestorePanel() {
  const [modalOpen, setModalOpen] = useState<'backup' | 'restore' | null>(null);
  const [justification, setJustification] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [operationResult, setOperationResult] = useState<string | null>(null);

  const REQUIRED_RESTORE_TEXT = 'RESTORE PRODUCTION';

  const handleConfirm = () => {
    if (!justification.trim()) {
      alert('Justification is required for the audit log.');
      return;
    }
    if (modalOpen === 'restore' && typedConfirmation !== REQUIRED_RESTORE_TEXT) {
      alert(`You must type "${REQUIRED_RESTORE_TEXT}" exactly to confirm this operation.`);
      return;
    }
    const opName = modalOpen === 'backup' ? 'Database Backup' : 'Database Restore';
    // Deliberately does NOT claim success. There is no endpoint behind either operation, so the
    // only honest outcome is to say the guard passed and the operation did not run.
    setOperationResult(
      `⚠️ ${opName} is not available. Your confirmation was accepted, but this operation has no ` +
        `backend yet — nothing was executed and no audit entry was written. Run backups and ` +
        `restores through the database runbook until this is wired.`,
    );
    setModalOpen(null);
    setJustification('');
    setTypedConfirmation('');
    setTimeout(() => setOperationResult(null), 10000);
  };

  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>💾 Database Backup & Restore</h3>
        <p style={st.desc}>
          Backup snapshots and guarded state restores, protected by mandatory justification and
          typed confirmation for destructive actions.
        </p>
        <p style={st.notWired}>
          ⚠️ <strong>Not wired yet.</strong> The confirmation guards below are live, but neither
          operation has a backend — nothing executes and nothing is written to the audit trail.
          Use the database runbook for real backups and restores.
        </p>
      </div>

      {operationResult && <div style={st.successBanner}>{operationResult}</div>}

      <div style={st.grid2}>
        {/* Backup card */}
        <div style={st.card}>
          <h4 style={st.cardTitle}>💾 Create Backup Snapshot</h4>
          <p style={st.cardDesc}>
            Create an immediate database snapshot. Requires a justification, which will be logged
            to the audit trail once this operation is implemented.
          </p>
          <button type="button" style={st.btnPrimary} onClick={() => setModalOpen('backup')}>
            💾 Backup Database Now
          </button>
        </div>

        {/* Restore card — danger zone */}
        <div style={st.dangerCard}>
          <div style={st.dangerHead}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <h4 style={{ margin: 0, color: 'var(--bad)' }}>Restore Database Snapshot</h4>
          </div>
          <p style={st.cardDesc}>
            <strong>DESTRUCTIVE OPERATION.</strong> Restoring a snapshot will overwrite all current
            production data. Requires typed confirmation and a mandatory justification.
          </p>
          <button type="button" style={st.btnDanger} onClick={() => setModalOpen('restore')}>
            ⚠️ Restore Database
          </button>
        </div>
      </div>

      {/* Safeguard Confirmation Modal */}
      {modalOpen && (
        <div style={st.modalOverlay}>
          <div style={st.modalBox}>
            <h3 style={{ marginTop: 0, color: modalOpen === 'restore' ? 'var(--bad)' : 'var(--text)' }}>
              {modalOpen === 'restore' ? '⚠️ DATABASE RESTORE' : '💾 DATABASE BACKUP'}
            </h3>

            {modalOpen === 'restore' && (
              <div style={st.warningBanner}>
                ⚠ This operation may overwrite production data. This action cannot be undone.
              </div>
            )}

            <label style={st.label}>
              Justification / Reason (Required for Audit Log):
            </label>
            <input
              style={st.modalInput}
              placeholder="e.g. Scheduled pre-maintenance backup #402 or Rollback due to data corruption incident..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              autoFocus={modalOpen === 'backup'}
            />

            {modalOpen === 'restore' && (
              <>
                <label style={{ ...st.label, marginTop: 14 }}>
                  Type <strong>{REQUIRED_RESTORE_TEXT}</strong> to confirm:
                </label>
                <input
                  style={{
                    ...st.modalInput,
                    borderColor: typedConfirmation === REQUIRED_RESTORE_TEXT ? 'var(--good)' : 'var(--bad)',
                  }}
                  placeholder={REQUIRED_RESTORE_TEXT}
                  value={typedConfirmation}
                  onChange={(e) => setTypedConfirmation(e.target.value)}
                  autoFocus
                />
              </>
            )}

            <div style={st.modalActions}>
              <button type="button" style={st.btnSecondary} onClick={() => { setModalOpen(null); setJustification(''); setTypedConfirmation(''); }}>
                Cancel
              </button>
              <button
                type="button"
                style={modalOpen === 'restore' ? st.btnDanger : st.btnPrimary}
                onClick={handleConfirm}
              >
                {modalOpen === 'restore' ? '⚠️ RESTORE DATABASE' : '💾 Confirm Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  panel: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  header: { marginBottom: 4 } as CSSProperties,
  title: { fontSize: 18, fontWeight: 700, margin: 0 } as CSSProperties,
  desc: { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.55 } as CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  dangerCard: { background: 'var(--panel)', border: '1px solid var(--bad)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  dangerHead: { display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  cardDesc: { fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 } as CSSProperties,
  ruleRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 } as CSSProperties,
  btnPrimary: { background: 'var(--accent)', color: 'var(--accent-ink)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', marginTop: 4 } as CSSProperties,
  btnSecondary: { background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  btnDanger: { background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 4 } as CSSProperties,
  // Warning, not success: this banner now reports that the guard passed and the operation did not run.
  successBanner: { background: 'var(--warn-soft)', border: '1px solid var(--warn)', color: 'var(--warn)', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, lineHeight: 1.5 } as CSSProperties,
  notWired: { background: 'var(--warn-soft)', border: '1px solid var(--warn)', color: 'var(--warn)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginTop: 10, lineHeight: 1.55 } as CSSProperties,
  warningBanner: { background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 8 } as CSSProperties,
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } as CSSProperties,
  modalBox: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, maxWidth: 500, width: '92%', boxShadow: 'var(--shadow-lg)' } as CSSProperties,
  modalInput: { width: '100%', padding: '8px 12px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', marginTop: 4, boxSizing: 'border-box' } as CSSProperties,
  label: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 2, marginTop: 10 } as CSSProperties,
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 } as CSSProperties,
};
