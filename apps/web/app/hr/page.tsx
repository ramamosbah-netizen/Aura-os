import { CalendarClock, Clock, FileText, IdCard, Receipt, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { currentUser, getJson } from '@/lib/api';
import { displayName, greeting } from '@/lib/greeting';
import { type InboxDecision, inboxAttention, inboxForModules } from '@/lib/suite-inbox';
import ContinueWorking from '@/components/continue-working';
import SuiteDashboardShell, { type SuiteShortcut } from '@/components/suite-dashboard-shell';

export const dynamic = 'force-dynamic';

// People Home — the workforce, on the shared shell. Headcount from the live employee list; the
// attention queue from the universal inbox (HR decisions: leave, timesheets, expenses, advances).

interface Employee { status?: string }

const SHORTCUTS: SuiteShortcut[] = [
  { label: 'HR & Payroll', description: 'Profiles, leave & payroll', href: '/hr/control', icon: UserRound, tone: 'teal' },
  { label: 'Timesheets', description: 'Daily hours & approval', href: '/hr/timesheets', icon: Clock, tone: 'blue' },
  { label: 'Attendance', description: 'Check-in/out & worked hours', href: '/hr/attendance', icon: CalendarClock, tone: 'cyan' },
  { label: 'Appraisals', description: 'Performance reviews', href: '/hr/appraisals', icon: TrendingUp, tone: 'violet' },
  { label: 'Expense Claims', description: 'Reimbursements', href: '/hr/expense-claims', icon: Receipt, tone: 'amber' },
  { label: 'Staff Advances', description: 'Salary advances & loans', href: '/hr/staff-advances', icon: Wallet, tone: 'green' },
  { label: 'Gratuity (EOSB)', description: 'End-of-service benefit', href: '/hr/eosb', icon: FileText, tone: 'teal' },
  { label: 'Document Expiry', description: 'Visa & permit watch-list', href: '/hr/document-expiry', icon: IdCard, tone: 'slate' },
];

export default async function PeopleHomePage() {
  const user = await currentUser();
  const [emps, inbox] = await Promise.all([
    getJson<Employee[]>('/api/hr/employees'),
    getJson<InboxDecision[]>('/api/inbox'),
  ]);
  const headcount = emps?.length ?? null;
  const active = (emps ?? []).filter((e) => (e.status ?? 'active').toLowerCase() === 'active').length;
  const decisions = inboxForModules(inbox, ['HR']);
  const list = decisions ?? [];
  const leave = list.filter((d) => d.kind.toLowerCase().includes('leave')).length;
  const pending = list.length;

  return (
    <SuiteDashboardShell
      testId="people-dashboard"
      anchor={{ href: '/hr', title: 'People', type: 'People' }}
      hero={{ eyebrow: 'AURA OS / PEOPLE', title: <>{greeting()}, <span>{displayName(user?.sub)}</span></>, lede: 'The workforce — people, time, attendance and the approvals waiting on you.' }}
      askAura={{ tabType: 'People' }}
      metrics={[
        { label: 'Headcount', value: headcount == null ? '—' : String(headcount), sub: 'employees on record', href: '/hr/control', icon: UserRound, tone: 'teal' },
        { label: 'Active', value: emps ? String(active) : '—', sub: 'currently employed', href: '/hr/control', icon: IdCard, tone: 'blue' },
        { label: 'Leave to approve', value: inbox ? String(leave) : '—', sub: 'requests pending', href: '/hr/control', icon: CalendarClock, tone: 'amber' },
        { label: 'Pending approvals', value: inbox ? String(pending) : '—', sub: 'across HR', href: '/hr/timesheets', icon: Clock, tone: 'green' },
      ]}
      continueWorking={<ContinueWorking match={['/hr']} />}
      attention={{
        kicker: 'Universal inbox · HR decisions',
        title: 'Needs your attention',
        headerLink: { href: '/hr/control', label: 'Open HR', tabTitle: 'HR & Payroll', tabType: 'People' },
        items: decisions === null ? null : inboxAttention(decisions),
        unavailableLabel: 'The decision feed is unavailable. Open HR to check the source.',
        emptyLabel: 'No HR decisions waiting.',
        itemTestId: 'people-attention-item',
      }}
      brief={{
        kicker: 'Live people signals',
        title: 'AURA People brief',
        body: !emps && !inbox
          ? 'The people feed could not be loaded. I can still help you search employees and HR records.'
          : `${headcount ?? 0} employee${headcount === 1 ? '' : 's'} on record. ${pending} HR decision${pending === 1 ? '' : 's'} waiting${leave > 0 ? `, ${leave} leave request${leave === 1 ? '' : 's'}` : ''}.`,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'People' },
      }}
      shortcuts={{ kicker: 'People workspace', title: 'People', itemTestId: 'people-shortcut', items: SHORTCUTS }}
      ownership={<><UserRound aria-hidden /><span><strong>People owns the workforce.</strong> Headcount is read live; the attention queue is the same projection as My Work → Approvals.</span></>}
    />
  );
}
