import type { SuiteAttentionItem } from '@/components/suite-dashboard-shell';

/**
 * Shared helper: turn the universal inbox (`/api/inbox`) into a suite's "needs attention" list and
 * "pending approvals" count. Every suite Home that surfaces decisions reads the SAME projection, so
 * the number a person sees in My Work → Approvals and the number on a suite Home cannot disagree.
 */
export interface InboxDecision {
  id: string;
  module: string;
  kind: string;
  title: string;
  detail?: string;
  action: string;
  href: string;
  value: number | null;
}

const aed = (n: number): string => 'AED ' + Math.round(n).toLocaleString('en-AE');

/** The decisions belonging to a suite (by inbox module display-name), or null when the feed failed. */
export function inboxForModules(items: InboxDecision[] | null, modules: string[]): InboxDecision[] | null {
  if (items === null) return null;
  const set = new Set(modules);
  return items.filter((item) => set.has(item.module));
}

/** Map inbox decisions to attention rows for the shared shell. */
export function inboxAttention(items: InboxDecision[], limit = 5): SuiteAttentionItem[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    href: item.href,
    tabTitle: item.title,
    tabType: item.kind,
    signal: 'warn',
    title: item.title,
    subtitle: `${item.kind}${item.detail ? ` · ${item.detail}` : ` · ${item.module}`}`,
    detailPrimary: `→ ${item.action}`,
    trailing: item.value != null ? aed(item.value) : '',
    trailingStrong: item.value != null,
  }));
}
