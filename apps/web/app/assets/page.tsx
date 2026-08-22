import { Car, HardDrive, Receipt, Repeat, Trash2, TrendingDown, Truck, Wrench } from 'lucide-react';
import { currentUser, getJson } from '@/lib/api';
import { displayName, greeting } from '@/lib/greeting';
import ContinueWorking from '@/components/continue-working';
import SuiteDashboardShell, { type SuiteAttentionItem, type SuiteShortcut } from '@/components/suite-dashboard-shell';

export const dynamic = 'force-dynamic';

// Assets & Service Home — the asset register and upcoming service, on the shared shell. Counts and
// the attention queue (scheduled maintenance, soonest first) are read live from the asset endpoints.

interface Asset { id: string; name: string; status: 'active' | 'maintenance' | 'inactive' | 'disposed' }
interface Maintenance { id: string; assetId: string; date: string; description: string; status: 'scheduled' | 'completed' }

const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Assets & Equipment', description: 'Register, calibration & warranties', href: '/assets/control', icon: HardDrive, tone: 'teal' },
  { label: 'Depreciation', description: 'Schedule & net book value', href: '/assets/depreciation', icon: TrendingDown, tone: 'blue' },
  { label: 'Disposals', description: 'Sale / scrap / write-off', href: '/assets/disposals', icon: Trash2, tone: 'slate' },
  { label: 'AMC & Services', description: 'Service contracts & SLA', href: '/amc', icon: Wrench, tone: 'amber' },
  { label: 'Field Service', description: 'Dispatch board & visits', href: '/amc/dispatch', icon: Truck, tone: 'cyan' },
  { label: 'Preventive Maintenance', description: 'PPM schedules & visits', href: '/amc/ppm', icon: Repeat, tone: 'green' },
  { label: 'Fleet & Logistics', description: 'Vehicles, fuel & maintenance', href: '/fleet/control', icon: Car, tone: 'violet' },
  { label: 'Traffic Fines', description: 'Fines, points & settlement', href: '/fleet/fines', icon: Receipt, tone: 'teal' },
];

export default async function AssetsServiceHomePage() {
  const user = await currentUser();
  const [assets, maintenance] = await Promise.all([
    getJson<Asset[]>('/api/assets'),
    getJson<Maintenance[]>('/api/assets/maintenance'),
  ]);
  const rows = assets ?? [];
  const inMaintenance = rows.filter((a) => a.status === 'maintenance').length;
  const active = rows.filter((a) => a.status === 'active').length;
  const scheduled = (maintenance ?? []).filter((m) => m.status === 'scheduled');
  const nameOf = new Map(rows.map((a) => [a.id, a.name]));

  const attentionItems: SuiteAttentionItem[] | null = maintenance === null ? null : [...scheduled]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      href: '/assets/control',
      tabTitle: nameOf.get(m.assetId) ?? 'Asset',
      tabType: 'Maintenance',
      signal: 'warn',
      title: nameOf.get(m.assetId) ?? 'Asset',
      subtitle: m.description || 'Scheduled maintenance',
      detailPrimary: '→ Scheduled maintenance',
      trailing: m.date?.slice(0, 10) ?? '',
    }));

  return (
    <SuiteDashboardShell
      testId="assets-service-dashboard"
      anchor={{ href: '/assets', title: 'Assets & Service', type: 'Assets & Service' }}
      hero={{ eyebrow: 'AURA OS / ASSETS & SERVICE', title: <>{greeting()}, <span>{displayName(user?.sub)}</span></>, lede: 'Assets, fleet and service — the register, warranties and the maintenance coming up.' }}
      askAura={{ tabType: 'Assets & Service' }}
      metrics={[
        { label: 'Assets', value: assets ? String(rows.length) : '—', sub: 'on the register', href: '/assets/control', icon: HardDrive, tone: 'teal' },
        { label: 'Active', value: assets ? String(active) : '—', sub: 'in service', href: '/assets/control', icon: Repeat, tone: 'blue' },
        { label: 'In maintenance', value: assets ? String(inMaintenance) : '—', sub: 'down for service', href: '/assets/control', icon: Wrench, tone: inMaintenance > 0 ? 'amber' : 'green' },
        { label: 'Scheduled service', value: maintenance ? String(scheduled.length) : '—', sub: 'upcoming visits', href: '/amc/ppm', icon: Truck, tone: 'green' },
      ]}
      continueWorking={<ContinueWorking match={['/assets', '/fleet', '/amc']} />}
      attention={{
        kicker: 'Asset register · soonest service first',
        title: 'Needs your attention',
        headerLink: { href: '/assets/control', label: 'Open assets', tabTitle: 'Assets & Equipment', tabType: 'Assets & Service' },
        items: attentionItems,
        unavailableLabel: 'The maintenance feed is unavailable. Open Assets to check the source.',
        emptyLabel: 'No scheduled maintenance — nothing due.',
        itemTestId: 'assets-service-attention-item',
      }}
      brief={{
        kicker: 'Live asset signals',
        title: 'AURA Assets brief',
        body: !assets && !maintenance
          ? 'The asset feed could not be loaded. I can still help you search the register and service records.'
          : `${rows.length} asset${rows.length === 1 ? '' : 's'} on the register${inMaintenance > 0 ? `, ${inMaintenance} down for maintenance` : ''}. ${scheduled.length} service visit${scheduled.length === 1 ? '' : 's'} scheduled.`,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'Assets & Service' },
      }}
      shortcuts={{ kicker: 'Assets & Service workspace', title: 'Assets & Service', itemTestId: 'assets-service-shortcut', items: SHORTCUTS }}
      ownership={<><HardDrive aria-hidden /><span><strong>Assets & Service owns the equipment lifecycle.</strong> Counts and upcoming service are read live from the asset register.</span></>}
    />
  );
}
