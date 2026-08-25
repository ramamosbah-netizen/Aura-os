# Slice 9 — Accepted Quotation → Won (implementation plan)

**Date:** 2026-08-24
**Depends on:** Slice 8 (pricing-revision identity + immutable quotation lineage) — proven live.
**Status:** PLAN — for review before code. Nothing implemented.
**Branch:** `claude/slice9-accepted-quotation-won` (stacked on the Slice 8 branch).

> Directive: *"Won should normally be produced automatically from a verified customer award event
> (accepted quotation), `contractedValue` from the authoritative accepted document — never
> `opportunity.value`. Keep a governed manual override. Lost should be workflow-driven with structured
> evidence."*

---

## 1. The authoritative award event (decision, grounded in code)

- **Event:** `crm.quotation.accepted` — emitted by `QuotationService.changeStatus` on `accept`
  (`quotation.service.ts:126`). This is the verified customer-acceptance signal.
- **Authoritative value:** the accepted quotation's **Commercial Baseline** (`getBaseline`), the
  immutable approved-price snapshot locked at approval (R3). Fall back to `quotation.total` only if a
  legacy quote has no baseline. This is EXACTLY how the tender path already values its contract
  (`findTenderBaseline`, `cross-module-subscriber.ts:108`) — Slice 9 brings the direct path to parity.
- **Never** `opportunity.value` (the manually-typed headline).

Because Slice 8 makes the accepted quotation a specific, identity-anchored revision, "the accepted
quotation" is now unambiguous — the prerequisite that gated this slice.

---

## 2. Scope split (two PRs)

### PR-1 — Auto-Won from acceptance (the core)
1. **Opportunity lineage fields** (new, additive): `awardedQuotationId: Id | null`,
   `contractedValue: number | null`. Migration adds two nullable columns to
   `aura_crm_opportunities`; domain + both stores carry them.
2. **Sanctioned writer** — generalise the tender-only writer into `applyAwardOutcome(id, 'won'|'lost',
   { reason, value?, awardedQuotationId?, source })`, keeping `applyTenderOutcome` as a thin caller.
   It passes the stage gate the same way a human would, is idempotent (already-closed → no-op), and is
   the ONLY sanctioned programmatic closer.
3. **Reactor** `crm.quotation.accepted → close Won` (in `cross-module-subscriber.ts`, mirroring
   `closeSourceOpportunity`): resolve `quotation.sourceOpportunityId`; if the opp is **direct**
   (no `tenderId`) and **open**, close it Won with `value = baseline.total ?? quotation.total`,
   `awardedQuotationId = quotation.id`, `contractedValue = baseline.total`. Idempotent on redelivery.
   Tender-owned deals are ignored here (the tender path owns them).
4. **Tests + PG proof**: accept a direct quotation → opp Won, `contractedValue` = the baseline (not
   `opportunity.value`), `awardedQuotationId` = the accepted revision; idempotent; a tender-owned deal
   is untouched; real-PG transactional close.

### PR-2 — Governed manual override + governed Lost
1. **Manual Won/Lost becomes governed.** Today `opportunity.service.update` lets a direct deal be
   closed from the dropdown gated only by value+reason (`stage-gate.ts:105`). Add: an **authorization
   check** (a close/override permission via the existing ABAC seam), and — when closing Won with **no
   accepted-quotation evidence** — treat it as an explicit **override**: require the permission, record
   an override audit event, and stamp a warning. A normal salesperson cannot bypass the lifecycle by
   selecting Won.
2. **Governed Lost evidence** (structured): loss reason (required), competitor/winner, stage lost at,
   final quoted value/revision, date, actor. Preserve — never delete — the Estimate/Pricing/Quotation
   history on Lost.
3. **Win/Loss Intelligence card actionable while Open** (audit item #5): show current stage, waiting-on,
   next action, commercial position (frozen pricing / sent quote) — not just "move the stage".

---

## 3. Invariants to prove
- Accepting a direct quotation closes its opportunity **Won** with `contractedValue` = the accepted
  quotation's **baseline**, and `awardedQuotationId` = that quotation. (`opportunity.value` never used.)
- The close is **atomic** (opp update + event on one tx) and **idempotent** (redelivery / re-accept).
- A **tender-owned** deal is never closed by quotation acceptance (the tender path owns it).
- Manual Won/Lost requires authorization; an evidence-less Won is a flagged, audited **override**.
- Lost preserves the full commercial lineage.

---

## 4. Explicitly OUT of scope (later slices)
- Auto-creating a Contract on Won (the direct contract chain) — Slice 9 closes Won + sets the
  authoritative value + lineage; contract drafting is a separate slice.
- Stage-enum expansion / Win-Loss UI redesign beyond the card's actionable content.

---

## 5. Sequencing & gates
PR-1 first (accept→Won + value + lineage), proven with the same rigor as Slice 8 (in-memory + real-PG,
full gate). Only then PR-2 (governance + Lost). Same branch convention (stacked; retarget on merge).
