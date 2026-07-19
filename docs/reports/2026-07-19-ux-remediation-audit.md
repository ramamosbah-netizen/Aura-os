# AURA OS — UX Remediation Audit & Neutral-Grey Retheme

**Date:** 2026-07-19
**Scope:** design-system tokens, WCAG 2.2 conformance, responsive shell, perceived performance
**Method:** static inspection + **live verification in a running browser** against `localhost:3000`
**Companion doc:** the NNG heuristic evaluation this remediates

---

## 0. Verification Provenance

Read this first. It is the part the previous two reports got wrong.

| Claim class | How it was established |
|---|---|
| Contrast ratios | **Computed** from hex values with the WCAG relative-luminance formula. Every number reproducible. |
| Token values | **Read out of the live DOM** via `getComputedStyle(document.documentElement)`. |
| Focus ring / skip link / responsive breakpoints | **Driven in a real browser** — keyboard events dispatched, `document.activeElement` and `getComputedStyle` inspected after each. |
| File/component counts | **Re-counted** on disk. |
| Scores | **None issued.** No numeric UX score appears in this document — see §6. |

Nothing in this report is an estimate presented as a measurement. Where something was not verified, it says so.

---

## 1. Corrections to the source heuristic evaluation

The evaluation it remediates was directionally right and numerically unreliable. Verified before acting:

| Claim | Reported | Actual |
|---|---|---|
| React components | 143 | **140** |
| `globals.css` lines | 1,270 | **1,269** |
| Components using ARIA | 15 | **17** |
| Components with loading state | "only 1 of 143" | **8** |
| "Escape closes drawers — **Fail**" | Fail | **Partial.** `FormDrawer.tsx:106` already handled Escape; `CreateDrawer` delegates to it, so Escape *did* work. The real gap was the focus trap. |
| Drawer ARIA | implied absent | `role="dialog"` + `aria-modal="true"` **already present**; toast already had `role="status"` |
| Sidebar "fixed 232px" | — | **Correct.** `app-shell.tsx:216`. An earlier check of mine grepped only the CSS file and wrongly called this unfounded. |

**All seven contrast ratios in the source were wrong**, each biased low:

| Pair | Claimed | Computed |
|---|---|---|
| body text on `--bg` | 14.2 | **15.70** |
| `--muted` on `--panel` | 3.7 | **4.17** |
| `--muted` on `--panel-2` | 2.6 | **3.36** |
| `--muted` light on white | 4.5 | **4.76** |
| `--accent` on `--panel` | 7.8 | **9.21** |
| `--good` on `--bg` | 9.4 | **10.18** |
| `--bad` on `--bg` | 5.6 | **7.00** — *passes AAA*; the source said it failed |

The **conclusion survived** — `--muted` genuinely failed AA on both dark surfaces — but it survived by luck. The two findings that drove most of this remediation (`--muted` failing, `--warn` identical to `--accent`) were both real.

---

## 2. Retheme — navy → neutral grey

The dark canvas was navy (`--bg: #0a0d14`, `--panel-2: #1a2640`). It is now near-zero-chroma grey, so the amber brand accent is the only saturated element on screen.

| Token | Was (navy) | Now (grey) |
|---|---|---|
| `--bg` | `#0a0d14` | `#0b0b0c` |
| `--panel` | `#0d1220` | `#131316` |
| `--panel-2` | `#1a2640` | `#1d1d21` |
| `--border` | `#1e2d44` | `#2b2b31` |
| `--border-strong` | `#2a3d54` | `#3c3c44` |
| `--text` | `#e0e8f0` | `#ededf0` |
| `--muted` | `#5a7a9a` | `#a8a8b2` |
| `--bg-glow` | `#12203c` (blue) | `#1c1c20` (neutral) |

The radial `--bg-glow` was the main reason the app still read blue even where panels were dark; it is now neutral.

**Light mode was neutralised to match** — it was blue-grey (`#f4f6fa` / `#16233a` / `--muted: #64748b`) and would have clashed with a neutral dark theme. It is now one system.

### Every foreground token, computed against all three surfaces

| Token | vs `--bg` | vs `--panel` | vs `--panel-2` | Worst case |
|---|---|---|---|---|
| `--text` `#ededf0` | 16.84 | 15.87 | 14.38 | ✅ AAA |
| `--muted` `#a8a8b2` | 7.68 | 7.24 | **7.13** | ✅ **AAA** |
| `--accent` `#f5a623` | 9.71 | 9.15 | 8.29 | ✅ AAA |
| `--good` `#2fd39b` | 10.22 | 9.64 | 8.73 | ✅ AAA |
| `--warn` `#ffd60a` | 13.94 | 13.14 | 11.90 | ✅ AAA |
| `--bad` `#ff7b7b` | 7.84 | 7.39 | 6.70 | ✅ AA |
| `--info` `#7ab8ff` | 9.49 | 8.94 | 8.10 | ✅ AAA |

