import { BookText, FileText, Handshake, MinusCircle, Receipt, ReceiptText, Replace, Shuffle } from 'lucide-react';
import { currentUser, getJson } from '@/lib/api';
import { displayName, greeting } from '@/lib/greeting';
import { type InboxDecision, inboxAttention, inboxForModules } from '@/lib/suite-inbox';
import ContinueWorking from '@/components/continue-working';
import SuiteDashboardShell, { type SuiteShortcut } from '@/components/suite-dashboard-shell';

export const dynamic = 'force-dynamic';

// Commercial Home — post-award contracts, variations, claims and subcontracts, on the shared shell.
// Contract count/value from the live contracts list; the attention queue from the universal inbox
// (subcontract & variation decisions). Every figure is read live.

interface Contract { status?: string; value?: number }
const aed = (n: number) => 'AED ' + Math.round(n).toLocaleString('en-AE');
const CLOSED = new Set(['closed', 'completed', 'cancelled', 'terminated']);

const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Contracts', description: 'Awarded engagements', href: '/contracts/contracts', icon: FileText, tone: 'teal' },
  { label: 'Variations', description: 'Change orders & revised value', href: '/projects/variations', icon: Replace, tone: 'amber' },
  { label: 'Payment Certificates', description: 'Interim payment certificates', href: '/contracts/certificates', icon: ReceiptText, tone: 'blue' },
  { label: 'Clause Library', description: 'Reusable contract language', href: '/contracts/clauses', icon: BookText, tone: 'violet' },
  { label: 'Subcontracts', description: 'Subcontractor agreements', href: '/subcontracts/subcontracts', icon: Handshake, tone: 'cyan' },
  { label: 'Progress Claims', description: 'Certify → pay subcontractors', href: '/subcontracts/claims', icon: Receipt, tone: 'green' },
  { label: 'Subcontract Variations', description: 'Additions & omissions', href: '/subcontracts/variations', icon: Shuffle, tone: 'teal' },
  { label: 'Back-Charges', description: 'Contra-charges from claims', href: '/subcontracts/back-charges', icon: MinusCircle, tone: 'slate' },
];

export default async function CommercialHomePage() {
  const user = await currentUser();
  const [contracts, inbox] = await Promise.all([
    getJson<Contract[]>('/api/contracts/contracts'),
    getJson<InboxDecision[]>('/api/inbox'),
  ]);
  const rows = contracts ?? [];
  const active = rows.filter((c) => !CLOSED.has((c.status ?? '').toLowerCase()));
  const activeValue = active.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const decisions = inboxForModules(inbox, ['Subcontracts', 'Projects']);
  const list = decisions ?? [];
  const claims = list.filter((d) => d.kind.toLowerCase().includes('claim')).length;
  const pending = list.length;

  return (
    <SuiteDashboardShell
      testId="commercial-dashboard"
      anchor={{ href: '/contracts', title: 'Commercial', type: 'Commercial' }}
      hero={{ eyebrow: 'AURA OS / COMMERCIAL', title: <>{greeting()}, <span>{displayName(user?.sub)}</span></>, lede: 'Post-award commercial control — contracts, variations, claims and subcontracts.' }}
      askAura={{ tabType: 'Commercial' }}
      metrics={[
        { label: 'Active contracts', value: contracts ? String(active.length) : '—', sub: 'live engagements', href: '/contracts/contracts', icon: FileText, tone: 'teal' },
        { label: 'Contract value', value: contracts ? aed(activeValue) : '—', sub: 'active, awarded', href: '/contracts/contracts', icon: ReceiptText, tone: 'blue' },
        { label: 'Claims pending', value: inbox ? String(claims) : '—', sub: 'subcontractor claims', href: '/subcontracts/claims', icon: Receipt, tone: 'amber' },
        { label: 'Pending approvals', value: inbox ? String(pending) : '—', sub: 'variations & subcontracts', href: '/projects/variations', icon: Replace, tone: 'green' },
      ]}
      continueWorking={<ContinueWorking match={['/contracts', '/subcontracts', '/projects/variations']} />}
      attention={{
        kicker: 'Universal inbox · commercial decisions',
        title: 'Needs your attention',
        headerLink: { href: '/contracts/contracts', label: 'Open contracts', tabTitle: 'Contracts', tabType: 'Commercial' },
        items: decisions === null ? null : inboxAttention(decisions),
        unavailableLabel: 'The decision feed is unavailable. Open Contracts to check the source.',
        emptyLabel: 'No commercial decisions waiting.',
        itemTestId: 'commercial-attention-item',
      }}
      brief={{
        kicker: 'Live commercial signals',
        title: 'AURA Commercial brief',
        body: !contracts && !inbox
          ? 'The commercial feed could not be loaded. I can still help you search contracts and subcontracts.'
          : `${active.length} active contract${active.length === 1 ? '' : 's'}${activeValue > 0 ? ` worth ${aed(activeValue)}` : ''}. ${pending} commercial decision${pending === 1 ? '' : 's'} waiting.`,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'Commercial' },
      }}
      shortcuts={{ kicker: 'Commercial workspace', title: 'Commercial', itemTestId: 'commercial-shortcut', items: SHORTCUTS }}
      ownership={<><FileText aria-hidden /><span><strong>Commercial owns the awarded value.</strong> Contract figures are read live; the attention queue is the same projection as My Work → Approvals.</span></>}
    />
  );
}
