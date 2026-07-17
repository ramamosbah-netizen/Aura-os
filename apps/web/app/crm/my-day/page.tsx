import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import { InsightsPanel, type Insight } from '../../../components/crm/record-shell';

export const dynamic = 'force-dynamic';

// My Day — the page a salesperson opens FIRST. It answers one decision: "where do I
// focus today?" AI opens the conversation (the "AI noticed" rail composes facts from
// the whole deal chain — CRM, quotations, tenders, contracts, signals) and every row
// links back to the record that owns the fact. The day is where you SEE the work.

type When = 'OVERDUE' | 'TODAY' | 'THIS_WEEK' | 'LATER' | 'UNDATED';

interface Task {
  id: string; type: string; subject: string; when: When; dueDate: string | null;
  started: boolean; relatedType: string | null; relatedName: string | null; href: string | null;
}
interface DayLead {
  id: string; name: string; companyName: string | null; status: string; gaps: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | null; nextAction: string | null;
  nextActionDue: string | null; href: string;
}
interface DayOpp {
  id: string; title: string; value: number; stage: string; closeDate: string | null;
  gaps: string[]; nextAction: string | null; nextActionDue: string | null; href: string;
}
interface MyDay {
  userId: string; date: string;
  counts: {
    overdue: number; today: number; thisWeek: number; meetingsToday: number;
    leadsNeedingAttention: number; opportunitiesNeedingAttention: number;
  };
  meetings: Task[]; now: Task[]; next: Task[]; leads: DayLead[]; opportunities: DayOpp[];
}

interface QuotationLite {
  id: string; quoteNumber: string; customerName: string; status: string;
  total: number; validUntil: string | null; convertedContractId: string | null;
}
interface TenderLite {
  id: string; title: string; status: string; value: number; submissionDeadline: string | null;
}
interface ContractLite { id: string; title: string; status: string; value: number }
interface RadarLite {
  counts: { open: number };
  signals: Array<{ id: string; title: string; confidence: number; accountName: string | null }>;
}

const QUOTE_OPEN = ['draft', 'internal_review', 'approved', 'sent', 'under_negotiation'];
const TENDER_ACTIVE = ['draft', 'qualifying', 'estimating', 'priced'];

const GAP_LABEL: Record<string, string> = {
  SLA_BREACHED: 'first-response SLA breached',
  FOLLOW_UP_OVERDUE: 'follow-up overdue',
  UNASSIGNED: 'unassigned',
  ASSIGNMENT_NOT_ACCEPTED: 'not accepted',
  STALE: 'gone quiet',
  QUALIFICATION_STALLED: 'qualification stalled',
  NO_NEXT_ACTIVITY: 'nothing scheduled',
  'no-next-action': 'no next action',
  'no-owner': 'no owner',
  'no-due-date': 'no due date',
  overdue: 'next action overdue',
};

