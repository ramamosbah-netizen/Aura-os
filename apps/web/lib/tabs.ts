// VS Code-style record tabs — client-side (localStorage), so open records survive
// reloads and sessions. A tab opens automatically when a record page mounts
// (<RecordChrome>) and closes only when the user closes it. List/dashboard pages
// never become tabs — tabs are records, the sidebar is for pages.

export interface RecordTab {
  href: string;
  title: string;
  /** Record kind for the tab glyph/tooltip, e.g. "Invoice". */
  type: string;
}

const KEY = 'aura.record-tabs';
const MAX = 8;

export const TABS_EVENT = 'aura:tabs-changed';

export function readTabs(): RecordTab[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecordTab =>
        !!x && typeof x === 'object' && typeof (x as RecordTab).href === 'string' && typeof (x as RecordTab).title === 'string',
    );
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

/** Open (or refresh the title of) a record tab. Oldest tab drops past the cap. */
export function openTab(tab: RecordTab): void {
  if (typeof window === 'undefined') return;
  const rest = readTabs().filter((t) => t.href !== tab.href);
  write([...rest, tab].slice(-MAX));
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