`--muted` was deliberately pushed past AA to **AAA (7.13:1 worst case)** because ~990 call sites render secondary text in it — it is not a minor token, it is most of the text on screen.

Light mode `--accent` and `--good` were also darkened (`#8f5400`, `#076b52`): the previous values cleared AA against white but **failed against `--panel-2`**, which the source evaluation never tested.

### The `--warn` / `--accent` collision

Both were `#f5a623` in dark mode — a caution badge and a primary action button rendered the same colour. Now `--warn: #ffd60a`.

Honest limitation: hue separation is constrained by the amber brand (37° vs 50° is only 13° apart). **The separation is carried by lightness**, not hue — relative luminance 0.468 vs 0.694, a ~48% gap. Verified in the live DOM: `warnEqualsAccent: false`. Visible in the running app, where MEDIUM badges read yellow against the amber "Ask AURA Copilot" button.

---

## 3. Accessibility fixes — each verified live

### 3.1 Focus visible (WCAG 2.4.7) — was failing

Only `.input`/`.select`/`.textarea` had any focus style. Every `.btn` and every sidebar link was **invisible to keyboard users**. Added a `:focus-visible` rule covering links, buttons, `[role=button|tab|option]`, and `[tabindex]`.

**Verified live** — after a real Tab keypress:
```
activeMatchesFocusVisible: true
outline: solid 2px rgb(245, 166, 35)
```
on an element that previously had `outline-style: none`.

`:focus-visible` (not `:focus`) so mouse users don't get rings on click.

### 3.2 Skip to content (WCAG 2.4.1) — was absent

Added as the **first focusable element** in the shell (`app-shell.tsx`), targeting a new `<main id="main-content" tabIndex={-1}>`. Matters here specifically: the sidebar carries ~60 links that a keyboard user otherwise tabs through on every page.

**Verified live** — hard load, single Tab: the link is `document.activeElement`, `transform` animates from `translateY(-200%)` to `translateY(0)`, and it renders visibly at top-left.

Implementation note: it uses **`:focus`, not `:focus-visible`**. A skip link is only ever reached by keyboard, and the `:focus-visible` heuristic can miss when focus is restored programmatically — which would leave it focused but invisible. This was caught during live testing, not predicted.

### 3.3 Focus trap in drawers (WCAG 2.1.2) — was failing

The drawer is `aria-modal="true"`, but Tab escaped into the page behind it. Added to `FormDrawer.tsx`:
- focus moves into the drawer on open;
- Tab/Shift-Tab wrap at both ends, **and pull focus back if it has already escaped**;
- focus returns to the trigger element on close.

Escape already worked — the source evaluation was wrong about that.

### 3.4 Landmarks and state

`<aside aria-label="Primary">`, `<nav aria-label="Main navigation">`, `aria-current="page"` on the active link, `aria-hidden` on decorative glyphs, `title` on nav links (which becomes the only label when the rail collapses).

### 3.5 Motion

Added a `prefers-reduced-motion: reduce` block neutralising animation, transition, and scroll-behaviour globally. Not previously handled anywhere.

---

## 4. Responsive shell — the root cause was architectural

Mobile scored 15/100 and the source called it "3 breakpoints; sidebar fixed 232px; inline styles not responsive." The **middle clause is the actual cause of the other two**:

> Layout lived in inline `CSSProperties` objects. **Inline styles beat stylesheets**, so no media query could ever override them. The app was not "missing responsive CSS" — responsive CSS was *structurally unable to apply*.

Fix: moved layout out of inline style objects into CSS classes (`.app-sidebar`, `.crm-advisor-panel`), leaving only non-layout properties inline, with comments at both sites explaining why layout must not move back.

| Breakpoint | Behaviour | Verified |
|---|---|---|
| ≥1101px | Full 232px sidebar with labels | ✅ at 1280px |
| ≤1100px | Collapses to a 62px icon rail; labels/group titles hidden; `title` tooltips carry the names | ✅ at 800px |
| ≤720px | Sidebar becomes a fixed bottom bar (`flex-direction: row`, 62px, horizontally scrollable); `main` gains bottom padding | ✅ at 375px |

