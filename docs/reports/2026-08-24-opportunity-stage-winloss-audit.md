# Opportunity Stage Model & Win/Loss Audit (pre-implementation)

**Date:** 2026-08-24
**Scope:** Opportunity stage model, Win/Loss logic, quotation status & revision lifecycle,
customer acceptance/award mechanisms, Contract/PO/Project conversion, `contractedValue` provenance.
**Status:** AUDIT ONLY — no code changed. Verified against the live tree at `main` (`97f4c1b8`).

> Directive being answered: *"Won/Lost should be outcomes derived from real business events where
> possible; the UI should always show current stage, why it's there, what blocks progress, and the
> recommended next action. Deliver the audit before code."*

---

## 0. Executive verdict

The platform is **already backend-authoritative for the TENDER route** and **not for the DIRECT-sale
route**. Tender award/loss is an event that closes the deal and flows the accepted price into a
contract; the direct opportunity is closed by a **manual dropdown** gated only by "a value and a
reason." The work the directive asks for is largely **porting the tender route's governance onto the
direct route**, plus fixing the pricing→quotation revision lineage first.

**One design correction to the brief:** the opportunity stage enum is **5 values**
(`qualification · proposal · negotiation · won · lost`), NOT the 8-stage journey
(`Scope → Estimation → Pricing → Quotation → …`). Those richer steps already exist — but as the
**Pre-Award package sub-lifecycle** (its own aggregate), not as opportunity stages. The right model is
**two tracks**: opportunity stage = coarse commercial position; Pre-Award progress = the fine-grained
evidence underneath. Do not collapse them into one enum.

---

## 1. Current Opportunity stages & transition rules

| Item | Finding | Evidence |
|---|---|---|
| Stage enum | `qualification · proposal · negotiation · won · lost` (5 only) | `shared/src/domain/crm.ts:88` |
| Active vs terminal | active = qualification/proposal/negotiation; won & lost terminal | `shared/src/domain/crm.ts:463` |
| Forward gate | `checkStageTransition` — evidence, not ceremony | `shared/src/domain/stage-gate.ts:80` |
| → proposal | needs `needConfirmed` + ≥1 stakeholder | `stage-gate.ts:95` |
| → negotiation | needs a quotation that is **submitted** (not draft) | `stage-gate.ts:100` |
| Retreat | moving backward is always allowed (honest regression) | `stage-gate.ts:92` |
| Enforcement site | `opportunity.service.update` runs the gate on any stage change | `modules/crm/src/opportunity.service.ts:133` |
| Gate preview | 360 previews the SAME rule+evidence server-side (`stageGate`) | `apps/api/src/crm/opportunity-360.controller.ts:157` |

**Classification: Implemented (coarse), Missing (fine-grained journey).**
The gate is real and server-enforced. But the UI's red pills ("Need", "Stakeholders mapped") are
**qualification-completeness** gaps surfaced as if they were the commercial blocker — the brief's
complaint #1. Qualification gaps and commercial workflow gates are **not separated** in the surface.

---

## 2. Current Won/Lost implementation

| Path | Governance | Evidence |
|---|---|---|
| **Tender-owned deal** | Manual won/lost/proposal/negotiation **REFUSED** by public update. Single writer = `applyTenderOutcome`, called only by the award reactor. | `opportunity.service.ts:114`, `:213` |
| **Direct-sale deal** | Manual dropdown → `update()` → gate requires only `value>0` + `winReason` (won) / `lossReason` (lost). **No accepted-quotation / contract / PO evidence. No distinct permission. No override audit.** | `stage-gate.ts:105`, `opportunity.service.ts:133` |
| Won value at close | `value = existing.value>0 ? existing.value : detail.value` — i.e. **`opportunity.value`**, a manually-typed figure | `opportunity.service.ts:225` |
| Auto-close on customer acceptance | **NONE** for the direct route — no `crm.quotation.accepted → won` reactor exists | `cross-module-subscriber.ts` (absent) |

**Classification: Direct route = Partial/Broken (bypassable); Tender route = Implemented.**
A salesperson **can** mark a direct deal Won from a dropdown with a typed reason and no commercial
evidence. This is exactly concerns #2 and #4.

---

## 3. Quotation statuses & revision lifecycle

