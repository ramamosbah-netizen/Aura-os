'use client';

import { useEffect, useState } from 'react';

/**
 * True once React has hydrated this component in the browser.
 *
 * Server-rendered markup looks interactive but is dead. A click that lands before hydration is
 * swallowed in silence — no request, no error, no state change, not even a pressed button. On a
 * governed workflow screen that reads as "I hit Approve and nothing happened", and the user's only
 * recourse is to guess and click again. Controlled inputs are worse: text typed into them is
 * written to the DOM and then thrown away when React takes over, so the field looks filled while
 * the component's state is still empty, and the command submits with nothing in it.
 *
 * This is not a hypothetical. It was the cause of two intermittent failures in the browser suite —
 * a permit approval whose PUT was never sent at all, and a sign-in that posted blank credentials
 * and was told, correctly, that they were invalid.
 *
 * `useEffect` runs only on the client, after hydration, so this is `false` in the server-rendered
 * HTML and `true` from the moment the handlers exist. Gate a control's `disabled` on it and the
 * control stops claiming it can act before it can. That also makes the behaviour testable:
 * Playwright's `click()` and `fill()` both wait for an element to be enabled, so a spec no longer
 * has to guess at hydration timing.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
