// VS Code-style AURA tabs — client-side (localStorage), so open records and explicitly
// launched work centers survive reloads and sessions. Record pages register through
// <RecordChrome>; workspace shortcuts register through <AuraTabLink>.

export interface RecordTab {
  href: string;
  title: string;
  /** Record kind for the tab glyph/tooltip, e.g. "Invoice". */
  type: string;
  /** Stable workspace/record identity. A tab may change its focused URL without duplicating. */
  key?: string;
}

const KEY = 'aura.record-tabs';
const MAX = 8;

export const TABS_EVENT = 'aura:tabs-changed';

function canonicalHref(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.sort();
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    return `${path}${url.search}`;
  } catch {
    return href;
  }
}

function identity(tab: RecordTab): string {
  return tab.key ?? canonicalHref(tab.href);
}

export function readTabs(): RecordTab[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (x): x is RecordTab =>
        !!x && typeof x === 'object' && typeof (x as RecordTab).href === 'string' && typeof (x as RecordTab).title === 'string',
    );
    return valid.reduce<RecordTab[]>((tabs, tab) => {
      const index = tabs.findIndex((candidate) => identity(candidate) === identity(tab));
      if (index < 0) return [...tabs, tab];
      const next = [...tabs];
      next[index] = tab;
      return next;
    }, []);
  } catch {
    return [];
  }
}

function write(tabs: RecordTab[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    // storage blocked — tabs are best-effort
  }
  window.dispatchEvent(new CustomEvent(TABS_EVENT));
}

/** Open (or refresh the title of) an AURA tab. Oldest tab drops past the cap. */
export function openTab(tab: RecordTab, options?: { afterHref?: string }): void {
  if (typeof window === 'undefined') return;
  const rest = readTabs().filter((candidate) => identity(candidate) !== identity(tab));
  const afterIndex = options?.afterHref
    ? rest.findIndex((candidate) => canonicalHref(candidate.href) === canonicalHref(options.afterHref!))
    : -1;
  const next = [...rest];
  next.splice(afterIndex >= 0 ? afterIndex + 1 : next.length, 0, tab);
  if (next.length > MAX) {
    const protectedHrefs = new Set([tab.href, options?.afterHref].filter((href): href is string => !!href));
    const removable = next.findIndex((candidate) => !protectedHrefs.has(candidate.href));
    next.splice(removable >= 0 ? removable : 0, 1);
  }
  write(next);
}

/** Register a stable anchor tab without moving it when its page mounts again. */
export function ensureTab(tab: RecordTab): void {
  if (typeof window === 'undefined') return;
  const tabs = readTabs();
  const index = tabs.findIndex((candidate) => identity(candidate) === identity(tab));
  if (index >= 0) {
    const next = [...tabs];
    // Preserve a focused workspace URL (for example Tasks?task=123). A PDF tab is different:
    // its immutable version is part of the anchor, so a direct deep-link to v2 must replace v1.
    const refreshImmutableVersion = tab.key?.startsWith('document-pdf:') ?? false;
    next[index] = { ...tab, href: refreshImmutableVersion ? tab.href : tabs[index].href };
    write(next);
    return;
  }
  write([...tabs, tab].slice(-MAX));
}

/** Close a tab; returns the neighbour to navigate to when the active tab closed. */
export function closeTab(href: string): RecordTab | null {
  if (typeof window === 'undefined') return null;
  const tabs = readTabs();
  const idx = tabs.findIndex((t) => t.href === href);
  const next = tabs.filter((t) => t.href !== href);
  write(next);
  if (idx === -1 || next.length === 0) return null;
  return next[Math.min(idx, next.length - 1)];
}
