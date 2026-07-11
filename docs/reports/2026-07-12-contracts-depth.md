# Contracts Depth — Bonds/Guarantees, Contract 360, Register

**Date:** 2026-07-12 · **Branch:** `feat/contracts-depth`
**Why:** the contract was the deal chain's next bottleneck — a flat detail page and a
5-column list, while the chain's CLOSE (award → obligations → bonds → milestones →
certificates → project) had no home. Obligations/clauses/IPCs existed as APIs; bonds
did not exist at all.

---

## 1. What shipped

### Bonds & guarantees — new entity (migration **0149**)
`aura_contract_bonds`: kind (performance / advance-payment / retention / warranty /
tender bond), guarantee no., bank, amount, issue + **expiry date (the commercial
watchpoint)**, status `active → released / called / expired` with guarded transitions.
`BondService` (+ pg/in-memory stores, module wiring) emits `contracts.bond.added|released|called`;
`GET /contracts/bonds/expiring?days=` is the tenant watchlist. An expired-unnoticed
performance bond is a real ELV/MEP commercial risk — the register now turns them red.

### Contract 360 (`/contracts/contracts/[id]` rebuilt)
- **Workflow**: draft → **Activate/Sign (→ the reactor creates the Project)** →
  Complete ✓ / Cancel — with the success note telling the user what the chain just did.
- **Commercial summary**: value · certified-to-date · % complete · retention held
  (from the IPC summary) · obligations open/overdue · breached · active bonds + value ·
  bonds expiring ≤30d.
- **Chain strip**: `◳ Tender ← ✎ Quotation ← ▤ CONTRACT → ▦ Project` — quotation found
  by `convertedContractId`, project by `contractId`; missing links render honestly
  ("no tender (direct)", "project appears on activation").
- **Tabs**: Obligations & milestones (add drawer w/ type incl. `milestone`, responsible
  party, due date; Met ✓ / Breach ✗ / Waive actions; overdue in red) · Bonds & guarantees
  (add drawer, Release / Called / Expired actions, expiry ⚠/✗) · Payment certificates
  (IPC register for this contract + link out).

### Contracts register (`/contracts/contracts` rebuilt)
KPIs: Active contracts (count·value) · Draft (unsigned) · Completed value ·
**Bonds expiring ≤30d** (red). Table: contract + ref · client → Account 360 · value ·
status · **chain chips** (◳ tender / ▦ project or "on signing") · per-contract bond watch ·
Sign → / Complete workflow buttons · search + status filter.

### Plumbing
BFF routes: bonds (list/create/status), obligations (list/create/status), contract
`:id/status`. `FieldSpec.readonly` added so drawers can carry fixed context
(contractId) that still posts — `buildFormPayload` skips `hidden` fields, so hidden
context was silently dropped (found during build).

## 2. Verification (live, dev DB)
Full lifecycle walked: contract created (Acme, 250k) → performance bond PB-2026-0042
(Emirates NBD, exp 2026-07-30) → **appears on the ≤30d expiring watchlist** →
milestone obligation → **Sign → project auto-created inheriting value 250,000 and
account Acme** → obligation Met → bond Released → guard ("cannot release a released
bond"). Browser-verified: 360 header/workflow, commercial summary, chain strip showing
the live project link, tabs with the milestone (Met) and the bond. contracts module
builds + API/web green · migration gate green (149, @DOWN).

## 3. Next (the user's stated sequence)
**Projects** is the remaining link: Contract → Project → Execution → Commercial
Control → Completion/Closeout as one flow — project 360 with inherited commercial
data (contract value vs certified vs cost), variations/EOT tie-in (module exists),
closeout checklist (service exists), and the completion → contract-closeout loop back.
