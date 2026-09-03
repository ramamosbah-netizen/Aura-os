'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ClipboardCheck, FileCheck2, HardHat, PencilRuler, ShieldAlert, ShieldCheck } from 'lucide-react';
import styles from './pre-execution-client.module.css';

export type Signal = 'READY' | 'BLOCKED' | 'UNKNOWN';
export interface ReadinessRow {
  id: string;
  title: string;
  reference: string | null;
  status: string | null;
  plan: Signal;
  engineering: Signal;
  material: Signal;
  quality: Signal;
  hse: Signal;
  overall: Signal;
  reason: string;
}
type DisciplineKey = 'ALL' | 'plan' | 'engineering' | 'material' | 'quality' | 'hse';

const gates: Array<{ key: keyof Pick<ReadinessRow, 'plan' | 'engineering' | 'material' | 'quality' | 'hse'>; label: string; icon: typeof ShieldCheck }> = [
  { key: 'plan', label: 'Planning', icon: ClipboardCheck },
  { key: 'engineering', label: 'Engineering', icon: PencilRuler },
  { key: 'material', label: 'Material', icon: FileCheck2 },
  { key: 'quality', label: 'Quality', icon: ShieldCheck },
  { key: 'hse', label: 'HSE', icon: HardHat },
];

export default function PreExecutionClient({ rows }: { rows: ReadinessRow[] | null }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | Signal>('ALL');
  const [discipline, setDiscipline] = useState<DisciplineKey>('ALL');
  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !q || [row.title, row.reference, row.status].some((value) => value?.toLowerCase().includes(q));
      const matchesStatus = status === 'ALL' || row.overall === status;
      const matchesDiscipline = discipline === 'ALL' || row[discipline] === 'READY';
      return matchesQuery && matchesStatus && matchesDiscipline;
    });
  }, [rows, query, status, discipline]);

  const summary = rows ? {
    upcoming: rows.length,
    ready: rows.filter((row) => row.overall === 'READY').length,
    blocked: rows.filter((row) => row.overall === 'BLOCKED').length,
    unknown: rows.filter((row) => row.overall === 'UNKNOWN').length,
  } : null;

  return (
    <>
      <section className={styles.summary} aria-label="Pre-execution summary">
        <div className={styles.summaryLead}><span className={styles.kicker}>READINESS PROJECTION</span><h2>Can this work start?</h2><p>Review the evidence behind every gate before opening a work front. `UNKNOWN` means the source has not established the answer.</p></div>
        <div className={styles.summaryCards}>
          <Summary label="Upcoming work" value={summary ? String(summary.upcoming) : 'Unavailable'} />
          <Summary label="Ready" value={summary ? String(summary.ready) : 'Unavailable'} tone="good" />
          <Summary label="Blocked" value={summary ? String(summary.blocked) : 'Unavailable'} tone="bad" />
          <Summary label="Unknown" value={summary ? String(summary.unknown) : 'Unavailable'} tone="warn" />
        </div>
      </section>

      <section className={styles.flow} aria-label="Pre-execution flow">
        {['Mobilize', 'Plan / WBS', 'Prepare evidence', 'Readiness decision', 'Site execution'].map((step, index) => <div key={step} className={styles.flowStep}><b>0{index + 1}</b><span>{step}</span>{index < 4 && <i>→</i>}</div>)}
      </section>

      <section className={styles.panel} aria-labelledby="readiness-work-heading">
        <div className={styles.panelHead}><div><span className={styles.kicker}>BEFORE SITE EXECUTION</span><h2 id="readiness-work-heading">Work preparation</h2><p>Every cell links back to the authority that can establish or resolve it.</p></div><Link className={styles.action} href="/projects/schedule">Open planning workspace <ArrowUpRight size={14} aria-hidden /></Link></div>
        <div className={styles.filters}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project or reference…" aria-label="Find a project or reference" />
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Filter by readiness"><option value="ALL">All readiness</option><option value="READY">Ready</option><option value="BLOCKED">Blocked</option><option value="UNKNOWN">Unknown</option></select>
          <select value={discipline} onChange={(event) => setDiscipline(event.target.value as typeof discipline)} aria-label="Filter by discipline"><option value="ALL">All disciplines</option>{gates.map((gate) => <option key={gate.key} value={gate.key}>{gate.label} ready</option>)}</select>
          {(query || status !== 'ALL' || discipline !== 'ALL') && <button type="button" onClick={() => { setQuery(''); setStatus('ALL'); setDiscipline('ALL'); }}>Reset filters</button>}
        </div>
        {filtered === null ? <Empty icon={<ShieldAlert size={19} aria-hidden />} title="Readiness data unavailable" body="The project source could not be loaded. Retry from the Projects register or check the owning workspaces." href="/projects/projects" action="Open Projects" /> : filtered.length === 0 ? <Empty icon={<ShieldCheck size={19} aria-hidden />} title={rows?.length ? 'No work matches these filters' : 'No projects available for preparation'} body={rows?.length ? 'Reset the filters to see the full readiness projection.' : 'Readiness rows appear when an authoritative project record exists. No placeholder work has been added.'} href="/projects/projects" action="Open Projects" /> : <div className={styles.tableWrap}><table><thead><tr><th>Project / work</th>{gates.map((gate) => <th key={gate.key}>{gate.label}</th>)}<th>Decision</th><th>Source</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><th><Link href={`/project/${row.id}`}>{row.title}</Link><small>{row.reference ?? row.status ?? 'Project context'}</small></th>{gates.map((gate) => <td key={gate.key}><span className={`${styles.signal} ${styles[row[gate.key].toLowerCase()]}`}>{row[gate.key]}</span></td>)}<td><span className={`${styles.signal} ${styles[row.overall.toLowerCase()]}`}>{row.overall}</span><small className={styles.reason}>{row.reason}</small></td><td><Link href={`/project/${row.id}`} className={styles.sourceLink}>Project 360 <ArrowUpRight size={12} aria-hidden /></Link></td></tr>)}</tbody></table></div>}
      </section>

      <section className={styles.sources} aria-label="Readiness source links"><span className={styles.kicker}>OPEN THE SOURCE</span><div>{[['Plan & baseline', '/projects/schedule'], ['Engineering evidence', '/engineering'], ['Material path', '/procurement'], ['Quality controls', '/quality/control'], ['HSE controls', '/hse/control']].map(([label, href]) => <Link key={label} href={href}><span>{label}</span><ArrowUpRight size={13} aria-hidden /></Link>)}</div></section>
    </>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) { return <div className={styles.summaryCard}><span>{label}</span><strong className={tone ? styles[tone] : undefined}>{value}</strong></div>; }
function Empty({ icon, title, body, href, action }: { icon: ReactNode; title: string; body: string; href: string; action: string }) { return <div className={styles.empty}><span className={styles.emptyIcon}>{icon}</span><h3>{title}</h3><p>{body}</p><Link href={href}>{action} <ArrowUpRight size={13} aria-hidden /></Link></div>; }
