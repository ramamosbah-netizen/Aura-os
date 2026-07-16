# CRM Final Build Directive — verified against the live tree

**Date:** 2026-07-15 · **Checked against:** `main` @ `702a5d7` (after G6 #117 + G7 #118 merged)
**Question:** is the "AURA OS — Final Enterprise CRM Build Directive" OK to adopt as-is?
**Answer: adopt it as the north star, but its delivery plan is ~70% already shipped and §44 is stale.**

Every row below was checked against code on `main`, not carried from memory.

## Already delivered (do not rebuild)

| Directive § | Shipped as |
|---|---|
| §0 discovery + gap map | `docs/reports/2026-07-15-crm-vision-gap-audit.md` |
| §10–§12 universal Activity, next-action projection, My Work | G1+G2 (PR#113), Activities command (PR#75) |
| §13 unified event-projected timeline | S-wave |
| §4 Signal engine, states, promotion lineage | S3 (mig 0158) |
| §6–§8 Lead OS: attention+SLA, qualification engine, ELV context, transactional Qualify & Convert | S1/S2, G3 (0170), G4 (0171) |
| §7 Lead Center views incl. Converted / Disqualified / Sources | G7 (PR#118) — tabs inside Sales Pipeline |
| §15 buying journey + misalignment signal | S6 (0161) |
| §17 pursue/no-pursue with persisted rationale | S6 |
| §16 deal team · §19 commitments · §20 decisions/assumptions/questions | S5/S6 (`opportunity-depth`) |
| §22 explicit risk register | 0168 |
| §12/§24 stage gates + Won/Lost invariants (§40 items 1–6, 12) | G5 (0172) |
| §23 forecast snapshots + slippage | S8 (0162) |
| §27 growth reactors (renewal/expansion, deduped, idempotent) | S9 |
| §2 party types + relationship graph · §28 attribution · §29 identity resolution | G6 (0173) / S2 |
| §21 five health dimensions + five states | this slice (health-dimension realignment) |

## Still open — the real remaining backlog, in recommended order

1. **§23 forecast categories** — PIPELINE/BEST_CASE/COMMIT/CLOSED; separate stage-probability ≠ salesperson confidence ≠ model probability (audit G13).
2. **§26 installed base & white-space** — not built at all; the largest net-new piece; feeds §27 with UPGRADE/WHITE_SPACE signals.
3. **§39 source-to-margin funnel** (audit G15) + forecast-accuracy analytics.
4. **§25 deal-desk triggers** — approval matrix exists in Admin; wire discount/margin/terms triggers to it.
5. **§5 connector contract** for external acquisition sources.
6. Enum rides-along: §6 lead statuses (G8), acceptedAt (G9), §11 activity types + lifecycle (G10/G11), §9 stages DISCOVERY/SOLUTION (G12), §14 win-plan fields (G16).

## Contradictions needing an explicit call (per the directive's own rule 44.4)

1. **§34 "Lead Center" as its own nav item** vs the **locked 5-page IA** (2026-07-12: Leads = tabs inside Sales Pipeline). The lock is honoured today; the directive is newer. The lock wins until stated otherwise.
2. **§44 is stale**: PR #78 merged long ago; "start Wave 1 Universal Activity + My Work" is already shipped. Replace §44 with the open list above.
3. **§2 multi-role party classification** vs G6's single `party_type` (deliberate). Multi-role = a join table; decide only if a real account genuinely holds two roles at once.

## Notes

- §11's `IN_PROGRESS`/`startedAt` must land additive-nullable — existing activities read "not captured", same pattern as G4.
- §31 AI-boundary rules and §37 server-side authorization match platform law already in force (command bus permissions, error taxonomy, RLS forced since R1).
