# AURA OS — System State Scorecard

**Date:** 2026-08-05 · **Purpose:** answer three questions in one page — *what gaps do I have · which modules are complete · how finished is the UI*.

Everything here is **counted from the tree on 2026-08-05**, not estimated and not carried from an older report. Where a number needs a caveat it gets one. There are no completeness percentages, because nobody has measured one — counts you can re-run beat a score somebody guessed.

*Re-run any figure yourself:* `find modules/<m>/src -name "*.service.ts"` · `find apps/web/app/<m> -name page.tsx` · `grep -rl "@Controller('<m>" apps/api/src`

---

## 1 · What gaps do I have?

**38 open**, from the [consolidated gap register](2026-08-05-consolidated-gap-register.md) (50 rows, stable IDs `G-01`…`G-50`).

| Severity | Count | What they are |
|---|:--:|---|
| **P0** | **1** | `G-03` RLS inert at runtime — the app connects as the DB owner, so every policy is bypassed. **Config change, not code.** |
| **P1** | 9 | HTTP-edge hardening (`G-07`) · field capture (`G-25`–`G-27`) · SIRA/DCD + device schedules (`G-20`, `G-21`) · field-service loop (`G-14`, `G-15`) · survey→opportunity (`G-17`) · contract templating (`G-40`) · duplicate accounts (`G-11`) |
| **P2/P3** | 28 | Hardening, depth and strategic items |

**The four clusters**, in the order they cost you money:

1. **Security at the HTTP edge** — no Helmet, no CSP, no rate limiting, no SCIM. Verified absent (the register had carried this as "partial").
2. **The delivery-to-service spine** — commissioning and handover are built and automated; **field execution is not**. No technician mobile, no on-site checklist, no customer signature.
3. **The ELV vertical itself** — no SIRA/DCD compliance register, no device schedules, no cable schedules. These are what make it an *ELV* system rather than a good generic one.
4. **The field** — zero signature capture, zero camera capture, no offline.

> ⚠️ **Trust warning.** Roughly half the register was carried from older reports. When I drove 25 of those rows against the tree, **4 were wrong** — three understating the gap. **The ELV-vertical and module-depth rows have *not* been re-driven** and are the least trustworthy in the document. Two rows this week turned out to be pure fiction: one described a hole closed weeks earlier, one described a hole that never existed.

---

## 2 · Which modules are complete?

Counted, not scored. **Handlers** = API surface built. **Pages** = what a user can actually reach.

| Module | Domain | Services | Handlers | Pages | Tests | Read as |
|---|:--:|:--:|:--:|:--:|:--:|---|
| **crm** | 12 | 15 | 130 | 20 | 23 | 🟢 deepest module, front and back |
| **finance** | 20 | 15 | 96 | 21 | 23 | 🟢 deepest domain in the system |
| **procurement** | 6 | 5 | 35 | 9 | 7 | 🟢 balanced |
| **inventory** | 6 | 5 | 29 | 8 | 8 | 🟢 balanced |
| **quality** | 7 | 1 | 33 | 7 | 4 | 🟢 balanced (UI shipped 08-02) |
| **hr** | 12 | 1 | 49 | 10 | 9 | 🟢 balanced |
| **contracts** | 6 | 5 | 30 | 5 | 5 | 🟡 solid, UI shallow |
| **tendering** | 11 | 6 | 39 | 4 | 10 | 🟡 rich domain, **4 pages** — estimator UI is the thin part |
| **projects** | 11 | 10 | 47 | 5 | 12 | 🟡 rich domain, **no PM cockpit** — EVM exists but scattered |
| **subcontracts** | 4 | 1 | 20 | 5 | 4 | 🟡 balanced but shallow |
| **site** | 7 | 1 | 24 | 3 | 5 | 🟠 backend > UI |
| **hse** | 6 | 1 | 20 | 3 | 4 | 🟠 backend > UI |
| **fleet** | 6 | 1 | 27 | 3 | 4 | 🟠 27 handlers, 3 pages |
| **assets** | 6 | 1 | 16 | 3 | 4 | 🟠 backend > UI |
| **amc** | 4 | 1 | 22 | 3 | 3 | 🟠 22 handlers, 3 pages — **the field loop is the gap** |
| **engineering** | 8 | 1 | 37 | 1 | 4 | 🟠 **37 handlers, 1 page** — but see note |
| **doccontrol** | 5 | 1 | 20 | 1 | 5 | 🔴 20 handlers, **1 page** |
| **commissioning** | 2 | 2 | 14 | 1 | 2 | 🟡 new (08-01), 1 page by design |
| **market-intelligence** | 1 | 1 | 1 | 0 | 2 | ⚪ a seam, not a module |