**A bug was caught in live testing here.** After the first pass the phone layout still reported `flex-direction: column` — `display`/`flexDirection` were *still* inline and still winning. Moving them to CSS produced `flexDirection: "row"`. Without driving it in a browser this would have shipped looking fixed and being broken.

**Also found and fixed while testing:** `crm-advisor.tsx` had `width: 320` inline and `position: fixed`. At 375px it covered the entire page — the mobile fix would have been worthless with the Advisor open. It now docks as a bounded bottom sheet (`max-height: 46vh`) above the nav bar.

At 375px: `horizontalOverflow: false`, and data tables scroll inside their own `overflow-x: auto` container rather than pushing the body wide.

---

## 4b. Page container — content alignment across all pages

**Symptom:** content did not line up from page to page, and on wide screens it hugged the left edge with dead space on the right.

**Measured cause.** There was no shared page container. `<main>` had `{ flex: 1 }` — zero padding, no max-width — so all 129 pages invented their own geometry inline:

| Page | max-width | padding | margin |
|---|---|---|---|
| Accounts portfolio | 1240 | `28px 28px 64px` | `0 auto` |
| Workspace hub | 1160 | `24px 28px 64px` | `0 auto` |
| Audit browser | 1400 | `28px 32px` | — |
| AMC | none | `32px` | — |
| Contacts (measured live) | 1200 | `28px 28px 64px` | **`0`** |

Several used `margin: 0` rather than `0 auto`, which is why content sat hard against the left on a wide viewport.

**Fix.** One scoped normalisation layer in `globals.css` defining `--page-gutter: clamp(16px, 2vw, 32px)`, consistent vertical rhythm, and centring, applied to the direct children of `#main-content`.

`!important` is used on **padding and margin only**. That is not laziness — the competing values are **inline styles**, which no stylesheet can override otherwise, and hand-normalising 104 page files would be large and error-prone. The rule is tightly scoped to page wrappers and carries opt-outs (`.full-bleed`, `.overlay-layer`).

**`max-width` is deliberately NOT forced** — see the regression below.

**Verified live** — identical geometry across modules at 1920px:

| Page | content left | width | padding |
|---|---|---|---|
| `/crm/contacts` | 349 | 1440 | `28px 32px 64px` |
| `/crm/accounts` | 349 | 1440 | `28px 32px 64px` |
| `/crm/activities` | 349 | 1440 | `28px 32px 64px` |
| `/projects` | 356* | 1440 | `28px 32px 64px` |

*7px delta is scrollbar presence, not a layout difference. Centring confirmed: 117px of margin on **both** sides where previously it was 0 left / 233 right.

### Full-estate sweep — all 104 static routes

Every static route (`page.tsx`, excluding dynamic `[id]` segments) was fetched and its DOM structure parsed, to prove the rule lands the same way everywhere rather than extrapolating from four pages.

| Check | Result |
|---|---|
| Routes checked | **104 / 104**, zero failures |
| Pages where `<main>` has >1 content child | **0** — the rule always targets exactly one wrapper |
| Pages with an empty `<main>` | **0** |
| Page roots that are `position: fixed/absolute` | **0** — none needs the `.overlay-layer` opt-out |
| Page roots that are not a `<div>` | **0** |
| **Distinct inline `max-width` values found** | **18** (720px → 1400px) |
| Distinct inline paddings found | 4 (`24px 28px 64px`, `26px 28px 72px`, `28px 32px`, `28px 28px 64px`) |
| Pages with no container of their own | 2 (`/admin/intelligence`, `/amc`) — these now inherit the default |

That "18 distinct max-widths / 4 paddings" line is the quantified version of the original complaint.

### A regression this sweep caught — and the design change it forced

The sweep surfaced that `/finance/fx` and `/finance/period-close` are authored at **`max-width: 720px`**, `/hr/eosb` at 760px, `/finance/statements` at 820px. These are **short forms**, deliberately kept to a narrow readable column.

The first version of the rule set `max-width: var(--page-max) !important` — which stretched `/finance/fx`, a **6-field form**, from 720px to **1368px**. Measured, not guessed. That is worse than the inconsistency it was meant to fix, and I introduced it.

**Design change:** column width is a per-page editorial decision and is no longer overridden. `max-width` is now applied *without* `!important`, so it acts only as a default for pages that set none. What was genuinely broken was **alignment**, not width — several pages used `margin: 0` rather than `0 auto`, pinning content to the left with dead space on the right, and gutters varied 24/26/28/32px. Those are normalised; width is left alone.

**Verified after the change** — all three cases behave correctly:

