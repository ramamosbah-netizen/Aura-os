// Shared hero helpers for suite Homes — one timezone-pinned greeting and one display-name rule,
// so every suite front door reads identically. Server-safe (no browser APIs).

export function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function displayName(subject: string | undefined | null): string {
  const base = subject?.replace(/^u-/, '').replace(/[-_.]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (character) => character.toUpperCase()) : 'AURA User';
}
