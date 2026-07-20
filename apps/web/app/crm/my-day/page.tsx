import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import { InsightsPanel, type Insight } from '../../../components/crm/record-shell';
import MyDayTasks, { type Task } from '../../../components/my-day-tasks';
import MyDayQuickAdd from '../../../components/my-day-quick-add';
import MyDayNotifications, { type Notification } from '../../../components/my-day-notifications';
import MyDayLayout from '../../../components/my-day-layout';

export const dynamic = 'force-dynamic';

// My Day — the page a salesperson opens FIRST. It answers one decision: "where do I
// focus today?" AI opens the conversation (the "AI noticed" rail composes facts from
// the whole deal chain — CRM, quotations, tenders, contracts, signals) and every row
// links back to the record that owns the fact.
//
// The day is also where the work gets DONE: the task lists are a client island
// (<MyDayTasks>) that can start and complete an activity in place, so acting on your
// day no longer costs you the view of it.
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
/** Universal-inbox row — every pending decision across the platform (see InboxService). */
interface InboxItem {
  id: string; module: string; kind: string; title: string; detail: string;
  action: string; href: string; value: number | null; createdAt: string | null;
}
/** Pipeline command aggregate — the at-risk deals already carry a diagnosis. */
interface AtRiskDeal {
  id: string; title: string; value: number; stage: string; ownerId: string | null;
  accountName: string | null; reasons: string[]; recommendation: string | null;
  daysSinceActivity: number | null;
}
interface PipelineLite { atRisk: AtRiskDeal[] }

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
function composeAiNoticed(day: MyDay, quotes: QuotationLite[], tenders: TenderLite[], contracts: ContractLite[], radar: RadarLite | null, inbox: InboxItem[]): Insight[] {
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

  // Decisions block other people's work, so they outrank your own drifting deals.
  // Ranked by money at stake — an unapproved AED 340k invoice is not the same
  // problem as an unapproved AED 2k one.
  if (inbox.length > 0) {
    const byValue = [...inbox].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const top = byValue[0];
    const exposure = inbox.reduce((sum, i) => sum + (i.value ?? 0), 0);
    bad.push({
      tone: 'bad',
      title: `${inbox.length} decision${inbox.length > 1 ? 's are' : ' is'} waiting on you`,
      detail: `${money(exposure)} held up · biggest: ${top.action.toLowerCase()} ${top.kind.toLowerCase()} "${top.title}"${top.value ? ` (${money(top.value)})` : ''}.`,
      action: { label: 'Open inbox', href: '/workspace' },
    });
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

function Empty({ text }: { text: string }) {
  return <p style={st.empty}>{text}</p>;
}

export default async function MyDayPage() {
  // The API answers for the caller; when the session carries no actor (dev), resolve
  // the workspace user and ask for their day explicitly.
  const me = await getJson<{ username: string }>('/api/workspace/me');
  const [day, quotes, tenders, contracts, radar, inbox, notifications, pipeline] = await Promise.all([
    getJson<MyDay>(`/api/crm/my-day${me?.username ? `?userId=${encodeURIComponent(me.username)}` : ''}`),
    getJson<QuotationLite[]>('/api/crm/quotations'),
    getJson<TenderLite[]>('/api/tendering/tenders'),
    getJson<ContractLite[]>('/api/contracts/contracts'),
    getJson<RadarLite>('/api/crm/signals/radar'),
    getJson<InboxItem[]>('/api/inbox'),
    getJson<Notification[]>('/api/notifications'),
    getJson<PipelineLite>('/api/crm/opportunities/pipeline'),
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
  // A day with 37 approvals waiting is not a quiet day, so pending decisions count
  // toward it too — otherwise "clear desk" would render above a full inbox.
  const quiet =
    c.overdue + c.today + c.thisWeek + c.leadsNeedingAttention + c.opportunitiesNeedingAttention === 0 &&
    (inbox ?? []).length === 0;
  const pending = inbox ?? [];
  // Unread only: My Day answers "what changed", not "everything that ever happened" —
  // /workspace remains the full archive. Capped so news cannot bury the work below it.
  const unread = (notifications ?? []).filter((n) => !n.read).slice(0, 6);

  // At-risk deals already arrive diagnosed (reasons + a recommendation) from the
  // pipeline command aggregate — one call, no per-deal fan-out. Yours first: an
  // unowned at-risk deal is everyone's problem, but your own is yours today.
  const atRisk = [...((pipeline?.atRisk ?? []) as AtRiskDeal[])]
    .sort((a, b) => {
      const mine = (d: AtRiskDeal) => (me?.username && d.ownerId === me.username ? 0 : 1);
      return mine(a) - mine(b) || b.value - a.value;
    })
    .slice(0, 5);
  const unowned = (pipeline?.atRisk ?? []).filter((d) => !d.ownerId).length;
  const noticed = composeAiNoticed(day, quotes ?? [], tenders ?? [], contracts ?? [], radar ?? null, pending);

  // Grouped so the shape of the backlog reads at a glance ("19 of these are Finance"),
  // then the biggest few by money — the ones actually worth interrupting the day for.
  const pendingByModule = Object.entries(
    pending.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.module]: (acc[i.module] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const topPending = [...pending].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 5);
  const pendingExposure = pending.reduce((sum, i) => sum + (i.value ?? 0), 0);

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

      <div className="day-body" style={st.body}>
        <div style={{ minWidth: 0 }}>
          <MyDayLayout
            sections={[
              { key: 'capture', label: 'Capture', node: (
<section style={st.card}>
            <h2 style={st.h2}>
              Capture <span style={st.h2note}>a task, a follow-up, or a note — without leaving</span>
            </h2>
            <MyDayQuickAdd assigneeId={me?.username ?? null} />
          </section>
                ) },
              ...(pending.length > 0
                ? [{ key: 'pending', label: 'Waiting on you', node: (

            <section style={st.card}>
              <h2 style={st.h2}>
                Waiting on you{' '}
                <span style={st.h2note}>
                  {pending.length} decision{pending.length > 1 ? 's' : ''} across the platform ·{' '}
                  {money(pendingExposure)} held up
                </span>
              </h2>
              <div style={st.modChips}>
                {pendingByModule.map(([mod, n]) => (
                  <span key={mod} style={st.modChip}>
                    {mod} <b style={{ color: 'var(--accent)' }}>{n}</b>
                  </span>
                ))}
              </div>
              <ul style={st.list}>
                {topPending.map((i) => (
                  <li key={`${i.module}-${i.id}`} className="day-pend-row" style={st.pendRow}>
                    <span style={st.type}>{i.action}</span>
                    <span style={st.subject}>
                      <Link href={i.href} style={st.link}>
                        {i.title}
                      </Link>
                      <span style={st.dim}> · {i.kind}</span>
                    </span>
                    <span style={st.due}>{i.value ? money(i.value) : '—'}</span>
                  </li>
                ))}
              </ul>
              <p style={st.deskL}>
                <Link href="/workspace" style={st.link}>
                  All {pending.length} in the inbox →
                </Link>
              </p>
            </section>
                  ) }]
                : []),
              ...(unread.length > 0
                ? [{ key: 'news', label: 'Since you were here', node: (

            <section style={st.card}>
              <MyDayNotifications notifications={unread} />
            </section>
                  ) }]
                : []),
              ...(atRisk.length > 0
                ? [{ key: 'risk', label: 'Deals at risk', node: (

            <section style={st.card}>
              <h2 style={st.h2}>
                Deals at risk{' '}
                <span style={st.h2note}>
                  {(pipeline?.atRisk ?? []).length} across the pipeline
                  {unowned > 0 ? ` · ${unowned} with no owner` : ''} — worst money first
                </span>
              </h2>
              <ul style={st.list}>
                {atRisk.map((d) => (
                  <li key={d.id} style={st.riskRow}>
                    <span style={st.subject}>
                      <Link href={`/crm/opportunities/${d.id}`} style={st.link}>
                        {d.title}
                      </Link>
                      <span style={st.dim}>
                        {' '}
                        · {money(d.value)} · {d.stage}
                        {d.accountName ? ` · ${d.accountName}` : ''}
                        {!d.ownerId && ' · unowned'}
                      </span>
                    </span>
                    <span style={st.gaps}>
                      {d.reasons.map((r) => (
                        <Chip key={r} text={r} tone="warn" />
                      ))}
                    </span>
                    {d.recommendation && <span style={st.reco}>→ {d.recommendation}</span>}
                  </li>
                ))}
              </ul>
            </section>
                  ) }]
                : []),
              ...(quiet
                ? [{ key: 'quiet', label: 'Clear-desk notice', node: (

            <section style={st.card}>
              <Empty text="Nothing is late, due, or drifting on your desk today. An empty day here means an empty desk — not an empty pipeline." />
            </section>
                  ) }]
                : []),
              { key: 'appointments', label: 'Appointments', node: (
<section style={st.card}>
            <h2 style={st.h2}>Today&apos;s appointments</h2>
            <MyDayTasks
              tasks={day.meetings}
              empty="No meetings, site visits, demos or presentations scheduled for today."
            />
          </section>
                ) },
              { key: 'now', label: 'Now', node: (
<section style={st.card}>
            <h2 style={st.h2}>
              Now <span style={st.h2note}>late or due today</span>
            </h2>
            <MyDayTasks tasks={day.now} empty="Nothing late and nothing due today." />
          </section>
                ) },
              { key: 'next', label: 'Next', node: (
<section style={st.card}>
            <h2 style={st.h2}>
              Next <span style={st.h2note}>this week, and your unscheduled work</span>
            </h2>
            <MyDayTasks tasks={day.next} empty="Nothing scheduled for the rest of the week." />
          </section>
                ) },
              { key: 'leads', label: 'My leads', node: (
<section style={st.card}>
            <h2 style={st.h2}>
              My leads <span style={st.h2note}>with an open gap, worst first</span>
            </h2>
            {day.leads.length === 0 ? (
              <Empty text="Every lead assigned to you is answered, scheduled and moving." />
            ) : (
              <ul style={st.list}>
                {day.leads.map((l) => (
                  <li key={l.id} className="day-row" style={st.row}>
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
                ) },
              { key: 'deals', label: 'My deals', node: (
<section style={st.card}>
            <h2 style={st.h2}>
              My deals <span style={st.h2note}>missing a next step, biggest first</span>
            </h2>
            {day.opportunities.length === 0 ? (
              <Empty text="Every open deal you own has an owner, a next action and a date." />
            ) : (
              <ul style={st.list}>
                {day.opportunities.map((o) => (
                  <li key={o.id} className="day-row" style={st.row}>
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
                ) },
            ]}
          />
        </div>

        <div className="day-aside" style={st.asideCol}>
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
  // One column: title line, reason chips, then the recommendation as its own line.
  riskRow: { padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  reco: { color: 'var(--good)', fontSize: 12.5 } as CSSProperties,
  modChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 } as CSSProperties,
  modChip: {
    border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px',
    fontSize: 11, color: 'var(--muted)',
  } as CSSProperties,
  // Three columns (verb / what / worth) declared in .day-pend-row (globals.css).
  pendRow: { padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  desk: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 } as CSSProperties,
  deskCard: { display: 'flex', alignItems: 'baseline', gap: 10, background: 'var(--panel)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)', borderRadius: 10, padding: '10px 14px', textDecoration: 'none', color: 'var(--fg)' } as CSSProperties,
  deskCardHot: { borderStyle: 'solid', borderColor: 'var(--accent)' } as CSSProperties,
  deskN: { fontSize: 20, fontWeight: 800 } as CSSProperties,
  deskL: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  // Tracks live in .day-body (globals.css) so the rail can drop below the day.
  body: {} as CSSProperties,
  asideCol: { top: 16 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 } as CSSProperties,
  h2: { fontSize: 15, margin: '0 0 10px', display: 'flex', alignItems: 'baseline', gap: 8 } as CSSProperties,
  h2note: { color: 'var(--muted)', fontSize: 12, fontWeight: 400 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0 } as CSSProperties,
  // Tracks live in .day-row (globals.css) so they can collapse on narrow viewports.
  row: { padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
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
