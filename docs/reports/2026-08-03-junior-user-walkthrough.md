# AURA OS — Junior-User Walkthrough (screen-by-screen)

**Date:** 2026-08-03 · **Method:** live app (API :4000 + web :3000), server-rendered HTML of each real screen, route-vs-nav diff, form-component source, deal-chain reactor wiring, approval-service source, and design-token/component-style audit. Browser pane was hidden → no pixel/interaction pass (responsiveness and true rendered dark-mode not eyeballed); everything below is verified from source or live API, not impressions.

## Verdict
The domain modelling and per-screen copy are genuinely strong for ELV. The gaps a **new junior user** hits are mostly **operational usability and data hygiene**, not missing features.

---

## 🔴 P0 — the systemic newcomer trap: hand-typed UUIDs — ✅ FIXED (zero UUID inputs app-wide)
14 create-forms asked the user to type a **raw project/employee UUID** (placeholder = `"uuid"`), with **no picker**:

`daily-report`, `inspection-request`, `itp`, `ncr`, `snag`, `site-instructions`, `submittals`, `toolbox-talks`, `risk-assessment`, `calibration`, `mar` (material approvals), `timesheet`, `attendance`, `appraisal`.

A junior site/QA/HSE user cannot know a UUID → these daily-use forms are effectively unusable for them.
**Proof of inconsistency:** Commissioning, Handover, Engineering, PO-create, HSE-Control already use proper name dropdowns. The capability exists; the operational forms just don't use it.

**✅ FIX (2026-08-03):** Built reusable `ProjectPicker` (`components/ui/project-picker.tsx`, `GET /api/projects/projects`, 18 projects) and `EmployeePicker` (`components/ui/employee-picker.tsx`, `GET /api/hr/employees`, 18 employees), both returning the id.

Migrated **all 13 project/employee forms** onto them (verified 0 `placeholder="uuid"` inputs remain app-wide except one unrelated entity):
- **ProjectPicker (10):** `daily-report`, `inspection-request`, `itp`, `ncr`, `snag`, `site-instructions`, `submittals`, `toolbox-talks`, `risk-assessment`, `mar`, + the optional project on `timesheet`.
- **EmployeePicker (3):** `attendance`, `appraisal`, `timesheet`.
- **Not applicable:** `calibration` had no project field (false positive — matched an unrelated `placeholder="optional"`).
- **AssetPicker (1):** `asset-disposal` (`GET /api/assets`, hides already-disposed items).
- **Result: ZERO raw UUID input elements remain app-wide** (`grep '<input … placeholder="uuid"'` → 0).
- **Verification:** typecheck clean on all migrated files; live DOM on `/site/daily-reports`, `/quality/ncrs`, `/assets/disposals` shows `remainingUuidInputs: 0` and the pickers rendering.

## 🔴 P0 — first-run dead wall
Fresh copy had 11 pending migrations → **every business route 503** until `db:migrate` **and an API restart**. No in-app remedy. An evaluator opening it cold sees a fully dead app.
**Fix:** auto-run migrations on boot in dev, or a friendly "setup needed" screen instead of blanket 503.

## 🟠 P1 — test/junk records pollute real lists
Projects, Commissioning, Handover, Quotations show `Ledger Test`, `Cost Engine Test` (dupes), `tst`, `test`, `QT-AUTHOR-1` as primary rows. A newcomer can't tell demo/real from dev-junk → app looks unfinished.
**Fix:** clean the seed; tag or hide `*_test` fixtures.

## 🟠 P1 — AMC screen is a different app
`/amc` calls itself **"Asset Management & Contracts"** while the rest of the app says **"Service (AMC)" / Annual Maintenance** — acronym expanded two ways. Its UI (🎫 tickets, 📍 GIS dispatch board, "Loading tickets…") uses a different visual language than the clean tabular modules. Feels bolted-on.
**Fix:** reconcile the name and align to the standard list/table pattern.

## 🟡 P2 — IA / discoverability
- **"Opportunities" is not a nav word.** The core entity (34 records) lives under **Pipeline → /crm/leads**, which opens Lead-first. Newcomers won't find it.
- **Orphan pages:** `/crm/commercial` and `/tendering/pricing` exist but are unreachable from nav.
- **Slow first paint:** first hit on each route ~5–7s showing only "Loading…" (partly dev-mode) with no progress cue.

## 🟡 P2 — the journey's first step is missing
No **pre-sales site inspection/survey** intake that starts an opportunity — `site` module is execution diaries only (Daily Reports, Instructions). The ELV journey the business runs on begins one step earlier than the app supports.

---

## 🟠 P1 — UI/UX consistency (two design vocabularies) — ⏳ FIX STARTED
The **foundation is professional**: disciplined token palette (dark-first navy/near-black + one amber accent + semantic good/warn/bad/info), theme-aware, light-mode contrast tuned for WCAG. Not over-coloured.

**✅ FIX (2026-08-03):** Built the **shared UI kit** (`components/ui/kit.tsx`) — `Button` (primary/neutral/danger/ghost), `Field`, `Input`, `Select`, `Card`, `KpiTile`, `Badge`, `Table/Th/Td` — all on the **correct tokens** (`--text`/`--panel`/`--accent`/`--border`/`--good`/`--bad`/`--warn`), no `--fg`/`--surface`, no hardcoded hex. Migrated `daily-report-client` + `inspection-request-client` onto it: verified in the live DOM the primary button now renders `rgb(245,166,35)` = the amber `--accent` (was off-brand blue `#2563eb`), KPI/status colours use semantic tokens, and inputs use `--text`/`--panel` (fixes the invisible-input-text risk). **Remaining: migrate the other ~64 token-drift screens onto the kit.**

