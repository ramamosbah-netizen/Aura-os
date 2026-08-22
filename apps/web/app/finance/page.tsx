import { BarChart3, Banknote, BookOpen, Calculator, FileText, Landmark, ReceiptText, Scale } from 'lucide-react';
import { currentUser, getJson } from '@/lib/api';
import { displayName, greeting } from '@/lib/greeting';
import { type InboxDecision, inboxAttention, inboxForModules } from '@/lib/suite-inbox';
import ContinueWorking from '@/components/continue-working';
import SuiteDashboardShell, { type SuiteShortcut } from '@/components/suite-dashboard-shell';

export const dynamic = 'force-dynamic';

// Finance Home — receivables, payables and the ledger, on the shared shell. The attention queue and
// KPIs come from the universal inbox (finance decisions: invoices to approve / to pay); detailed
// aging and statements live in the function pages. Every figure is read live.

const aed = (n: number) => 'AED ' + Math.round(n).toLocaleString('en-AE');

const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Invoices', description: 'Supplier invoices (AP)', href: '/finance/invoices', icon: ReceiptText, tone: 'teal' },
  { label: 'Customer Invoices', description: 'Client tax invoices (AR)', href: '/finance/customer-invoices', icon: FileText, tone: 'blue' },
  { label: 'AR Aging', description: 'Receivables by overdue bucket', href: '/finance/ar-aging', icon: BarChart3, tone: 'amber' },
  { label: 'AP Aging', description: 'Payables by invoice-date bucket', href: '/finance/ap-aging', icon: BarChart3, tone: 'cyan' },
  { label: 'Ledger & COA', description: 'Double-entry general ledger', href: '/finance/ledger', icon: BookOpen, tone: 'violet' },
  { label: 'Statements', description: 'P&L, balance sheet & cash flow', href: '/finance/statements', icon: Landmark, tone: 'green' },
  { label: 'Budgets', description: 'Budget vs actual from the GL', href: '/finance/budgets', icon: Calculator, tone: 'teal' },
  { label: 'Tax & VAT', description: 'Tax codes & VAT returns', href: '/finance/tax', icon: Scale, tone: 'slate' },
];

export default async function FinanceHomePage() {
  const user = await currentUser();
  const inbox = await getJson<InboxDecision[]>('/api/inbox');
  const decisions = inboxForModules(inbox, ['Finance']);
  const list = decisions ?? [];
  const toApprove = list.filter((d) => d.action.toLowerCase() === 'approve').length;
  const toPay = list.filter((d) => d.action.toLowerCase() === 'pay').length;
  const pendingValue = list.reduce((s, d) => s + (d.value ?? 0), 0);
  const pending = list.length;

  return (
    <SuiteDashboardShell
      testId="finance-dashboard"
      anchor={{ href: '/finance', title: 'Finance', type: 'Finance' }}
      hero={{ eyebrow: 'AURA OS / FINANCE', title: <>{greeting()}, <span>{displayName(user?.sub)}</span></>, lede: 'Receivables, payables, ledger and close — and the finance decisions waiting on you.' }}
      askAura={{ tabType: 'Finance' }}
      metrics={[
        { label: 'Invoices to approve', value: inbox ? String(toApprove) : '—', sub: 'awaiting sign-off', href: '/finance/invoices', icon: ReceiptText, tone: 'amber' },
        { label: 'Invoices to pay', value: inbox ? String(toPay) : '—', sub: 'approved, unpaid', href: '/finance/invoices', icon: Banknote, tone: 'blue' },
        { label: 'Pending value', value: inbox ? aed(pendingValue) : '—', sub: 'across finance decisions', href: '/finance/ap-aging', icon: BarChart3, tone: 'teal' },
        { label: 'Pending approvals', value: inbox ? String(pending) : '—', sub: 'in the finance queue', href: '/finance/invoices', icon: Scale, tone: 'green' },
      ]}
      continueWorking={<ContinueWorking match={['/finance']} />}
      attention={{
        kicker: 'Universal inbox · finance decisions',
        title: 'Needs your attention',
        headerLink: { href: '/finance/invoices', label: 'Open invoices', tabTitle: 'Invoices', tabType: 'Finance' },
        items: decisions === null ? null : inboxAttention(decisions),
        unavailableLabel: 'The decision feed is unavailable. Open Invoices to check the source.',
        emptyLabel: 'No finance decisions waiting.',
        itemTestId: 'finance-attention-item',
      }}
      brief={{
        kicker: 'Live finance signals',
        title: 'AURA Finance brief',
        body: !inbox
          ? 'The finance feed could not be loaded. I can still help you search receivables, payables and the ledger.'
          : `${toApprove} invoice${toApprove === 1 ? '' : 's'} to approve and ${toPay} to pay${pendingValue > 0 ? `, ${aed(pendingValue)} in the queue` : ''}.`,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'Finance' },
      }}
      shortcuts={{ kicker: 'Finance workspace', title: 'Finance', itemTestId: 'finance-shortcut', items: SHORTCUTS }}
      ownership={<><Landmark aria-hidden /><span><strong>Finance owns the money.</strong> The attention queue is the same projection as My Work → Approvals; detailed aging and statements live in the functions.</span></>}
    />
  );
}