| Item | Finding | Evidence |
|---|---|---|
| Status enum | draft · internal_review · approved · sent · under_negotiation · revised · accepted · rejected · expired · cancelled | `modules/crm/src/domain/quotation.ts:12` |
| Transitions | governed table; **nothing reaches a customer unapproved** (`send` requires `approved`) | `quotation.ts:286` |
| Acceptance event | `accept` → `accepted`, emits `crm.quotation.accepted` | `quotation.ts:291`, `quotation.service.ts:126` |
| Revision | `reviseQuotation` supersedes (`revised`) + creates rev+1 with `parentQuotationId` link, carrying lines/terms/estimation | `quotation.ts:327` |
| Revision history | `listRevisions` walks `parentQuotationId` (authoritative), falls back to number only when safe | `quotation.service.ts:211` |
| Approval → baseline | approval locks an immutable Commercial Baseline (R3) | `quotation.service.ts:139` |

**Classification: Implemented and genuinely well-governed** — for the *quotation aggregate itself*.
`accept` IS the customer-acceptance event, and revisioning via `parentQuotationId` is correct **when
`reviseQuotation` is used**.

---

## 4. The pricing → quotation revision defect (concern #6 = "Slice 8")

**Classification: Broken.** The pricing-sheet revision chain is **not wired** to the quotation
revision chain.

