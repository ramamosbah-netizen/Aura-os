// Recently-opened records — client-side only (localStorage), per browser profile.
// Written by <RecordChrome> on every record-page visit; read by the command palette.
// The custom event lets already-mounted UI (palette, breadcrumb) react without polling.

export interface RecentItem {
  href: string;
  title: string;
  /** Record kind for display, e.g. "Account", "Invoice". */
  type: string;
  /** Epoch ms of the last visit. */
  at: number;
}

const KEY = 'aura.recent-items';
const MAX = 12;

export const RECORD_VISIT_EVENT = 'aura:record-visit';

export function readRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentItem =>
        !!x && typeof x === 'object' && typeof (x as RecentItem).href === 'string' && typeof (x as RecentItem).title === 'string',
    );
  } catch {
    return [];
  }
}

export function recordVisit(item: Omit<RecentItem, 'at'>): void {
  if (typeof window === 'undefined') return;
  const next: RecentItem[] = [
    { ...item, at: Date.now() },
    ...readRecentItems().filter((x) => x.href !== item.href),
  ].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full/blocked — recents are best-effort
  }
  window.dispatchEvent(new CustomEvent(RECORD_VISIT_EVENT, { detail: next[0] }));
}
