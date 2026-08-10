# 06 — Frontend / UX Audit

## Stack & integration — `VERIFIED_IMPLEMENTED`

- **Next.js App Router**, React Server Components, 151 `page.tsx` across ~35 top-level route groups (`apps/web/app`).
- **Real API integration** (not mock): `apps/web/lib/api.ts` — `getJson` fetches `${AURA_API_URL}/api/v1/...` with the httpOnly session cookie forwarded as `Authorization: Bearer` (`authHeader()`), `cache: 'no-store'`. Session decoded for display only; the API verifies.
- **Optimistic auth gate** in `apps/web/proxy.ts` (Next proxy) bounces anonymous users to `/login` when `WEB_AUTH_REQUIRED=true` (real authz is at the API).
- **Mock/hardcoded data:** grep found only **2** `.tsx` files with mock/TODO markers — the UI is genuinely backed by the API, not stubbed.

## Route groups present

`admin, ai, amc, assets, commissioning, contracts, crm, doccontrol, documents, engineering, events, finance, fleet, handover, hr, hse, inbox, intelligence, inventory, notifications, operations, procurement, projects, quality, search, site, subcontracts, tendering, views, workspace` + `login`, root cockpit, and global `error.tsx` / `not-found.tsx` / `loading.tsx` / `global-error.tsx`.

## Strengths

- Coherent information architecture (workspace → domain → 360 record pages), per the platform's UX doctrine.
- Global error/loading/not-found boundaries exist at the app root.
- Server-Component data fetching keeps identity server-side (httpOnly cookie never exposed to client JS).

## Weaknesses / gaps

| Finding | Status | Evidence |
|---|---|---|
| **Silent error-swallowing** — `getJson` returns `null` on *any* non-OK or thrown response | `PARTIALLY_IMPLEMENTED` (UX risk) | `apps/web/lib/api.ts` `getJson` catch → `return null` |
| Back-half modules under-surfaced (engineering/doccontrol = 1 page each) | `PARTIALLY_IMPLEMENTED` | `02` page counts |
| Near-zero UI E2E coverage (1 Playwright spec) | `MISSING` | `apps/web/e2e` (`14`) |
| Accessibility / keyboard-nav not verified | `NOT VERIFIED` | no automated a11y checks found |
| Responsive/dark-mode parity not verified | `NOT VERIFIED` | not exercised in this audit |

### The error-swallowing issue (elaborated)

`getJson<T>` deliberately returns `null` when the API is unreachable or returns non-2xx, "so the UI can degrade gracefully." The consequence: **a 500, a 403, and an empty result set are indistinguishable to the page.** A tenant seeing an empty table cannot tell whether there is genuinely no data, they lack permission, or the backend failed. For an ERP where "is this list actually empty?" is a financially material question, this masks errors and undermines trust. **Recommend** distinguishing auth/permission/error states from true-empty, at least for spine record pages.

## Findings

- The frontend is **real and reasonably broad**, but its **depth is uneven** and its **error semantics are lossy**.
- No evidence of fake actions or manually-entered UUIDs in the sampled surface (the 2-file mock hit is negligible), which is a positive signal versus the prompt's common failure modes.

**Frontend/UX maturity score: 64/100** — real integration and good IA, held back by error-state masking, back-half thinness, and unverified a11y/responsive/E2E.