- Re-pricing opens **P v2** via `openPricingRevision` → new sheet with `parentSheetId → v1`, **but no
  `quotationId`** (`openCommercialPricing` doesn't copy it). Evidence: `pre-award-package.service.ts:382`.
- `PricingSheetService.generateQuotation` **requires** the sheet already be linked to a quote shell
  ("create the quote shell first") and then regenerates that quote's lines via `saveEstimation`.
  Evidence: `pricing-sheet.service.ts:160`.
- Net effect: a re-price (P-002) either fails, or the caller links a **fresh independent quotation**
  (a new number at revision 0) instead of a `parentQuotationId` **revision (Q-002)** of the v1 quote.
  `linkQuotation` enforces one-quote-per-sheet (`pricing-sheet.ts:253`) — so retrying generation on a
  half-linked sheet can leave an **orphan** quote with no P-link, or a P with a dangling `quotationId`.

**Consequence for this program:** automatic Won that keys off "the accepted quotation" would be built
on an unreliable P→Q lineage — you could auto-win the wrong quotation, or an orphan. **Slice 8
(pricing↔quotation revision integrity) must land first.**

---

## 5. Customer acceptance / award mechanisms present

| Mechanism | Present? | Evidence |
|---|---|---|
| Quotation `accepted` status + event | ✅ | `quotation.ts:291` |
| Commercial Baseline (approved-price snapshot) | ✅ | `quotation.service.ts:139` |
| Tender `awarded` / `lost` events | ✅ | `cross-module-subscriber.ts:294`, `:353` |
| Customer PO object | ❌ Not modelled as an award artifact | — |
| LOA / LOI object | ❌ | — |
| Signed-contract event driving CRM close (direct) | ❌ (tender path only) | — |

**Authoritative award events that exist today:** `tendering.tender.awarded` (tender route) and
`crm.quotation.accepted` (direct route, **currently inert** for the opportunity outcome).

---

## 6. Contract / PO / Project conversion paths

| Transition | Trigger | Governance | Evidence |
|---|---|---|---|
| Tender won → Contract (draft) | `tendering.tender.awarded` | Inherits accepted quotation's baseline; falls back to tender value; idempotent | `cross-module-subscriber.ts:294` |
| Tender won/lost → Opportunity Won/Lost | same events | `applyTenderOutcome`, idempotent | `:344`, `:352` |
| Contract signed → Project (planned) | `contracts.contract.signed` | Seeds WBS/CBS from BOQ; idempotent | `:361` |
| Project completed → Contract completed | `projects.project.completed` | idempotent | `:229` |
| **Direct quotation accepted → Contract** | quotation `convertedContractId` / `linkContract` exists, but **no reactor auto-creates a contract on acceptance** | Manual | `quotation.service.ts:188` |
| **Direct quotation accepted → Opportunity Won** | **NONE** | — | absent |

**Classification: Tender chain = Implemented; Direct acceptance→contract→won chain = Missing.**

---

## 7. `contractedValue` provenance

- **Displayed in 360:** `sum(non-cancelled contracts linked to the deal)` — `opportunity-360.controller.ts:134`.
- **Stored at manual close:** `opportunity.value` (typed) — `opportunity.service.ts:225`.
- **These two can disagree.** A direct deal manually marked Won with **no contract** shows
  `contractedValue = AED 0` in the card while the pipeline counts `opportunity.value`.

**Classification: Broken (non-authoritative).** Per the brief, `contractedValue` must come from the
accepted commercial document (accepted quotation → its baseline → contract), never silently from
`opportunity.value`.

---

## 8. Which transitions can be automatic vs human-controlled

| Transition | Recommendation | Why |
|---|---|---|
| → proposal, → negotiation | Human (evidence-gated) — keep | judgement + evidence |
| Quotation accepted → **Opportunity Won** | **Automatic** (new reactor), once Slice 8 lands | deterministic award event |
| Quotation rejected / dead → **Opportunity Lost** | Semi — prompt human to confirm loss reason | reason is human knowledge |
| Won → Contract (direct) | Automatic draft (mirror tender path) | already the tender pattern |
| Manual Won/Lost | Keep as **governed override** only | real deals close outside AURA |

**Authorization:** today the direct manual close has **no distinct permission** and **no override
audit** — it is an ordinary `update`. The override path (#4) needs its own permission + mandatory
reason + evidence reference + audit event + "evidence missing" warning.

---

## 9. Proposed target state machine (for review — not yet built)

**Two tracks, one surface.**

```
OPPORTUNITY STAGE (coarse commercial position — unchanged enum):
  qualification → proposal → negotiation → won | lost

PRE-AWARD EVIDENCE TRACK (fine-grained, already an aggregate):
  Scope approved → Estimate approved → Pricing frozen → Quotation sent
        → Customer decision (accept / reject)
                 ├── accepted  ─► (reactor) Opportunity → WON  + contract draft
                 └── rejected  ─► prompt → Opportunity → LOST (reason captured)
```

- **Stage** answers "where is the deal." **Pre-Award track** answers "why it's there / what's next /
  what's blocking." The Win/Loss card renders the Pre-Award position while Open, and the final
  outcome once closed.
- **Won becomes primarily a derived outcome** of `crm.quotation.accepted` (a reactor calling the
  single sanctioned internal writer, exactly like `applyTenderOutcome`), with `contractedValue` taken
  from the accepted quotation's **baseline**.
- **Manual Won/Lost survives as a governed override** (permission + reason + evidence ref + audit +
  missing-evidence warning), not a bare dropdown.

---

## 10. Sequencing recommendation

1. **Slice 8 first — pricing↔quotation revision integrity** (§4). Wire P v(n) to a `parentQuotationId`
   revision; kill the orphan/independent-quote path. *Automatic Won depends on a trustworthy "accepted
   quotation," so this is a hard prerequisite.*
2. **Then Win/Loss Intelligence card** (§ brief #5): make it show stage / status / waiting-on / next
   action / commercial position while Open. UI-readable from data that already exists — low risk, can
   ship alongside/after Slice 8.
3. **Then the acceptance→Won reactor + governed manual override** (§2, §4, §7): port the tender-route
   governance onto the direct route; move `contractedValue` onto the accepted document.

**Do not build step 3 before step 1.**

---

## Appendix — classification summary

| Area | Status |
|---|---|
| Opportunity stage enum + forward gate | Implemented |
| Fine-grained journey as opportunity stages | Missing (exists as Pre-Award track) |
| Qualification vs commercial-gate separation in UI | Missing |
| Tender-route Won/Lost governance | Implemented |
| Direct-route Won/Lost governance | Partial / Broken (bypassable dropdown) |
| Quotation status + revision (via `reviseQuotation`) | Implemented |
| Pricing→Quotation revision lineage | **Broken** (independent quote / orphan) |
| Auto-Won from customer acceptance (direct) | Missing |
| Direct acceptance → contract chain | Missing |
| `contractedValue` from authoritative document | Broken (uses `opportunity.value` / contract sum) |
| Governed manual override (perm + audit + warning) | Missing |
