# CRM — merged code vs the final CRM philosophy

**Date:** 2026-07-15 · **Audited commit:** `dcb309f` (main)
**Question asked:** *"the lead, opportunity and all — I think they don't reach the final goal of CRM."*
**Answer: correct.** The acquisition *chain* is real and end-to-end. What is missing is the
**operating depth** on it — qualification, evidence, universality and projection.

Every line below was checked against the live tree. No claim is carried over from memory.

---

## Verdict in one paragraph

AURA has the **skeleton** of the final vision and it is genuinely good: Signal → Lead →
Opportunity → Quotation/Tender → Contract → Project → Account Growth → Signal ♻ exists and closes.
What it does **not** yet have is the vision's *operating system*: a Lead that can describe an ELV
job, a qualification engine, stage transitions that demand evidence, an Activity engine that spans
the deal chain, and one source of truth for Next Action. Today the CRM can tell you **that**
something needs attention. The vision asks it to tell you **whether the deal is real, whether it
is winnable, and what happens next** — and to enforce that.

---

## What already matches the vision (do not rebuild)

| Vision | State |
|---|---|
| §4 Signal engine + states | ✅ `NEW/REVIEWING/RESEARCHING/PROMOTED/DISMISSED/DUPLICATE` |
| §1 Full loop incl. Account Growth → new Signal ♻ | ✅ closed (S9 reactors) |
| §9 Commercial lineage preserved | ✅ `Lead.signalId`, `Lead.convertedOpportunityId`, `Opportunity.leadId` — verified live |
| §30 Duplicate & identity resolution | ✅ `resolveIdentity` — observed running ("No duplicate found") |
| §6 Lead execution + **SLA** | ✅ `assignedAt`, `firstRespondedAt`, `slaFirstResponseHours` |
| §8 `leadAttention()` | ✅ **6 of 7** reasons |
| §12 `opportunityAttention()` | ✅ owner + next action + due date |
| §3 Stakeholder role **per opportunity** | ✅ `opportunity-depth.ts` — the vision's subtle point is already honoured |
| §16 Quotation/Tender as **paths**, not stages | ✅ |
| §21 Unified timeline (event-projected) | ✅ |
| §22 Relationship intelligence | ✅ 22 live signals |
| §24/§25 Pipeline command centre + forecast snapshots | ✅ |
| §13 A health engine exists | ⚠️ exists, but measures different dimensions — see G7 |

**The vision's own build order is already ~60% delivered.** Items ②③④⑥⑦ (timeline, lead
attention, qualify & convert, relationship map, pipeline/forecast) are done.

---

## The gaps — why it does not reach the goal

### P0 — structural. These are why it "feels" incomplete.

