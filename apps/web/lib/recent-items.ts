'use client';

// Recently-visited records/pages, persisted in localStorage so users can jump back
// to what they were working on. Purely client-side — no server round-trip.

export interface RecentItem {
  href: string;
  label: string;
  type: string; // e.g. "Account", "Tender", or "Page"
  at: number; // epoch ms
}

const KEY = 'aura.recent';
const MAX = 12;

export function getRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentItem, 'at'>): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const existing = getRecents().filter((r) => r.href !== item.href);
    const next = [{ ...item, at: now }, ...existing].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full / disabled — ignore
  }
}
