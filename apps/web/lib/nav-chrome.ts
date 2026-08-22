// Which pages suppress the in-suite tab row (the "Sales topbar" etc.). Pure + testable so the
// register-vs-record distinction can't silently regress.
//
//   FULL_FOCUS_ROUTES      — a workspace that owns the whole viewport (matches the path and its
//                            children): the tab row would be redundant chrome.
//   RECORD_DETAIL_PREFIXES — a 360/detail page UNDER a register: hide the suite tab row on the
//                            record (`/crm/leads/<id>`) while KEEPING it on the register itself
//                            (`/crm/leads`). Matched with a trailing slash so the register is
//                            excluded by construction.
export const FULL_FOCUS_ROUTES = ['/crm/pipeline'];
export const RECORD_DETAIL_PREFIXES = ['/crm/leads', '/crm/opportunities'];
// Static sub-routes under a register that are NOT records (create flows, etc.) — they keep the
// suite tab row, so `/crm/leads/new` is not mistaken for a lead 360.
const NON_RECORD_SEGMENTS = new Set(['new', 'create', 'import']);

export function isFullFocusPath(pathname: string): boolean {
  if (FULL_FOCUS_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  for (const prefix of RECORD_DETAIL_PREFIXES) {
    if (!pathname.startsWith(`${prefix}/`)) continue;
    const next = pathname.slice(prefix.length + 1).split('/')[0]; // the segment after the register
    if (next && !NON_RECORD_SEGMENTS.has(next)) return true; // a record id → hide the suite tab row
  }
  return false;
}
