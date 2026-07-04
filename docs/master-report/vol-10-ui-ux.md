# Volume 10 — UI / UX System

[← Master index](README.md)

Next.js 16 (App Router) + React 19. 93 pages, 84 components, one design-system stylesheet
(`apps/web/app/globals.css`, ~580 lines) built on CSS custom properties — no UI framework
dependency (deliberate: no Tailwind/MUI lock-in; the token layer is the contract).

---

## 1. Design Language

Dark-first, low-chroma professional surface: deep panel backgrounds, 1px hairline borders,
soft-radius cards (10–14px), restrained accent usage, uppercase micro-labels for section
heads, monospace for reference numbers. The voice: **dense but calm** — enterprise data
density without dashboard-toy noise. Product language pass (2026-07-02 waves) normalized
terminology across modules (register/ledger/record verbs).

## 2. Colors

CSS custom properties, both themes (`globals.css`):

| Token family | Purpose |
|---|---|
| `--bg`, `--panel`, `--panel-2` | page / card / inset surfaces |
| `--fg`, `--muted` | text hierarchy |
| `--border` | hairlines |
| `--accent`, `--accent-soft` | brand + soft fills |
| `--good/-soft`, `--warn/-soft`, `--bad/-soft` | semantic status (badges, banners, form errors) |
| shadows, overlay | drawer/dialog depth |

Rule: components consume tokens only — theme switching is token swapping.

## 3. Typography

System font stack (UI); monospace for codes/amounts in table cells (`tdCode` pattern);
scale: 28px page titles → 16px section titles → 13.5px body/table → 12.5px labels/hints →
11px badges. Letter-spacing tightened on display sizes, expanded on uppercase micro-heads.

## 4. Spacing

Grid rhythm: page gutter 28px · card padding 14–20px · form grid gap 16px · table cell
12px×10–16px · 8px radius inputs / 10–14px cards. Forms: 2-column grid, `span-2` for wide
fields, single column under 640px.

## 5. Components (the working set)

| Family | Classes / files |
|---|---|
| Buttons | `.btn`, `.btn-primary`, `.btn-ghost` (+disabled/hover/active states) |
| Inputs | `.input`, `.select`, `.textarea`, focus rings, `.input-error` |
| **Drawer** | `.drawer`, `.drawer-overlay/-head/-title/-sub/-body/-foot/-error` — slide-over with animation, ESC/backdrop close, aria-modal |
| Tables | `.data-table` with row hover; legacy inline-style tables remain on some server list pages [Gap being retired] |
| Badges | `.badge`, `.badge-good/-warn/-bad/-accent` |
| Toast | `.toast` (+status dot) |
| Form engine layout | `.fe-grid/-section/-tabs/-tab/-accordion/-panel/-card/-columns/-warning/-toolbar/-chevron` |
| Lines editor | `.lines-editor/-head/-row/-foot/-total` (VAT line items) |
| Record chrome | breadcrumbs, record tabs (cap 8), recent items |

## 6. Drawer

The platform's primary create/edit surface (Volume 5): right slide-over, form-engine rendered,
validation summary in the footer, rule warnings/errors as banners, plugin toolbar (AI fill /
AI review) in the header, toast + `router.refresh()` on save. Z-index sits above the AI dock.

## 7. Tables

Register pattern: full-width panel, uppercase muted headers, hairline row separators, badge
status cells, row-level action buttons (approve/resolve/edit), empty-state sentences.
CSV export buttons on key lists. Virtualization not needed at current volumes [watch item].

## 8. Forms

Entirely metadata-driven (Volume 5). UX behaviors: required markers, first-submit-only error
reveal (`touched`), inline field errors, live computed fields, prefill-on-select (`fills`),
option-driven payload extras, ESC-safe busy states.

## 9. Cards

`.fe-card` + dashboard stat cards (finance/hr/procurement/inventory/projects dashboards);
glassmorphism variant lives in the assets module (being normalized to tokens).

## 10. Charts

**[Gap — P1 for exec credibility].** Current visualization: progress bars (site
progress-mapping), S-curve data (tabular), stat tiles on dashboards. No charting library yet;
decision pending (recommend lightweight SVG/uPlot over heavy libs). Volume 16 owns this.

## 11. Animations

Drawer slide-in (`@keyframes slideIn`), chevron rotations, hover transitions (0.15–0.2s),
toast auto-dismiss (2.6s). Reduced-motion media query [P3].

## 12. Accessibility

Present: aria-modal dialogs, role=tablist/tab/tabpanel (form tabs), aria-labels on icon
buttons, focus rings, keyboard ESC, semantic tables. **Not audited**: full keyboard traps,
screen-reader passes, contrast verification [P2 — Volume 21 checklist].

## 13. Dark Mode

✅ Default; light theme via token swap. Per-user preference persisted.

## 14. Mobile

Responsive basics (single-column forms <640px, overflow-x tables, drawer full-width on small
screens). **No mobile app / PWA** [Gap — Volume 24 field-first design]. The sidebar/suite
navigation is desktop-oriented; a mobile shell is a Version-2 roadmap item (Volume 20).

## 15. Shell UX (the 12 product-experience axes — all shipped 2026-07-03, PR #20)

Workspace (My Work) · global search · universal inbox · recent items · breadcrumbs · record
tabs · ⌘K palette verbs · context AI dock · feed filters · demo data · product language ·
login. Reference: `docs/reports/2026-07-02-product-experience-gap-verification.md`.

## 16. Command Center (homepage) — shipped 2026-07-03, branch `feat/command-center`

The `/` homepage is an **attention-first Enterprise Command Center**, not a widget grid. It
answers one question — *what requires my attention now, and what should I do next?* — along the
Awareness → Intelligence → Prioritization → Action arc:

- **Business-health ring** — an explainable 0–100 score (`computeBusinessHealth`) with named
  drivers (decision backlog, aging approvals, budget variance, win rate) and a band
  (strong/stable/at-risk/critical), rendered as a conic-gradient ring in the hero.
- **AI Daily Briefing** — pulled through the existing `POST /api/intelligence/insights` seam;
  degrades gracefully to a clear message when no model key is configured.
- **"Needs your attention"** — a single ranked, severity-tagged feed (`buildAttentionFeed`)
  scoring every pending decision from the universal Inbox (13 kinds) by action weight × log-scaled
  money value × age, plus derived project budget-risk items. Each row deep-links (`Open→`) to the
  exact record to act.
- **"What to do next"** — the top-3 as imperative next actions (`recommendedActions`).
- Right rail: **Operations / Financial / Risk & Compliance** snapshots, **Quick Actions** (9 create
  shortcuts), and the **live event spine**.
- CEO / CFO / PM dashboards are preserved as switchable command perspectives.

**Architecture:** the scoring + health logic is framework-free and unit-tested in
`shared/src/command-center/` (`attention.ts`, `health.ts` — 7 tests), so it is reusable
server-side (digest emails, mobile) and every number is explainable. The homepage adds **no new
API endpoints and no cross-module joins** — it reuses `InboxService`, the intelligence
pipeline/project ledgers, and the `AiService` briefing seam. UI: `apps/web/components/command-center.tsx`,
wired via `role-dashboard-shell.tsx`. Reference: `docs/reports/2026-07-03-enterprise-command-center.md`.

---

*Next: [Volume 11 — Workflow Catalog](vol-11-workflow-catalog.md)*
