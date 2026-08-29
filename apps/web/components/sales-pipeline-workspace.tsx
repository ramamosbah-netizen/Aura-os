'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CrmPipelineClient, { type View } from './crm-pipeline-client';
import LeadAttentionPanel, { type LeadCommand } from './lead-attention-panel';
import SignalsRadar, { type RadarData } from './signals-radar';
import OpportunityActivitiesCard from './opportunity-activities-card';

// Sales Pipeline workspace — ONE page for working DEALS, clear top-level tabs:
//
//   Radar → Overview → Board → List → Forecast → Analytics
//
// Radar is the acquisition inbox (signals), Overview is the manager cockpit (+ leads
// needing attention + an Opportunity-Activities pointer), Board/List work the deals,
// Analytics deep-dives. Each tab is one job. Activity history is contextual and personal
// execution lives in My Work; the Overview only points to the scoped register.

interface Lead {
  id: string; name: string; companyName: string | null; email: string | null;
  phone: string | null; status: string; source: string | null; createdAt: string;
}
interface Opportunity {
  id: string; leadId: string | null; accountId: string | null; accountName: string | null;
  title: string; value: number; stage: string; winProbability: number; closeDate: string | null;
  createdAt: string;
}
interface Account { id: string; name: string }

type PageTab = 'radar' | 'overview' | 'board' | 'list' | 'forecast' | 'analytics';
type AnalyticsSub = 'analytics' | 'sources' | 'executive';

const PAGE_TABS: readonly PageTab[] = ['radar', 'overview', 'board', 'list', 'forecast', 'analytics'];
const ANALYTICS_SUBVIEWS: readonly AnalyticsSub[] = ['analytics', 'sources', 'executive'];

const TAB_DEFS: Array<{ id: PageTab; label: string; icon: string; hint: string }> = [
  { id: 'radar', label: 'Radar', icon: '⚡', hint: 'Signals — triage what the market is telling you' },
  { id: 'overview', label: 'Overview', icon: '◎', hint: 'The pipeline cockpit + leads needing attention' },
  { id: 'board', label: 'Board', icon: '⊞', hint: 'Work deals across stages (drag & drop)' },
  { id: 'list', label: 'List', icon: '☰', hint: 'Every lead and deal, filterable' },
  { id: 'forecast', label: 'Forecast', icon: '◎', hint: 'Commit, best case and expected close' },
  { id: 'analytics', label: 'Analytics', icon: '📈', hint: 'Performance · sources · executive' },
];