const money = (n: number): string => `AED ${n.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

/** The AI rail — pure composition over facts the deal chain already owns, ranked worst-first.
 * It opens the conversation ("AI noticed: …"); the user decides. */
function composeAiNoticed(day: MyDay, quotes: QuotationLite[], tenders: TenderLite[], contracts: ContractLite[], radar: RadarLite | null): Insight[] {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const bad: Insight[] = [];
  const warn: Insight[] = [];
  const act: Insight[] = [];

  if (day.counts.overdue > 0) {
    bad.push({ tone: 'bad', title: `${day.counts.overdue} task${day.counts.overdue > 1 ? 's are' : ' is'} overdue`, detail: 'Late work erodes trust fastest — clear these first.', action: { label: 'Open activities', href: '/crm/activities' } });
  }
  const slaLead = day.leads.find((l) => l.severity === 'HIGH');
  if (slaLead) {
    bad.push({ tone: 'bad', title: `Lead ${slaLead.name} is breaching`, detail: slaLead.gaps.map((g) => GAP_LABEL[g] ?? g).join(', '), action: { label: 'Open lead', href: slaLead.href } });
  }

  const lapsed = quotes.filter((q) => QUOTE_OPEN.includes(q.status) && q.validUntil && q.validUntil < today);
  const expiring = quotes.filter((q) => QUOTE_OPEN.includes(q.status) && q.validUntil && q.validUntil >= today && q.validUntil <= soon);
  if (lapsed.length) {
    bad.push({ tone: 'bad', title: `${lapsed.length} quotation${lapsed.length > 1 ? 's have' : ' has'} lapsed validity`, detail: `${lapsed[0].quoteNumber} · ${lapsed[0].customerName} — revise or re-confirm.`, action: { label: 'Open quotation', href: `/crm/quotations/${lapsed[0].id}` } });
  }
  if (expiring.length) {
    warn.push({ tone: 'warn', title: `${expiring[0].quoteNumber} expires ${expiring[0].validUntil}`, detail: `${expiring[0].customerName} · ${money(expiring[0].total)} — chase a decision this week${expiring.length > 1 ? ` (+${expiring.length - 1} more expiring)` : ''}.`, action: { label: 'Open quotation', href: `/crm/quotations/${expiring[0].id}` } });
  }

  const dueTenders = tenders
    .filter((t) => TENDER_ACTIVE.includes(t.status) && t.submissionDeadline && t.submissionDeadline >= today && t.submissionDeadline <= soon)
    .sort((a, b) => (a.submissionDeadline! < b.submissionDeadline! ? -1 : 1));
  for (const t of dueTenders.slice(0, 2)) {
    warn.push({ tone: 'warn', title: `Tender closes ${t.submissionDeadline}`, detail: `${t.title} · ${money(t.value)} · still ${t.status}.`, action: { label: 'Open tender', href: `/tendering/tenders/${t.id}` } });
  }

  const bigGapDeal = day.opportunities[0];
  if (bigGapDeal) {
    warn.push({ tone: 'warn', title: `${money(bigGapDeal.value)} deal is drifting`, detail: `${bigGapDeal.title} — ${bigGapDeal.gaps.map((g) => GAP_LABEL[g] ?? g).join(', ')}.`, action: { label: 'Open deal', href: bigGapDeal.href } });
  }

  const accepted = quotes.filter((q) => q.status === 'accepted' && !q.convertedContractId);
  if (accepted.length) {
    act.push({ tone: 'good', title: `${accepted[0].quoteNumber} was accepted — convert it`, detail: `${accepted[0].customerName} · ${money(accepted[0].total)} → contract, then the project starts itself.`, action: { label: 'Convert to contract', href: `/crm/quotations/${accepted[0].id}` } });
  }
  const toSign = contracts.filter((c) => c.status === 'draft');
  if (toSign.length) {
    act.push({ tone: 'accent', title: `${toSign.length} contract${toSign.length > 1 ? 's' : ''} awaiting signature`, detail: `${toSign[0].title} · ${money(toSign[0].value)} — activating creates the delivery project.`, action: { label: 'Open contract', href: `/contracts/contracts/${toSign[0].id}` } });
  }
  const strongSignals = (radar?.signals ?? []).filter((s) => s.confidence >= 70);
  if (strongSignals.length) {
    act.push({ tone: 'accent', title: `${strongSignals.length} strong signal${strongSignals.length > 1 ? 's' : ''} on the radar`, detail: `${strongSignals[0].title}${strongSignals[0].accountName ? ` · ${strongSignals[0].accountName}` : ''} — worth promoting today.`, action: { label: 'Open radar', href: '/crm/leads' } });
  }

  const all = [...bad, ...warn, ...act];
  if (all.length === 0) {
    all.push({ tone: 'good', title: 'Clear desk', detail: 'Nothing late, lapsing, or drifting anywhere on your deal chain today.' });
  }
  return all.slice(0, 8);
}

function Chip({ text, tone }: { text: string; tone: 'bad' | 'warn' | 'plain' }) {
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--accent)' : 'var(--muted)';
  return <span style={{ ...st.chip, color, borderColor: color }}>{text}</span>;
}

function TaskRow({ t }: { t: Task }) {
  const late = t.when === 'OVERDUE';
  return (
    <li style={st.row}>
      <span style={st.type}>{t.type.replace(/_/g, ' ')}</span>
      <span style={st.subject}>
        {t.subject}
        {t.started && <Chip text="started" tone="warn" />}
      </span>
      <span style={st.related}>
        {t.href && t.relatedName ? <Link href={t.href} style={st.link}>{t.relatedName}</Link> : t.relatedName}
      </span>
      <span style={{ ...st.due, color: late ? 'var(--bad)' : 'var(--muted)' }}>
        {t.dueDate ?? 'no date'}
      </span>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={st.empty}>{text}</p>;
}

export default async function MyDayPage() {
  // The API answers for the caller; when the session carries no actor (dev), resolve
  // the workspace user and ask for their day explicitly.
  const me = await getJson<{ username: string }>('/api/workspace/me');
  const [day, quotes, tenders, contracts, radar] = await Promise.all([
    getJson<MyDay>(`/api/crm/my-day${me?.username ? `?userId=${encodeURIComponent(me.username)}` : ''}`),
    getJson<QuotationLite[]>('/api/crm/quotations'),
    getJson<TenderLite[]>('/api/tendering/tenders'),
    getJson<ContractLite[]>('/api/contracts/contracts'),
    getJson<RadarLite>('/api/crm/signals/radar'),
  ]);

  if (!day?.counts) {
    return (
      <div style={st.page}>
        <h1 style={st.h1}>My Day</h1>
        <Empty text="Your day could not be loaded — the CRM API did not answer." />
      </div>
    );
  }

  const c = day.counts;
  const quiet =
    c.overdue + c.today + c.thisWeek + c.leadsNeedingAttention + c.opportunitiesNeedingAttention === 0;
  const noticed = composeAiNoticed(day, quotes ?? [], tenders ?? [], contracts ?? [], radar ?? null);

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const desk = [
    { n: radar?.counts.open ?? 0, label: 'Signals to triage', href: '/crm/leads' },
    { n: (quotes ?? []).filter((q) => QUOTE_OPEN.includes(q.status) && q.validUntil && q.validUntil <= soon).length, label: 'Quotes expiring ≤7d', href: '/crm/quotations' },
    { n: (tenders ?? []).filter((t) => TENDER_ACTIVE.includes(t.status) && t.submissionDeadline && t.submissionDeadline >= today && t.submissionDeadline <= soon).length, label: 'Tenders closing ≤7d', href: '/tendering/tenders' },
    { n: (contracts ?? []).filter((x) => x.status === 'draft').length, label: 'Contracts to sign', href: '/contracts/contracts' },
  ];

  return (
    <div style={st.page}>
      <h1 style={st.h1}>My Day</h1>
      <p style={st.sub}>
        {day.date} · one question: <b>where do you focus today?</b> Your appointments, your late and
        due work, and what the AI noticed across the whole deal chain — every row links to the
        record that owns it.
      </p>

      <div style={st.kpis}>
        <Kpi n={c.overdue} label="overdue" bad={c.overdue > 0} />
        <Kpi n={c.today} label="due today" />
        <Kpi n={c.meetingsToday} label="meetings today" />
        <Kpi n={c.thisWeek} label="due this week" />
        <Kpi n={c.leadsNeedingAttention} label="leads need attention" bad={c.leadsNeedingAttention > 0} />
        <Kpi n={c.opportunitiesNeedingAttention} label="deals need a next step" bad={c.opportunitiesNeedingAttention > 0} />
      </div>

      {/* Across the deal chain — the desk beyond CRM */}
      <div style={st.desk}>
        {desk.map((d) => (
          <Link key={d.label} href={d.href} style={{ ...st.deskCard, ...(d.n > 0 ? st.deskCardHot : {}) }}>
            <span style={{ ...st.deskN, color: d.n > 0 ? 'var(--accent)' : 'var(--muted)' }}>{d.n}</span>
            <span style={st.deskL}>{d.label} →</span>
          </Link>
        ))}
      </div>

      <div style={st.body}>
        <div style={{ minWidth: 0 }}>
          {quiet && (
            <section style={st.card}>
              <Empty text="Nothing is late, due, or drifting on your desk today. An empty day here means an empty desk — not an empty pipeline." />
            </section>
          )}

          <section style={st.card}>
            <h2 style={st.h2}>Today&apos;s appointments</h2>
            {day.meetings.length === 0 ? (
              <Empty text="No meetings, site visits, demos or presentations scheduled for today." />
            ) : (
              <ul style={st.list}>{day.meetings.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
            )}
          </section>

          <section style={st.card}>
            <h2 style={st.h2}>
              Now <span style={st.h2note}>late or due today</span>
            </h2>
            {day.now.length === 0 ? (
              <Empty text="Nothing late and nothing due today." />
            ) : (
              <ul style={st.list}>{day.now.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
            )}
          </section>

          <section style={st.card}>
            <h2 style={st.h2}>
              Next <span style={st.h2note}>this week, and your unscheduled work</span>
            </h2>
            {day.next.length === 0 ? (
              <Empty text="Nothing scheduled for the rest of the week." />
            ) : (
              <ul style={st.list}>{day.next.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
            )}
          </section>

          <section style={st.card}>
            <h2 style={st.h2}>
              My leads <span style={st.h2note}>with an open gap, worst first</span>
            </h2>
            {day.leads.length === 0 ? (
              <Empty text="Every lead assigned to you is answered, scheduled and moving." />
            ) : (
              <ul style={st.list}>
                {day.leads.map((l) => (
                  <li key={l.id} style={st.row}>
                    <span style={st.type}>{l.status}</span>
                    <span style={st.subject}>
                      <Link href={l.href} style={st.link}>{l.name}</Link>
                      {l.companyName && <span style={st.dim}> · {l.companyName}</span>}
                    </span>
                    <span style={st.gaps}>
                      {l.gaps.map((g) => (
                        <Chip key={g} text={GAP_LABEL[g] ?? g} tone={l.severity === 'HIGH' ? 'bad' : 'warn'} />
                      ))}
                    </span>
                    <span style={st.due}>{l.nextActionDue ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={st.card}>
            <h2 style={st.h2}>
              My deals <span style={st.h2note}>missing a next step, biggest first</span>
            </h2>
            {day.opportunities.length === 0 ? (
              <Empty text="Every open deal you own has an owner, a next action and a date." />
            ) : (
              <ul style={st.list}>
                {day.opportunities.map((o) => (
                  <li key={o.id} style={st.row}>
                    <span style={st.type}>{o.stage}</span>
                    <span style={st.subject}>
                      <Link href={o.href} style={st.link}>{o.title}</Link>
                      <span style={st.dim}> · {money(o.value)}</span>
                    </span>
                    <span style={st.gaps}>
                      {o.gaps.map((g) => <Chip key={g} text={GAP_LABEL[g] ?? g} tone="warn" />)}
                    </span>
                    <span style={st.due}>{o.closeDate ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div style={st.asideCol}>
          <InsightsPanel title="AI noticed" insights={noticed} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ n, label, bad = false }: { n: number; label: string; bad?: boolean }) {
  return (
    <div style={st.kpi}>
      <div style={{ ...st.kpiN, color: bad && n > 0 ? 'var(--bad)' : 'var(--fg)' }}>{n}</div>
      <div style={st.kpiL}>{label}</div>
    </div>
  );
}

const st = {
  page: { maxWidth: 1280, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 } as CSSProperties,
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' } as CSSProperties,
  kpiN: { fontSize: 26, fontWeight: 600, lineHeight: 1.1 } as CSSProperties,
  kpiL: { color: 'var(--muted)', fontSize: 12, marginTop: 4 } as CSSProperties,
  desk: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 } as CSSProperties,
  deskCard: { display: 'flex', alignItems: 'baseline', gap: 10, background: 'var(--panel)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)', borderRadius: 10, padding: '10px 14px', textDecoration: 'none', color: 'var(--fg)' } as CSSProperties,
  deskCardHot: { borderStyle: 'solid', borderColor: 'var(--accent)' } as CSSProperties,
  deskN: { fontSize: 20, fontWeight: 800 } as CSSProperties,
  deskL: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  body: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' } as CSSProperties,
  asideCol: { position: 'sticky', top: 16 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 } as CSSProperties,
  h2: { fontSize: 15, margin: '0 0 10px', display: 'flex', alignItems: 'baseline', gap: 8 } as CSSProperties,
  h2note: { color: 'var(--muted)', fontSize: 12, fontWeight: 400 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0 } as CSSProperties,
  row: { display: 'grid', gridTemplateColumns: '110px 1fr 1fr 92px', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  type: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  subject: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } as CSSProperties,
  related: { color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  gaps: { display: 'flex', flexWrap: 'wrap', gap: 4 } as CSSProperties,
  due: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  dim: { color: 'var(--muted)' } as CSSProperties,
  chip: { borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '1px 7px', fontSize: 10, whiteSpace: 'nowrap' } as CSSProperties,
  empty: { color: 'var(--muted)', margin: 0, fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
