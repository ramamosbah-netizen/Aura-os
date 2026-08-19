// Display policy for dates and times rendered in the browser.
//
// Both halves of this exist to keep server-rendered text and hydrated text identical. A client
// component formats once on the server and again in the browser; if the two strings differ,
// React discards the whole subtree and re-renders it, logging an uncaught "Hydration failed".
//
//   locale   — Node resolves to en-AE (13/08/2026); a browser on en-US renders 8/13/2026.
//   timeZone — both sides format in their own zone, so a viewer outside the server's zone
//              crosses a day boundary (12/08 vs 13/08) even when the locale agrees.
//
// en-AE rather than en-GB: the two agree on dates, but en-GB renders 24-hour time where en-AE
// renders 12-hour, and en-AE is what the server already resolves to.
//
// Asia/Dubai rather than the runtime's zone: nothing sets TZ in the container or CI, so the
// server's zone is currently whatever the host happens to be — UTC in a container, +04 on a
// dev machine. Pinning makes an invoice dated 13 Aug read 13 Aug for every viewer, which is
// the behaviour a UAE business wants and removes the deploy-dependent rendering.
//
// These are business-date semantics. A field that genuinely means "this instant, where you are"
// (a live clock, a "last seen" ticker) should not use them.
export const DISPLAY_LOCALE = 'en-AE';
export const DISPLAY_TIME_ZONE = 'Asia/Dubai';

/**
 * The viewer's own IANA zone, read at the moment it is asked for.
 *
 * The deliberate opposite of DISPLAY_TIME_ZONE, and the exception the note above describes: when
 * a user schedules a message for 08:00 they mean 08:00 where they are, so the real zone is what
 * has to reach the API. It lives here because this module is the one place allowed to construct
 * a formatter, which keeps every Intl construction out of client components where an unpinned one
 * would be a hydration bug.
 *
 * A function rather than a constant: read during a module's evaluation it would capture the
 * SERVER's zone and hand it to every viewer.
 */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DISPLAY_TIME_ZONE;
}
