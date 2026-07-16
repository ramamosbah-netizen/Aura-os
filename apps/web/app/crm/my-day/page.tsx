import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

// C4 — Sales Workspace "My Day": the page a salesperson opens first. It composes work that
// already exists in three systems; every row links back to the record that owns the fact, because
// the day is where you SEE the work, not where you keep it.

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

const money = (n: number): string => `AED ${n.toLocaleString('en-AE')}`;

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
  const day = await getJson<MyDay>('/api/crm/my-day');

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

  return (
    <div style={st.page}>
      <h1 style={st.h1}>My Day</h1>
      <p style={st.sub}>
        {day.date} · everything on your desk right now — your appointments, your late and due work,
        your leads with an open gap and your deals without a next step. Nothing here is new: it is
        the same work, seen from where you sit.
      </p>

      <div style={st.kpis}>
        <Kpi n={c.overdue} label="overdue" bad={c.overdue > 0} />
        <Kpi n={c.today} label="due today" />
        <Kpi n={c.meetingsToday} label="meetings today" />
        <Kpi n={c.thisWeek} label="due this week" />
        <Kpi n={c.leadsNeedingAttention} label="leads need attention" bad={c.leadsNeedingAttention > 0} />
        <Kpi n={c.opportunitiesNeedingAttention} label="deals need a next step" bad={c.opportunitiesNeedingAttention > 0} />
      </div>

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
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 } as CSSProperties,
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' } as CSSProperties,
  kpiN: { fontSize: 26, fontWeight: 600, lineHeight: 1.1 } as CSSProperties,
  kpiL: { color: 'var(--muted)', fontSize: 12, marginTop: 4 } as CSSProperties,
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
  chip: { border: '1px solid', borderRadius: 999, padding: '1px 7px', fontSize: 10, whiteSpace: 'nowrap' } as CSSProperties,
  empty: { color: 'var(--muted)', margin: 0, fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
