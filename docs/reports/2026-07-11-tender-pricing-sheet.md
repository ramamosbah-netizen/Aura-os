# Tender Pricing Sheet — Cost & Resource Breakdown → Client Quotation

**Date:** 2026-07-11 · **Branch:** `feat/tender-pricing-sheet`
**What it is:** the company's INTERNAL estimating flow from the legacy Aura / NEW-ERP apps,
rebuilt on the aura-os kernel: **tender + BOQ scope → per-item cost & resource breakdown
(the estimator's spreadsheet) → selling rates → one click generates the client-facing CRM
quotation.** Grounded in the legacy `PricingRun`/`PricingLine` Prisma models, NEW-ERP's
pricing grid, and the real "Cost & Resource Breakdown CCTV" sheet (tech AED 15/hr ·
engineer 20 · PM 40).

---

## 1. What shipped

### Domain — the sheet compiles into the existing rate engine (`modules/tendering`)
`ResourceBreakdown` mirrors the spreadsheet per BOQ item: material `supplyUnitPrice`
(per unit) + **manpower blocks** (technician / engineer / project manager — count × hours ×
AED/hr, per LINE, the way estimators plan) + transport, wastage %, accessories, subcontract.
`compileResourceBreakdown(sheet, qty)` converts it into per-unit `CostComponent`s
(labour hours ÷ qty, line lumps ÷ qty, wastage as % of supply) — so the EXISTING
`computeBuildUp` engine, `summariseEstimate` roll-up, and `aura_tendering_rate_buildups`
table price it unchanged. The structured sheet persists on the build-up (`resources` jsonb,
migration **0141**) so the editor re-opens exactly what was entered.

### API — `TenderPricingController`
- `GET /tendering/tenders/:id/pricing` — one fetch for the sheet page: tender, BOQ items,
  build-ups by item, tender estimate, **hourly-rate defaults** (module settings
  `tendering.rate.technician|engineer|projectManager`, fallback 15/20/40), and quotations
  already generated from this tender.
- `POST /tendering/tenders/:id/pricing/items/:itemId` — save one line's sheet: compiles,
  prices, **writes the selling rate back onto the BOQ item** (existing `applyToBoq` path).
- `POST /tendering/tenders/:id/quotation` — **the bridge**: one CRM quotation line per BOQ
  item (`[code] description (unit)` × qty at the build-up's selling rate; unpriced items
  fall back to their BOQ rate), `QUO-…` number from the numbering engine, customer from the
  tender's account snapshot, `sourceTenderId` link (migration 0141), created as a CRM
  **draft** (review → send). Emits `tendering.quotation.generated` on the tender aggregate.

### Web — `/tendering/tenders/[id]/pricing` (marked INTERNAL)
Sheet grid (code · scope item · qty · cost/unit · sell/unit · line total · margin · priced/
unpriced) with an expandable per-line editor: material / logistics & subcontract groups,
three manpower rows with live `= AED` per block, overhead % + profit %, and a **live
preview** (direct → +OH → +profit → sell rate + margin) computed with the same math the
server compiles. Totals bar folds the estimate (cost by type, overhead, profit, selling,
unpriced BOQ, tender value, margin, priced x/y). "Generate quotation →" creates the draft
and chips every generated quotation. Linked from the tender detail page.

### Latent bug fixed (migration **0142**)
`aura_crm_quotations.created_by` was `uuid` while every actor id in the platform is text
(`u-admin`, `sa:<id>`) — ANY authored quotation insert failed on Postgres. Surfaced by this
bridge's smoke; column aligned to `text` like the rest of the spine.

## 2. Verification

- **Live smoke 20/20** (built API, dev DB): tender + 2-item BOQ → line priced with the real
  CCTV sheet numbers at 0% margins → **selling rate 589.00 exactly matches the hand-computed
  sheet** (450 supply + 2% wastage + 200 accessories + 32 tech-hrs + 8 eng-hrs + 4 PM-hrs +
  300 transport over 10 nos) → repriced at 10% OH + 15% profit (745.08) → negative figure
  400 → payload carries buildUps/estimate/rates → estimate shows 1/2 priced + unpriced 2 200
  → BOQ rate written back → **quotation generated**: line 1 = 745.08 × 10, line 2 falls back
  to 55 × 40, QUO number, draft status, `sourceTenderId`, 5% VAT totals → sheet lists the
  quotation → readable in CRM → bare tender 400.
- Unit tests: tendering **21** (+3: sheet compile math incl. ÷qty and wastage, engine
  round-trip 5 890 line total, negative/zero guards) · crm 16 · migration policy gate green
  (142 files) · API/web/module builds green.
- UI walkthrough of the sheet page (see §3 note).

## 3. Notes & follow-ons

- Hourly-rate defaults read module settings — add `tendering.rate.*` keys to
  `/admin/module-settings` for admin editing (S).
- Quotation print/PDF (DMS print documents) already exists platform-side; the generated
  quotation flows through the normal CRM lifecycle (send → accept → convert to contract),
  so the deal chain now runs CRM → **tender → internal pricing → quotation** → contract.
- Legacy parity not carried over (deliberate): pricing templates/AI suggest, risk scoring
  (register #20), supplier-quote comparison (procurement has its own), revision chains
  (re-pricing replaces the build-up; the BOQ + audit trail keep history).