**Reading the page counts.** A low count is not automatically a gap — `engineering` is one 1,853-line **tabbed hub** covering all 8 aggregates (drawings, RFIs, submittals, design changes, TQs, BIM), which a 2026-08-02 audit corrected after the same count misled it. **`doccontrol` has no such excuse: 20 handlers behind a single page.**

**The pattern across the estate:** the backend is consistently ahead of the UI. **854 API handlers across all controllers against 150 pages** (the per-module column above sums to 664 — the balance sits in admin, workspace, search, AI and other cross-cutting controllers). Nothing here is a stub — the domains are real and tested — but on eight modules a user cannot reach most of what is built.

**Service counts mislead too:** several modules (hr, quality, site, hse, fleet, assets, engineering, doccontrol, amc, subcontracts) expose one façade service over many domain aggregates. One service ≠ shallow.

**What I have *not* done:** a business-logic review of any module. I opened source in **6 of 19** while fixing gaps — finance, procurement, contracts, crm, and shallowly inventory and tendering. **13 modules I never opened.** No module's calculations have been verified against the ERP rules they implement.

---

## 3 · How finished is the UI?

**150 pages.** The design system exists; almost nothing uses it.

| Measure | Count | Of 150 |
|---|:--:|:--:|
| Pages on the shared UI kit (`components/ui/kit.tsx`, 11 components) | **2** | ~1% |
| Screens on the 360 record shell | **5** | ~3% |
| Screens using the shared create-drawer | 22 | 15% |
| Files styled with **inline `CSSProperties` objects** | **112** | 75% |
| Undefined tokens / off-brand hex remaining | **0** | ✅ |

**The honest summary: the token layer is finished, the component layer is not.**

Colour is now correct everywhere — all four residual classes are at zero, confirmed in the CSS the dev server actually serves. But the *structure* is still hand-rolled: three quarters of the app styles itself with inline objects, and the shared kit built to end that is used by two screens and three pickers.

**What is genuinely finished:**
- Design tokens, app-wide — light and dark
- Zero raw-UUID inputs (all 14 forms now use Project/Employee/Asset pickers)
- The 360 record shell, on the 4 CRM entities that have it
- Create-drawer, across 22 flows

**What is not:**
- The kit is shipped and unused — every new screen still reinvents buttons and tables
- Guidance stops at the contract: next-best-action exists on 4 CRM 360s and nowhere else
- Record actions stay silent ~4.4s with no pending state
- Zero signature capture, zero camera capture, no offline — the field is unserved
- No unified approvals inbox

---

## The one-paragraph answer

**Backend: strong and real** — 19 modules, 854 API handlers, 138 module test files, a genuine event-sourced deal chain, and the money cycle now governed end to end (maker-checker, approval matrix, AR cap, audit diffs). **Frontend: uneven** — CRM and Finance are cockpit-grade, eight modules can't be reached from the UI they have, and the design system is built but unadopted. **Security: one config flip from acceptable**, plus HTTP-edge hardening that was never there. **The ELV vertical — the reason this beats a generic ERP — is the least built part of it.**

---

## What would actually tell you more

Three measurements nobody has taken, in the order they'd change decisions:

1. **A per-module business-logic review.** Every completeness signal above is structural — file counts prove code exists, never that it is *correct*. Finance first (double-entry, WAC, EVM, retention, EOSB), then projects. Wrong logic there loses money silently.
2. **Re-run the 12-area readiness assessment.** `54/100` is from 2026-08-03 and eleven gaps have closed since — but merged rows are not a measured score, so nobody can quote a better number.
3. **Re-drive the ELV and module-depth rows** in the register. They are carried, and the last verification pass found 4 of 25 carried rows wrong.
