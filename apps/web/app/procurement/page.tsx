import { BarChart3, Boxes, ClipboardList, Scale, ShoppingCart, Truck, Warehouse } from 'lucide-react';
import { currentUser, getJson } from '@/lib/api';
import { displayName, greeting } from '@/lib/greeting';
import { type InboxDecision, inboxAttention, inboxForModules } from '@/lib/suite-inbox';
import ContinueWorking from '@/components/continue-working';
import SuiteDashboardShell, { type SuiteShortcut } from '@/components/suite-dashboard-shell';

export const dynamic = 'force-dynamic';

// Supply Chain Home — procurement + inventory, on the shared shell. KPIs from the live PO list and
// the universal inbox (procurement decisions); nothing fabricated.

interface Po { status?: string; value?: number }
const aed = (n: number) => 'AED ' + Math.round(n).toLocaleString('en-AE');

const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Purchase Requests', description: 'Request & approval', href: '/procurement/purchase-requests', icon: ClipboardList, tone: 'teal' },
  { label: 'RFQs', description: 'Vendor quotations & comparison', href: '/procurement/rfqs', icon: Scale, tone: 'blue' },
  { label: 'Suppliers', description: 'Approved-vendor master', href: '/procurement/suppliers', icon: Truck, tone: 'violet' },
  { label: 'Purchase Orders', description: 'Committed procurement spend', href: '/procurement/purchase-orders', icon: ShoppingCart, tone: 'amber' },
  { label: '3-Way Match', description: 'PO ↔ GRN ↔ invoice', href: '/procurement/three-way-match', icon: Scale, tone: 'cyan' },
  { label: 'Spend Analytics', description: 'Spend by supplier & project', href: '/procurement/spend-analytics', icon: BarChart3, tone: 'green' },
  { label: 'Stock', description: 'On-hand & movements', href: '/inventory/stock', icon: Boxes, tone: 'teal' },
  { label: 'Goods Receipts', description: 'Received vs POs', href: '/inventory/grns', icon: Warehouse, tone: 'slate' },
];

export default async function SupplyChainHomePage() {
  const user = await currentUser();
  const [pos, inbox] = await Promise.all([
    getJson<Po[]>('/api/procurement/purchase-orders'),
    getJson<InboxDecision[]>('/api/inbox'),
  ]);
  const rows = pos ?? [];
  const spend = rows.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const decisions = inboxForModules(inbox, ['Procurement']);
  const pending = decisions?.length ?? 0;
  const prToApprove = (decisions ?? []).filter((d) => d.kind.toLowerCase().includes('request')).length;

  return (
    <SuiteDashboardShell
      testId="supply-chain-dashboard"
      anchor={{ href: '/procurement', title: 'Supply Chain', type: 'Supply Chain' }}
      hero={{ eyebrow: 'AURA OS / SUPPLY CHAIN', title: <>{greeting()}, <span>{displayName(user?.sub)}</span></>, lede: 'Procurement and inventory — requests, purchasing, receiving and stock.' }}
      askAura={{ tabType: 'Supply Chain' }}
      metrics={[
        { label: 'Purchase orders', value: pos ? String(rows.length) : '—', sub: 'on record', href: '/procurement/purchase-orders', icon: ShoppingCart, tone: 'teal' },
        { label: 'PO spend', value: pos ? aed(spend) : '—', sub: 'committed', href: '/procurement/spend-analytics', icon: BarChart3, tone: 'blue' },
        { label: 'Requests to approve', value: inbox ? String(prToApprove) : '—', sub: 'purchase requests', href: '/procurement/purchase-requests', icon: ClipboardList, tone: 'amber' },
        { label: 'Pending approvals', value: inbox ? String(pending) : '—', sub: 'across procurement', href: '/procurement/purchase-orders', icon: Scale, tone: 'green' },
      ]}
      continueWorking={<ContinueWorking match={['/procurement', '/inventory']} />}
      attention={{
        kicker: 'Universal inbox · procurement decisions',
        title: 'Needs your attention',
        headerLink: { href: '/procurement/purchase-orders', label: 'Open procurement', tabTitle: 'Purchase Orders', tabType: 'Supply Chain' },
        items: decisions === null ? null : inboxAttention(decisions),
        unavailableLabel: 'The decision feed is unavailable. Open Purchase Orders to check the source.',
        emptyLabel: 'No procurement decisions waiting.',
        itemTestId: 'supply-chain-attention-item',
      }}
      brief={{
        kicker: 'Live supply-chain signals',
        title: 'AURA Supply Chain brief',
        body: !pos && !inbox
          ? 'The supply-chain feed could not be loaded. I can still help you search procurement and inventory.'
          : `${rows.length} purchase order${rows.length === 1 ? '' : 's'} on record${spend > 0 ? ` worth ${aed(spend)}` : ''}. ${pending} procurement decision${pending === 1 ? '' : 's'} waiting.`,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'Supply Chain' },
      }}
      shortcuts={{ kicker: 'Supply Chain workspace', title: 'Supply Chain', itemTestId: 'supply-chain-shortcut', items: SHORTCUTS }}
      ownership={<><ShoppingCart aria-hidden /><span><strong>Supply Chain owns buying and stock.</strong> Figures are read live from the purchase-order ledger and the decision inbox.</span></>}
    />
  );
}