export default function SalesPipelineWorkspace({ leads, opportunities, accounts, leadCommand, radar }: {
  leads: Lead[]; opportunities: Opportunity[]; accounts: Account[];
  leadCommand: LeadCommand | null; radar: RadarData | null;
}) {
  // Deep-linkable from the Sales Home shortcuts (e.g. Analytics → /crm/pipeline?tab=analytics).
  // Board/List are display modes for the same Opportunities dataset, so their canonical URL is
  // `?view=board|list`; keep accepting the old `tab=board|list` links for bookmark compatibility.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlTab = params.get('tab');
  const urlView = params.get('view');
  const initialTab: PageTab = urlTab === 'sources' || urlTab === 'executive' ? 'analytics'
    : PAGE_TABS.includes(urlTab as PageTab) ? (urlTab as PageTab)
      : urlView === 'board' || urlView === 'list' ? urlView : 'overview';
  const initialSub: AnalyticsSub = urlTab === 'sources' || urlTab === 'executive' ? urlTab
    : urlTab === 'analytics' && ANALYTICS_SUBVIEWS.includes(urlView as AnalyticsSub) ? (urlView as AnalyticsSub)
      : 'analytics';
  const [tab, setTab] = useState<PageTab>(initialTab);
  const [sub, setSub] = useState<AnalyticsSub>(initialSub);

  // The URL is the source of truth for a workspace tab. This keeps refresh, deep links and
  // browser back/forward aligned with the visible view instead of leaving the tab in local state.
  useEffect(() => {
    if (urlTab === 'sources' || urlTab === 'executive') {
      setTab('analytics');
      setSub(urlTab);
    } else if (PAGE_TABS.includes(urlTab as PageTab)) {
      if (urlTab === 'board' || urlTab === 'list') {
        setTab(urlTab);
        setSub('analytics');
      } else if (urlTab === 'analytics') {
        setTab('analytics');
        setSub(ANALYTICS_SUBVIEWS.includes(urlView as AnalyticsSub) ? (urlView as AnalyticsSub) : 'analytics');
      } else {
        setTab(urlTab as PageTab);
        setSub('analytics');
      }
    } else if (urlView === 'board' || urlView === 'list') {
      setTab(urlView);
      setSub('analytics');
    } else {
      // Unknown/malformed tab values must never leave the workspace in an
      // ambiguous state. Fall back to and canonicalize to the Overview tab so
      // refresh/back-forward never reintroduce an unsupported view.
      setTab('overview');
      setSub('analytics');
      if (pathname === '/crm/pipeline' && (urlTab || urlView)) {
        const query = new URLSearchParams(params.toString());
        query.delete('view');
        query.set('tab', 'overview');
        router.replace(`${pathname}?${query.toString()}`, { scroll: false });
      }
    }
  }, [urlTab, urlView, pathname, params, router]);

  const selectTab = (next: PageTab): void => {
    setTab(next);
    setSub('analytics');
    if (pathname === '/crm/pipeline') {
      const query = new URLSearchParams(params.toString());
      query.delete('tab');
      query.delete('view');
      if (next === 'board' || next === 'list') query.set('view', next);
      else query.set('tab', next);
      router.push(`${pathname}?${query.toString()}`, { scroll: false });
    }
  };

  const selectAnalyticsSub = (next: AnalyticsSub): void => {
    setTab('analytics');
    setSub(next);
    if (pathname === '/crm/pipeline') {
      const query = new URLSearchParams(params.toString());
      query.set('tab', 'analytics');
      if (next === 'analytics') query.delete('view');
      else query.set('view', next);
      router.push(`${pathname}?${query.toString()}`, { scroll: false });
    }
  };

  const openSignals = radar?.counts.open ?? 0;
  const attention = leadCommand?.counts?.needsAttention ?? 0;

  const pipelineView: View | null =
    tab === 'overview' ? 'command'
      : tab === 'board' ? 'board'
        : tab === 'list' ? 'list'
          : tab === 'forecast' ? 'forecast'
          : tab === 'analytics' ? sub : null;

  // Cross-tab navigation from inside the pipeline client ("work on the Board…" links).
  const onViewChange = (v: View): void => {
    if (v === 'analytics' || v === 'sources' || v === 'executive') selectAnalyticsSub(v);
    else if (v === 'command') selectTab('overview');
    else selectTab(v as PageTab);
  };

  return (
    <div>
      {/* ── Page tabs ── */}
      <div style={st.tabBar} role="tablist">
        {TAB_DEFS.map((t) => {
          const badge = t.id === 'radar' ? openSignals : t.id === 'overview' ? attention : 0;
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={active} title={t.hint} data-testid={`pipeline-tab-${t.id}`}
              style={{ ...st.tab, ...(active ? st.tabOn : {}) }} onClick={() => selectTab(t.id)}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
              {badge > 0 && <span style={{ ...st.badge, ...(active ? st.badgeOn : {}) }}>{badge}</span>}
            </button>
          );
        })}
      </div>
      <div style={st.hintLine}>{TAB_DEFS.find((t) => t.id === tab)?.hint}</div>

      {tab === 'radar' && <SignalsRadar data={radar} />}

      {tab === 'overview' && (
        <>
          <OpportunityActivitiesCard />
          <LeadAttentionPanel data={leadCommand} />
        </>
      )}

      {pipelineView && (
        <>
          {tab === 'analytics' && (
            <div style={st.subBar}>
              {([['analytics', 'Performance'], ['sources', 'Sources & margin'], ['executive', 'Executive']] as Array<[AnalyticsSub, string]>).map(([id, label]) => (
                <button key={id} type="button" style={{ ...st.subTab, ...(sub === id ? st.subTabOn : {}) }} onClick={() => selectAnalyticsSub(id)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <CrmPipelineClient
            initialLeads={leads}
            initialOpportunities={opportunities}
            initialAccounts={accounts}
            view={pipelineView}
            onViewChange={onViewChange}
          />
        </>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  tabBar: { display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 8 },
  tab: {
    display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent',
    color: 'var(--muted)', padding: '10px 16px', fontSize: 14, cursor: 'pointer',
    borderBottomWidth: 2.5, borderBottomStyle: 'solid', borderBottomColor: 'transparent',
    marginBottom: -1, fontWeight: 600,
  },
  tabOn: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  badge: { fontSize: 11, fontWeight: 800, background: 'var(--panel-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 999, padding: '0 7px', color: 'var(--text)' },
  badgeOn: { borderColor: 'var(--accent)', color: 'var(--accent)' },
  hintLine: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px' },
  subBar: { display: 'inline-flex', gap: 4, border: '1px solid var(--border)', borderRadius: 10, padding: 3, background: 'var(--panel)', marginBottom: 14 },
  subTab: { border: 'none', background: 'transparent', color: 'var(--muted)', padding: '6px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', borderRadius: 8 },
  subTabOn: { background: 'var(--panel-2)', color: 'var(--accent)' },
};
