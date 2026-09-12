# TC-GATE-9-DEFECTS-AT-HANDOVER-CLOSURE

**Verdict: CLOSED / VERIFIED.** Proven in the browser against the disposable PostgreSQL database
with auth on as `u-admin`. **No migration** — this gate adds no table and no column; `rls-fitness`
re-measured unchanged at **252 / 252**.

**Scope taken:** the defect hole found while grounding the Gate-9 options — Handover was blind to
Quality's snags — plus the Snag & Punch List surface your original directive asked for.

---

## 1. The hole

Two domains hold defects:

| | Quality `Snag` | T&C `PunchItem` |
|---|---|---|
| Scope | project | system |
| Severity | low / medium / high | minor / major / critical |
| Lifecycle | open / resolved / closed | open / closed |
| Provenance | none | failing test point + run |

Handover readiness read the **second** — through the commissioning item, whose nine-gate chain has a
`defects` gate — and **never the first**. Meanwhile Projects' closeout has always counted snags
(`readProjectQualityReadiness.openSnags`).

So a client could be handed a package, and accept it, with Quality snags outstanding — **and the
closeout gate would then refuse the same project.** Two gates, one project, opposite answers.

This predates every gate in this series. It was found by checking my own Gate-9 candidate list
rather than trusting it.

---

## 2. What was built

**A seventh readiness item — `snags`, "Quality snags cleared", source `Quality`.** Derived, not
tickable, like the five before it. `SnagFact` was added to the `QualityEvidencePort` that T&C already
declares, and `QualityService` fills it; Handover reads it through `CommissioningService`, which is
the same module.

**Open is Quality's word.** The item counts what Quality calls open and adds **no severity threshold
of its own** — a low-severity snag blocks, because deciding that "low" does not count would be the
consumer restating a threshold that belongs to the owner. `resolved` and `closed` are both taken as
not-open, because that is what Quality means by them.

**A fifth Handover section — Snag & punch list — showing BOTH authorities under their own names.**

---

## 3. Two decisions worth stating

**The gate counts snags only; it does not count punch items.** Punch already blocks through the
commissioning item. Counting it again would light up two failures for one cause — the same reasoning
that excluded the warranty certificate from the O&M count in TC-GATE-6. The surface says out loud
where each is gated, so a reader is not left wondering why the punch list is not in this item.

**The two records are NOT merged, here or anywhere.** Flattening them into one list would mean
inventing a severity mapping nobody agreed (is `high` a `major`?) and discarding the provenance that
makes a punch item answerable. Each keeps its own shape and names its owner. Convergence is a real
outstanding problem; a consumer quietly deciding which authority wins is not the fix for it.

**Handover writes neither.** There is no control on the new surface that creates, resolves or closes
anything — asserted in the e2e by counting the buttons in the snag block, which must be zero. Two
writers for one business truth is already one too many.

---

## 4. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 301/301
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — defects, as-built links, dossier, handover, commissioning, closeout, NCR, document, drawing, journey, shortcuts | **40 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **146 passed** (was 141) |
| `@aura/quality` | 30 passed |
| `@aura/api` | 399 passed |
| `@aura/web` | 182 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 252 tenant-scoped tables · enabled 252 · forced 252 · with-policy 252 |

**The sequence the e2e drives:** no snag → item READY ("Quality holds no snag for this project");
Quality raises a high-severity snag → **BLOCKED, "1 open snag on this project, the most severe
high"**; the submission is refused and the refusal names *Quality snags cleared*; Quality resolves it
→ READY again. Nothing in Handover was touched at any point.

**In the browser**: the readiness panel now carries seven items, with *Quality snags cleared —
derived · Quality — BLOCKED*; the Snag & punch list shows Quality's snag with its own severity and
status beside an empty commissioning punch list, and a note saying where each is gated.

---

## 5. Known limitations

1. **The two defect models are still two.** This gate makes Handover *see* both; it does not
   converge them. A snag and a punch item describing the same physical defect remain two rows with
   no link between them.
2. **Snags are project-scoped, so the item is too.** It cannot say which system a snag belongs to,
   because Quality's snag has no system field — the same vocabulary gap that forced the ITP and
   as-built links into existence.
3. **The dossier does not carry outstanding defects.** A handover pack traditionally includes the
   outstanding snag list; adding it would change what the dossier means (evidence assembled, not work
   remaining), so it was left out deliberately.
4. **No severity threshold anywhere.** Any open snag blocks. If a client accepts handover with minor
   snags outstanding — which is common — there is no governed way to record that, only to resolve the
   snag in Quality.
5. **Spares remains the one assertion** on handover readiness.
6. **Handover has five sections, not eight.** Overview and Handover Scope are still absent for want
   of data; As-Built Records has data but appears inside the dossier rather than as its own tab.

---

## 6. Gate-10 candidates

1. **The evidence pack as a controlled document** — removes the last "not linked" label in T&C and
   unblocks issuing the dossier as a real conveyance.
2. **Vocabulary convergence** — the five incompatible discipline/system vocabularies that have now
   forced three explicit links (ITP, as-built) and one project-scoped compromise (snags).
3. **Spares**, which still needs a new concept rather than a port.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 10 not started.