| Case | Page | Result |
|---|---|---|
| Narrow authored page | `/finance/fx` | keeps **720px**, centred (324px both sides), standard 32px gutter |
| Page with its own width | `/crm/contacts` | keeps **1200px**, centred (77px both sides) |
| Page with no width set | `/amc` | gets the **1440px** default, standard gutter |

### Two defects found while verifying this

1. **The rule initially broke the Advisor.** `<main>` also hosts a `position: fixed` child (`.crm-advisor-panel`), so the container rule squeezed it to a sliver of vertically-wrapped text. Fixed by excluding overlays from the selector. Only visible by looking at the page.

2. **The Advisor was covering page content.** As a fixed 320px right-anchored overlay it sat on top of wide tables and hid the right-most columns (`OUTSTANDING`, `HEALTH` on Accounts were unreadable). The Advisor now flags itself on `<html data-advisor="open">` and the page reserves a matching gutter.
   - Verified open: content right edge 1209, Advisor left edge 1253 → `contentClearsAdvisor: true`.
   - Verified dismissed: attribute removed, padding returns to symmetric 32px/32px, content reclaims full width.
   - Suppressed below 721px, where the Advisor docks to the bottom instead.

**Also removed:** a hardcoded `rgba(29, 38, 59, 0.4)` navy radial gradient in `amc-client.tsx` — a leftover from the old navy theme that reintroduced a blue cast on that one page after the retheme.

---

## 5. Perceived performance — partially addressed

The source scored this 46 and diagnosed it correctly: the system is fast but *feels* slow because every mutation is `fetch → await → router.refresh()` with nothing occupying the gap.

**Done:** `.skeleton` / `.skeleton-text` / `.skeleton-row` CSS plus a `components/ui/skeleton.tsx` exporting `Skeleton`, `SkeletonText`, `SkeletonTable`, and `SkeletonBoundary`. `SkeletonBoundary` announces `aria-busy` + a polite live region, because a purely visual skeleton is silent to screen-reader users.

**Not done — stated plainly:** the primitives exist but **are not yet wired into call sites**, and no optimistic-update or rollback pattern has been introduced. The blank flash on `router.refresh()` is *not* fixed. Retrofitting it across ~140 components is its own piece of work, not a token change.

---

## 6. What is NOT fixed

The source's P0/P1 list is mostly **feature work, not UX polish**, and none of it is addressed here:

| ID | Finding | Why not |
|---|---|---|
| F09 | No warranty / DLP tracking | New module — lifecycle work |
| F01 | PO supplier is free-text | Schema + FK + migration |
| F02 | PO has no line items | Schema + UI + migration |
| F07 | Gantt is read-only | Substantial interaction build |
| F08 | No project closeout wizard | New flow |
| F19/F15 | Offline / PWA | Service worker + manifest + sync strategy |
| F13 | No undo on destructive actions | Needs a command/undo layer |
| F18 | No i18n / RTL | Now *cheaper* — the neutral token layer removes hardcoded colour, but text direction is untouched |
| F03 | Blank flash on refresh | Primitives added; call sites not migrated |

**No UX score is issued in this document.** The source's dimension scores were self-declared expert estimates; re-scoring against my own remediation would be marking my own homework. The verifiable claims are the computed ratios and the live-DOM checks above. A real number requires task-based testing with actual users — which has still never been done, and remains the single largest gap in confidence about AURA's usability.

---

## 7. Files changed

| File | Change |
|---|---|
| `apps/web/app/globals.css` | Neutral grey dark + neutralised light tokens; `:focus-visible`; `.skip-link`; `.sr-only`; reduced-motion; **page-container normalisation + advisor gutter**; `.app-sidebar` + 2 breakpoints; `.crm-advisor-panel` + breakpoint; skeleton classes |
| `apps/web/components/app-shell.tsx` | Skip link; `<main id tabIndex>`; landmark labels; `aria-current`; nav `title`; layout moved out of inline styles |
| `apps/web/components/form-engine/FormDrawer.tsx` | Focus trap, focus-into-drawer, focus restore |
| `apps/web/components/crm-advisor.tsx` | Layout moved to CSS class for responsive docking; **`data-advisor` flag so the page can reserve a gutter** |
| `apps/web/components/amc-client.tsx` | **Removed hardcoded navy gradient** left over from the old theme |
| `apps/web/components/ui/skeleton.tsx` | **New** — skeleton primitives + announcing boundary |

**State:** `tsc --noEmit` clean (only pre-existing stale `.next` validator errors from the unrelated stashed Radar WIP); zero console errors in the running app; not yet committed.
