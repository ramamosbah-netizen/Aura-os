# 06 — Frontend / UX Audit

## Stack & integration — `VERIFIED_IMPLEMENTED`

- **Next.js App Router**, React Server Components, **164** `page.tsx` (Rev 1: 151) across ~35 top-level route groups (`apps/web/app`).
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
| **Silent error-swallowing** — `getJson` returns `null` on *any* non-OK or thrown response | `PARTIALLY_IMPLEMENTED` (UX risk) — **unchanged at Rev 2** | `apps/web/lib/api.ts` `getJson` catch → `return null` |
| ~~Back-half modules under-surfaced (engineering/doccontrol = 1 page each)~~ | **RESOLVED (Rev 2)** for engineering (3 pages), doccontrol (4), site (6), quality (8), commissioning (2) — each with a register + 360 + transitions. **Still open** for hse/fleet/assets/amc (3 pages each, CRUD) | `02` page counts |
| ~~Near-zero UI E2E coverage (1 Playwright spec)~~ | **PARTIALLY RESOLVED (Rev 2)** — 10 specs, CI boots a real API. **Spine journeys still uncovered** (P0 G-03) | `apps/web/e2e` (`14`) |
| Accessibility / keyboard-nav not verified | `NOT VERIFIED` (unchanged) | no automated a11y checks found |
| Responsive/dark-mode parity not verified | `NOT VERIFIED` (unchanged) | not exercised in this audit |

### The error-swallowing issue (elaborated)

`getJson<T>` deliberately returns `null` when the API is unreachable or returns non-2xx, "so the UI can degrade gracefully." The consequence: **a 500, a 403, and an empty result set are indistinguishable to the page.** A tenant seeing an empty table cannot tell whether there is genuinely no data, they lack permission, or the backend failed. For an ERP where "is this list actually empty?" is a financially material question, this masks errors and undermines trust. **Recommend** distinguishing auth/permission/error states from true-empty, at least for spine record pages.

## Findings

- The frontend is **real and reasonably broad**; at Rev 2 its **depth is markedly less uneven**, but its **error semantics remain lossy**.
- No evidence of fake actions or manually-entered UUIDs in the sampled surface (the 2-file mock hit is negligible), which is a positive signal versus the prompt's common failure modes.
- **Rev 2:** the delivery-half modules gained registers, 360 pages and in-page state transitions, and those journeys are now asserted by browser E2E (`14`). The `getJson` masking issue (G-05) is untouched and is now the single largest UX defect, since more of the product's critical paths route through it.

**Frontend/UX maturity score: 64 → 68/100 (Rev 2 re-estimate)** — real integration, good IA, and a genuinely deeper delivery half; still held back by error-state masking, the four remaining CRUD modules, and unverified a11y/responsive plus the missing spine E2E.
