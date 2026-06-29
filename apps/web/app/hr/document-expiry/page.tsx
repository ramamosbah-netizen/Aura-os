import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface ExpiringDocument {
  employeeId: string;
  employeeName: string;
  documentType: 'visa' | 'work_permit';
  expiryDate: string;
  daysToExpiry: number;
  status: 'expired' | 'expiring' | 'valid';
}
interface Report {
  asOf: string;
  withinDays: number;
  items: ExpiringDocument[];
  expiredCount: number;
  expiringCount: number;
}

const labelOf = (t: string) => (t === 'work_permit' ? 'Work permit' : 'Visa');

export default async function DocumentExpiryPage() {
  const report = await getJson<Report>('/api/hr/document-expiry?withinDays=90');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Document Expiry</h1>
      <p style={st.sub}>
        Compliance watch-list of staff visas and work permits already expired or expiring within 90 days
        (active employees only), soonest first — so renewals are actioned before they lapse.
      </p>
      {report === null ? (
        <p style={st.muted}>API offline.</p>
      ) : (
        <>
          <div style={st.cards}>
            <div style={st.card}><div style={st.cardLabel}>Expired</div><div style={{ ...st.cardVal, color: '#dc2626' }}>{report.expiredCount}</div></div>
            <div style={st.card}><div style={st.cardLabel}>Expiring ≤90d</div><div style={{ ...st.cardVal, color: '#d97706' }}>{report.expiringCount}</div></div>
            <div style={st.card}><div style={st.cardLabel}>As of</div><div style={st.cardValSm}>{report.asOf}</div></div>
          </div>
          {report.items.length === 0 ? (
            <p style={st.muted}>No documents expired or expiring within {report.withinDays} days. ✓</p>
          ) : (
            <table style={st.table}>
              <thead><tr><th style={st.th}>Employee</th><th style={st.th}>Document</th><th style={st.th}>Expiry</th><th style={st.thR}>Days</th><th style={st.th}>Status</th></tr></thead>
              <tbody>
                {report.items.map((i, idx) => (
                  <tr key={`${i.employeeId}-${i.documentType}-${idx}`}>
                    <td style={st.td}>{i.employeeName}</td>
                    <td style={st.td}>{labelOf(i.documentType)}</td>
                    <td style={st.td}>{i.expiryDate}</td>
                    <td style={{ ...st.tdR, fontWeight: 600 }}>{i.daysToExpiry}</td>
                    <td style={{ ...st.td, color: i.status === 'expired' ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                      {i.status === 'expired' ? `expired ${-i.daysToExpiry}d ago` : 'expiring'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 20px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  cards: { display: 'flex', gap: 14, marginBottom: 20 } as CSSProperties,
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 130 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  cardValSm: { fontSize: 16, fontWeight: 600, marginTop: 6 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0', margin: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
