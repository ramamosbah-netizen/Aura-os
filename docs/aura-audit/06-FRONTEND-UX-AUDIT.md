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
| ~~**Silent error-swallowing**~~ **LARGELY RESOLVED (Rev 2.6)** | `VERIFIED_IMPLEMENTED` for load-bearing lists | `fetchJson` classifies the failure and `DataStateNotice` renders it; `getJson` is retained on purpose where an empty render is harmless (`apps/web/lib/api.ts`) |
| ~~Back-half modules under-surfaced (engineering/doccontrol = 1 page each)~~ | **RESOLVED (Rev 2)** for engineering (3 pages), doccontrol (4), site (6), quality (8), commissioning (2) — each with a register + 360 + transitions. **Still open** for hse/fleet/assets/amc (3 pages each, CRUD) | `02` page counts |
| ~~Near-zero UI E2E coverage (1 Playwright spec)~~ | **PARTIALLY RESOLVED (Rev 2)** — 10 specs, CI boots a real API. **Spine journeys still uncovered** (P0 G-03) | `apps/web/e2e` (`14`) |
| Accessibility / keyboard-nav not verified | `NOT VERIFIED` (unchanged) | no automated a11y checks found |
| Responsive/dark-mode parity not verified | `NOT VERIFIED` (unchanged) | not exercised in this audit |

### The error-swallowing issue (elaborated)

`getJson<T>` deliberately returned `null` when the API was unreachable or returned non-2xx, "so the UI can degrade gracefully." The consequence: **a 500, a 403, and an empty result set were indistinguishable to the page.** A tenant seeing an empty table could not tell whether there was genuinely no data, they lacked permission, or the backend failed. For an ERP where "is this list actually empty?" is a financially material question, that masks errors and undermines trust.

**Resolved at Rev 2.6** (commit `e5b6d7b8`) for every load-bearing list:

- `fetchJson` returns either the data or a **classified** error — `unauthorized` · `forbidden` · `not-found` · `server` · `unreachable` — and `DataStateNotice` renders each distinctly from `EmptyState`. A refusal renders amber rather than red: it is the system working, not a fault.
- `getJson` is **kept**, delegating to `fetchJson`, so the ~440 remaining call sites are untouched. That is deliberate rather than unfinished: for badges, counts and secondary panels an empty render is the correct degradation, and rewriting 451 call sites to prove a point would be churn.
- Three pages already tried to draw this distinction and labelled every failure "API offline" — which is wrong for a 403 and unhelpful for an expired session.
- The wording is the remedy, so it is unit-tested: no message may claim emptiness, a refusal must say the records may exist, and an expired session must say what to do.
- A browser test asserts a denied portfolio read renders as denied. **Negative control:** reverting the page to the old behaviour makes that test fail, so the assertion is load-bearing.

## Findings

- The frontend is **real and reasonably broad**; at Rev 2 its **depth is markedly less uneven**, but its **error semantics remain lossy**.
- No evidence of fake actions or manually-entered UUIDs in the sampled surface (the 2-file mock hit is negligible), which is a positive signal versus the prompt's common failure modes.
- **Rev 2:** the delivery-half modules gained registers, 360 pages and in-page state transitions, and those journeys are now asserted by browser E2E (`14`). The `getJson` masking issue (G-05) is untouched and is now the single largest UX defect, since more of the product's critical paths route through it.

**Frontend/UX maturity score: 64 → 68 (Rev 2) → 72/100 (Rev 2.6)** — real integration, good IA, a genuinely deeper delivery half, an authenticated spine E2E, and error states that no longer lie about emptiness. Still held back by unverified a11y/responsive parity and by the ~440 call sites that remain on the degrade-to-empty helper.
