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
