import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import CommissioningActions from '@/components/commissioning-actions';

export const dynamic = 'force-dynamic';

interface Record_ {
  id: string; code: string; title: string; system: string; location: string | null; status: string;
  projectName: string | null; projectId: string; pointsTotal: number; pointsPassed: number;
  commissionedBy: string | null; witnessedBy: string | null; commissionedAt: string | null; createdAt: string;
}
interface TestItem { id: string; pointNo: string; description: string; expected: string | null; actual: string | null; result: string; remarks: string | null }
interface Punch { id: string; description: string; severity: string; status: string; resolution: string | null; location: string | null }
interface Detail { record: Record_; testItems: TestItem[]; punchItems: Punch[] }

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', in_progress: 'In Progress', tested: 'Tested', commissioned: 'Commissioned', failed: 'Failed' };
const LIFECYCLE = ['pending', 'in_progress', 'tested', 'commissioned'];
const resultStyle = (r: string): CSSProperties => ({ fontWeight: 600, color: r === 'pass' ? '#16a34a' : r === 'fail' ? '#dc2626' : 'var(--muted)' });

export default async function Commissioning360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getJson<Detail>(`/api/commissioning/records/${id}/detail`);
  if (!d?.record) notFound();
  const { record, testItems, punchItems } = d;
  const openPunch = punchItems.filter((p) => p.status === 'open');
  const allPassed = testItems.length > 0 && testItems.every((t) => t.result === 'pass');
  const stepIndex = LIFECYCLE.indexOf(record.status);

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/commissioning" style={st.crumbLink}>Commissioning</a>
        <span style={st.crumbSep}>/</span>
        <span>{record.code}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{record.code} <span style={st.sys}>{record.system}</span></h1>
          <p style={st.title}>{record.title}</p>
          <p style={st.meta}>{record.projectName ?? record.projectId}{record.location ? ` · ${record.location}` : ''} · {record.pointsPassed}/{record.pointsTotal} points passed</p>
        </div>
        <span style={st.statusBadge} data-testid="cx-status">{STATUS_LABEL[record.status] ?? record.status}</span>
      </div>

      <div style={st.steps}>
        {LIFECYCLE.map((s, i) => (
          <div key={s} style={st.step}>
            <span style={{ ...st.dot, ...(i <= stepIndex && stepIndex >= 0 ? st.dotOn : {}) }} />
            <span style={{ ...st.stepLabel, ...(i === stepIndex ? st.stepCurrent : {}) }}>{STATUS_LABEL[s]}</span>
            {i < LIFECYCLE.length - 1 && <span style={st.stepBar} />}
          </div>
        ))}
      </div>

      <CommissioningActions id={record.id} status={record.status} openPunch={openPunch.map((p) => ({ id: p.id, description: p.description, severity: p.severity }))} allPassed={allPassed} />

      <section style={st.section} data-testid="tab-tests">
        <h2 style={st.h2}>Test Sheet</h2>
        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead><tr>{['#', 'Description', 'Expected', 'Actual', 'Result', 'Remarks'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {testItems.length === 0 ? <tr><td style={st.tdMuted} colSpan={6}>No test points yet.</td></tr> :
                testItems.map((t) => (
                  <tr key={t.id}>
                    <td style={st.tdCode}>{t.pointNo}</td>
                    <td style={st.td}>{t.description}</td>
                    <td style={st.tdMuted}>{t.expected ?? '—'}</td>
                    <td style={st.tdMuted}>{t.actual ?? '—'}</td>
                    <td style={{ ...st.td, ...resultStyle(t.result) }}>{t.result}</td>
                    <td style={st.tdMuted}>{t.remarks ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={st.section} data-testid="tab-punch">
        <h2 style={st.h2}>Punch List</h2>
        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead><tr>{['Defect', 'Severity', 'Status', 'Resolution'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {punchItems.length === 0 ? <tr><td style={st.tdMuted} colSpan={4}>No defects raised.</td></tr> :
                punchItems.map((p) => (
                  <tr key={p.id}>
                    <td style={st.td}>{p.description}</td>
                    <td style={st.tdMuted}>{p.severity}</td>
                    <td style={{ ...st.td, color: p.status === 'open' ? '#d97706' : '#16a34a', fontWeight: 600 }}>{p.status}</td>
                    <td style={st.tdMuted}>{p.resolution ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {record.status === 'commissioned' && (
        <p style={st.signoff} data-testid="signoff">Signed off by {record.commissionedBy}, witnessed by {record.witnessedBy}{record.commissionedAt ? ` on ${new Date(record.commissionedAt).toLocaleDateString()}` : ''}. This unlocks project handover.</p>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 14 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 26, margin: '0 0 4px', letterSpacing: -0.5 } as CSSProperties,
  sys: { fontSize: 13, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase' } as CSSProperties,
  title: { margin: '0 0 4px', fontSize: 16 } as CSSProperties,
  meta: { margin: 0, color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  statusBadge: { padding: '5px 12px', borderRadius: 999, background: 'rgba(59,130,246,.14)', color: '#2563eb', fontWeight: 700, fontSize: 13 } as CSSProperties,
  steps: { display: 'flex', alignItems: 'center', gap: 4, margin: '18px 0', flexWrap: 'wrap' } as CSSProperties,
  step: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  dot: { width: 10, height: 10, borderRadius: 999, background: 'var(--border, #cbd5e1)', display: 'inline-block' } as CSSProperties,
  dotOn: { background: '#2563eb' } as CSSProperties,
  stepLabel: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  stepCurrent: { color: '#2563eb', fontWeight: 700 } as CSSProperties,
  stepBar: { width: 30, height: 2, background: 'var(--border, #e5e7eb)', margin: '0 2px' } as CSSProperties,
  section: { marginTop: 24 } as CSSProperties,
  h2: { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 8px' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '8px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '8px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  signoff: { marginTop: 20, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,.1)', color: '#16a34a', fontSize: 13 } as CSSProperties,
};
