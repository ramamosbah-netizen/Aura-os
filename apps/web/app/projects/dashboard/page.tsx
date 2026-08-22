import { getJson } from '@/lib/api';
import ProjectDeliveryDashboard, {
  type DeliveryApproval,
  type DeliveryProject,
} from '@/components/project-delivery-dashboard';

export const dynamic = 'force-dynamic';

// Project Delivery — the suite front door, on the shared SuiteDashboardShell (My Work parity).
// Content is project-specific and every figure is READ from live endpoints:
//   • `/api/projects/projects/portfolio` — active/at-risk counts + earned-value health (SPI/CPI).
//   • `/api/inbox` — the universal decision queue, filtered to the delivery-touching modules, for
//     "pending approvals". Nothing here is fabricated: no milestones/actions source exists, so that
//     KPI is a real schedule signal (SPI < 1), and there is no trusted "last worked on" source, so
//     no "continue work" panel is invented.

/** Universal-inbox item shape (a subset of the API's InboxItem). */
interface InboxItem { id: string; module: string; kind: string; title: string; action: string; href: string }

// Delivery-touching decisions the inbox actually projects today: variations raised on projects and
// material approvals. Other delivery modules do not yet feed the inbox — so they are not claimed.
const DELIVERY_MODULES = new Set(['Projects', 'Quality']);

export default async function ProjectsDashboardPage() {
  const [portfolio, inbox] = await Promise.all([
    getJson<DeliveryProject[]>('/api/projects/projects/portfolio'),
    getJson<InboxItem[]>('/api/inbox'),
  ]);

  const approvals: DeliveryApproval[] | null = inbox === null
    ? null
    : inbox
        .filter((item) => DELIVERY_MODULES.has(item.module))
        .map((item) => ({ id: item.id, module: item.module, kind: item.kind, title: item.title, action: item.action, href: item.href }));

  return <ProjectDeliveryDashboard projects={portfolio} approvals={approvals} />;
}
