'use client';

import React from 'react';
import type { CSSProperties } from 'react';

/** SMS & WhatsApp gateway panel. */
export default function SmsWhatsappPanel() {
  return (
    <div style={st.panel}>
      <div style={st.header}>
        <h3 style={st.title}>💬 SMS & WhatsApp Gateway</h3>
        <p style={st.desc}>
          Configure SMS relay URL and WhatsApp Business API integration for real-time
          mobile notifications on critical events (SLA breaches, approvals, lead assignments).
        </p>
      </div>

      <div style={st.card}>
        <h4 style={st.cardTitle}>Gateway Status</h4>
        <div style={st.ruleRow}>
          <span>SMS Relay:</span>
          <span style={st.badgeInfo}>Available</span>
        </div>
        <div style={st.ruleRow}>
          <span>WhatsApp Business API:</span>
          <span style={st.badgeMuted}>Not Configured</span>
        </div>
      </div>
    </div>
  );
}

const st = {
  panel: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  header: { marginBottom: 4 } as CSSProperties,
  title: { fontSize: 18, fontWeight: 700, margin: 0 } as CSSProperties,
  desc: { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.55 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, margin: '0 0 10px' } as CSSProperties,
  ruleRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 } as CSSProperties,
  badgeInfo: { fontSize: 10, fontWeight: 800, background: 'var(--good-soft)', color: 'var(--good)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
  badgeMuted: { fontSize: 10, fontWeight: 800, background: 'var(--panel-2)', color: 'var(--muted)', padding: '2px 8px', borderRadius: 6 } as CSSProperties,
};