**G1 · Activity is CRM-only, not universal** (§17, §20 · the vision's build item ①)
```ts
ActivityRelatedType = 'account' | 'contact' | 'opportunity' | 'lead' | 'quotation'
// missing: tender, contract, project
```
The vision says Activity is *"ليست ميزة CRM فقط، بل Capability مشتركة"*. Today it cannot attach to
a tender clarification, a contract obligation or a project task — so **"My Work" can never span
the deal chain**, and §20's `CRM / Tender / Contract / Project` filter is unbuildable. This is the
single largest structural gap, and the vision correctly ranks it first.

**G2 · Two competing truths for Next Action** (§19 · explicitly forbidden by §41)
`leadAttention()` takes activity facts as a **derived input** — correct, and its own code comment
says so. But:
```ts
opportunityAttention(): if (!opp.nextAction) gaps.push('no-next-action')   // reads the COLUMN
```
Opportunity's next action is a **manually-maintained column**, not a projection of the next open
Activity. So the Lead half of the system obeys §19 and the Opportunity half does not. Completing an
activity does not move the opportunity's next action.

**G3 · No Lead Qualification Engine** (§7)
No `leadScore`, no Fit / Intent / Need Confidence / Timing / Authority / Commercial Potential /
Relationship Strength / Information Quality. **This is the heart of "Lead OS" and it does not
exist.** Today the Lead layer answers *"is anyone chasing this?"* (attention) but not the vision's
actual question: *"هل توجد هنا فرصة تجارية حقيقية تستحق الاستثمار في التأهيل؟"*
Consequence: `Qualify & Convert` is a mechanical transform, not a decision.

**G4 · Lead cannot describe an ELV job** (§6 Commercial Context)
The Lead model has identity + ownership + SLA, but **none** of: Requirement, Systems/Services,
Sector, Project Name, Project Location, **Consultant**, **Main Contractor**, Estimated Value,
Expected Timeline. For a UAE ELV contractor this is the difference between a CRM record and a
commercial lead — you cannot route, score or qualify what you cannot describe.

**G5 · Stage transitions have no evidence gates** (§11)
No `canTransition` / stage-gate rule anywhere. Any stage can be dragged to any stage. The vision:
*"لا يجب أن يكون تغيير Stage مجرد Drag & Drop بلا ضوابط."* Related: §40's invariants **3 and 4**
are unenforced — `lossReason` exists as a *field* but nothing requires it on Lost, and nothing
requires final value/winning context on Won.

**G6 · Account has no party TYPE** (§2)
```ts
AccountStatus = 'prospect'|'qualified'|'active_customer'|'strategic'|'dormant'|'inactive'
```
That is a **relationship lifecycle**, not what the account *is*. The vision needs
Consultant / Main Contractor / Developer / Supplier / Partner / Subcontractor / Government Entity.
Without it the relationship graph cannot express "this consultant influences that developer's
tender" — which is how ELV work is actually won.

### P1 — depth on existing parts

| # | Gap | Detail |
|---|---|---|
| G7 | Health dimensions ≠ vision (§13) | code: `relationship, commitments, register, journey, risks` · vision: `Execution, Relationship, Commercial, Competitive, Decision`. Bands `HEALTHY/AT_RISK/CRITICAL` (3) vs vision's 5 (`ON TRACK/NEEDS ATTENTION/AT RISK/BLOCKED/STALE`). Only `relationship` overlaps — it measures *deal depth*, not *health* as specified |
| G8 | Lead lifecycle short (§5) | has `new/contacted/qualified/nurturing/disqualified/converted` · missing `VERIFIED`, `ASSIGNED`, `QUALIFYING` |
| G9 | `ASSIGNMENT_NOT_ACCEPTED` missing (§8) | 6 of 7 reasons present; needs an `acceptedAt` fact |
| G10 | Activity types thin (§17) | has `call/email/meeting/note/task` · missing `FOLLOW_UP, WHATSAPP, SITE_VISIT, TECHNICAL_DISCOVERY, DEMO, PRESENTATION, REMINDER`. **WhatsApp and Site Visit are not optional in this market** |
| G11 | Activity lifecycle (§18) | `open/completed/cancelled` · missing `IN_PROGRESS`; `open` should read `PLANNED` |
| G12 | Opportunity stages (§11) | `qualification/proposal/negotiation/won/lost` · missing `DISCOVERY`, `SOLUTION`. Vision wants `qualification` to retire *into the Lead* once G3 lands |
| G13 | No forecast categories (§15) | no `PIPELINE/BEST_CASE/COMMIT/CLOSED`; and no separation of **stage probability ≠ salesperson confidence ≠ AI win probability** |
| G14 | Lead Center views (§8) | has All/Mine/Needs Attention/Nurture · missing **Converted, Disqualified, Sources & Performance** |
| G15 | No source-to-profit funnel (§29) | attribution *is* carried unbroken (Signal→Lead→Opportunity), but nothing reports Source → Wins → Contract Value → **Actual Margin** |
| G16 | Win Plan partial (§14) | decisions/assumptions/risks/commitments exist (S6/S7); no explicit Decision Criteria, Differentiation, Win Strategy |

---

## One conflict needing your decision

The vision's §34 navigation puts **Lead Center** as its own section with sub-views
(Inbox / My Leads / Needs Attention / Nurture / Converted / Sources).

The **locked CRM IA (2026-07-12)** says the sidebar stays at exactly **5 pages**, with Leads living
*inside* Sales Pipeline as tabs — and that decision is honoured in the live app today.

These contradict. G14's missing views can be delivered either way (as tabs inside Sales Pipeline,
or as a 6th sidebar section). **The IA lock wins until you say otherwise** — but the vision document
is newer, so this needs an explicit call.

---

## Recommended order (follows the vision's own ①→⑨, adjusted for what exists)

1. **G1 Universal Activity** — widen `ActivityRelatedType` to the deal chain, then build **My Work**
   (§20). The vision ranks this first and it is correct: everything else reports *through* it.
2. **G2 Next Action projection** — make Opportunity read the Activity stream like Lead already does.
   Kills the second truth before more is built on it. Do it *with* G1.
3. **G4 + G3 Lead commercial context, then the Qualification Engine** — G4 first: scoring needs
   something to score.
4. **G5 stage gates + §40 invariants 3/4** — cheap, high governance value, same pattern as the
   pricing-sheet lock already shipped.
5. **G6 Account type** — small migration, unlocks the relationship graph.
6. Then G7 health re-alignment, G13 forecast categories, G15 source-to-profit.

G8–G12 are small and can ride along with whichever slice touches them.

---

## Honest limits

- This audits **model and rule coverage**, not UX quality. A field existing ≠ it being usable.
- I did not audit §31 permissions or §32 audit-trail depth in detail — both exist as platform
  capabilities (derived permissions, audit service); whether they meet §31's field-level masking
  and §32's reason-capture was not verified.
- §33 Documents was not audited beyond noting Document Control exists as its own capability.
- No code was changed by this audit.