**Original findings (execution drifts badly on the junior-facing screens):**
- **No shared UI kit.** Only 5 primitives exist (create-drawer, empty/error-state, loading, skeleton). **No shared Button, Input, Select, Card, Table, Badge, KpiTile.** → 153 components define their own inline style objects; 111 hardcode hex colors.
- **~66 screens use a broken/legacy token vocabulary:** `var(--fg)` and `var(--surface)` — which are **undefined** (0 defs in globals.css) — plus blue `#2563eb` where the brand is amber. Real defined names are `--text` / `--panel` / `--accent`.
  - Consequence: on those screens input text `color: var(--fg)` and input bg `var(--surface)` resolve to nothing → **low-contrast / invisible input text** risk; KPI numbers hardcode `#16a34a`/`#dc2626` instead of `--good`/`--bad` so they don't theme.
- **Buttons inconsistent:** most operational screens render inline `<button style={st.btn}>` with per-file sizes/colors; only ~17 files use any shared Button. Size, colour, disabled-state vary screen to screen.
- **Font:** generic system stack (Segoe UI/Roboto) — professional-neutral, but no crafted typographic identity (no next/font).

**Net for a junior:** polished, guided experience in CRM; rougher, sometimes low-contrast, guidance-less screens exactly where they work (Site/Quality/HSE/HR).
**Fix:** one shared UI kit (Button/Input+Picker/Select/Card/Table/KpiTile/Badge) on the correct tokens; migrate the 66 legacy-token screens; delete `--fg`/`--surface`/hardcoded hex.

---

## 🔴 P0 — Lead → Invoice cycle: automation, approval & guidance
Traced the full money cycle from the deal-chain reactor (`cross-module-subscriber.ts`) and the approval services.

**The cycle (manual gate → what auto-fires next):**
| # | Step | Manual/Auto | Approval (manager/admin)? | Junior guide on screen? |
|---|------|-------------|---------------------------|-------------------------|
| 1 | Lead → qualify → **Convert** to Opportunity | Manual (1 click) | none | ✅ Lead 360 next-action |
| 2 | Opportunity → **create Quotation** | Manual | none | ✅ Opp 360 next-action |
| 3 | Quotation **Approve → Send → Accept** | Manual clicks | 🔴 **no role check**; approve only *locks the baseline*, does **not** auto-send | ✅ Quotation 360 (per-status next-action) |
| 4 | Accepted quote → **Convert to Contract** | Manual (1 click); *tender path: award → **auto** contract* | none | ✅ Quotation 360 |
| 5 | Contract **Sign** → Project | Sign manual → **Project auto-created** (+WBS/CBS) | 🔴 no role check | ❌ none on contract screen |
| 6 | Project → measure → **IPC certify** → AR invoice | Certify manual → **AR invoice auto-drafted** | 🔴 no role check | ❌ none |
| 7 | AR Invoice **post/send** | Auto-*drafted*, then manual post | 🔴 no role check | ❌ none |

**Findings:**
- **"Automatic after a manager/admin approves" is NOT how the commercial cycle works.** True threshold approval (auto-approve below a limit, else → `pending_approval`) exists **only in Procurement** (`ApprovalMatrixService`, PO/PR). The commercial money cycle (quotation-approve, contract-sign, IPC-certify, invoice-post) has **no approval matrix, no role enforcement, no maker-checker** — a junior can run a deal from quote to invoice alone, and each approval only *unlocks* the next step, never auto-advances it.
- **Segregation-of-duties risk:** same user can approve + send + sign + certify + invoice with no second sign-off.
- **Guidance stops at the contract.** The next-best-action helper exists on only 4 CRM records (Lead/Opp/Quotation/Account 360). Contract → Project → IPC → Invoice have **no next-action guide** — and those are the raw-UUID / undefined-token screens above.
- **AI can help but isn't wired to guide.** Copilot (⌘J) is context-aware chat and there's an autonomy engine that can *execute* proposals — but it is not surfaced as a step-by-step "how do I do this" guide on the delivery/finance screens.
**Fix:** extend the Procurement approval-matrix pattern (thresholds + roles) to quotation-approve / contract-sign / IPC-certify / invoice-post so a junior submits and a manager/admin approves → next draft auto-generates; and extend next-best-action + AI step-guide onto Contract → Invoice.

---

## Fix convergence
All three audits collapse to **two build efforts**:
1. **Shared UI kit + token migration** — Button/Input/**ProjectPicker**/Select/Card/Table/KpiTile/Badge on the real tokens; migrate the 66 legacy-token screens; delete `--fg`/`--surface`/hardcoded hex. Simultaneously fixes clear-buttons, layout, over-colour, invisible-input-text, and the 14 raw-UUID forms.
2. **Commercial approval workflow + guidance** — approval-matrix + maker-checker across the money cycle, plus next-best-action / AI step-guide on Contract → Invoice.

---

## What's genuinely good (keep)
- Delivery workspace bundles the whole chain in one tab row: Tenders → Contracts → Projects → Variations → Schedule (Gantt) → Commissioning → Handover → Payment Certificates.
- Every screen has real, teaching-quality ELV copy (e.g. Commissioning: "record its test-point pass rate, then commission it with a witnessed sign-off").
- Clear primary CTAs and inline stage actions ("Sign →", "Convert →", "+ New …").
- No dead nav links — every sidebar href resolves.
- Rich, live demo data and a real Pipeline cockpit (Radar/Board/List/Analytics with live lead scoring).
