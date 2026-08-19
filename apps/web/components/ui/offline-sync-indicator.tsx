'use client';

import { useEffect, useState } from 'react';
import { type OfflineSyncStatus, flushOfflineQueue, subscribeSyncStatus } from '../../lib/offline-sync';
import { clearFailedItems } from '../../lib/offline-store';

export default function OfflineSyncIndicator() {
  const [status, setStatus] = useState<OfflineSyncStatus>({
    isOnline: true,
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    conflictCount: 0,
  });
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setStatus);
    flushOfflineQueue().catch(() => undefined);
    return () => unsubscribe();
  }, []);

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      await flushOfflineQueue();
    } finally {
      setBusy(false);
    }
  };

  const handleClearFailed = async () => {
    if (confirm('Are you sure you want to delete unsynchronized failed records? This cannot be undone.')) {
      await clearFailedItems();
      await flushOfflineQueue();
      setShowModal(false);
    }
  };

  const totalUnsynced = status.pendingCount + status.syncingCount + status.failedCount;

  return (
    <>
      <div className="app-offline-sync" style={st.container}>
        {!status.isOnline ? (
          <span style={st.badgeOffline} title="Offline mode — drafts saved to local storage">
            📡 Offline • {totalUnsynced} draft{totalUnsynced === 1 ? '' : 's'}
          </span>
        ) : status.failedCount > 0 ? (
          <button type="button" style={st.badgeFailed} onClick={() => setShowModal(true)} title="Failed sync items require attention">
            🔴 {status.failedCount} Failed
          </button>
        ) : status.syncingCount > 0 || status.pendingCount > 0 ? (
          <button type="button" style={st.badgeSyncing} onClick={handleSyncNow} disabled={busy}>
            🔄 {busy ? 'Syncing…' : `${status.pendingCount + status.syncingCount} pending`}
          </button>
        ) : (
          <span style={st.badgeSynced} title="Connection online & all drafts synchronized">
            🟢 Synced
          </span>
        )}
      </div>

      {showModal && (
        <div style={st.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={st.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>🔴 Sync Attention Required</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
              {status.failedCount} offline record(s) failed to synchronize after multiple retry attempts.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowModal(false)}>
                Close
              </button>
              <button type="button" className="btn btn-danger" style={{ fontSize: 13, color: 'var(--bad)' }} onClick={handleClearFailed}>
                Clear Failed Records
              </button>
              <button type="button" className="btn btn-primary" style={{ fontSize: 13 }} onClick={handleSyncNow}>
                Retry Sync Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const st = {
  container: { display: 'flex', alignItems: 'center', marginRight: 10 },
  badgeSynced: {
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(16,185,129,0.12)',
    color: 'var(--good, #10b981)',
    border: '1px solid rgba(16,185,129,0.3)',
  },
  badgeOffline: {
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(245,158,11,0.14)',
    color: '#d97706',
    border: '1px solid rgba(245,158,11,0.35)',
  },
  badgeSyncing: {
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(59,130,246,0.14)',
    color: 'var(--accent, #3b82f6)',
    border: '1px solid rgba(59,130,246,0.35)',
    cursor: 'pointer',
  },
  badgeFailed: {
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(239,68,68,0.14)',
    color: 'var(--bad, #ef4444)',
    border: '1px solid rgba(239,68,68,0.35)',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalContent: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '20px 24px',
    maxWidth: 420,
    width: '90%',
  },
};
