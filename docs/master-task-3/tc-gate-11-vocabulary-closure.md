# TC-GATE-11-VOCABULARY-SEAMS-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration, and no behaviour change** — this gate removes dead
vocabulary, moves a private map to a shared typed one, and makes a whole class of bug checkable.
`rls-fitness` unchanged at **253 / 253**.

**Scope taken:** vocabulary convergence, the Gate-11 candidate I named as front-runner — bounded to
what convergence should actually mean here, and explicitly NOT to merging the vocabularies.

---

## 1. What I did not do, and why

**I did not merge the vocabularies into one enum.** They are two axes, not one vocabulary badly
spelled:

- A **discipline** is a TRADE — who draws it, who reviews it, which consultant signs it.
- An **ELV system** is a SYSTEM WITHIN a trade — what it does, who commissions it, what it is handed
  over as.

`cctv` appears in both sets and means different things in each: in `Discipline` it is *the CCTV
drawing package*; in `ElvSystem` it is *the CCTV system on this project*. Collapsing them would not
converge anything — it would erase the distinction between what a drawing is filed as and what a
system is, and every gate built on that distinction since TC-GATE-3 would quietly become wrong.

**I also did not touch Quality's free-text ITP `discipline` or nullable NCR `system`.** Both are
real defects. Both are writes into Quality's own tables, and changing another module's storage shape
from here is precisely the boundary violation this series has spent eleven gates defending. They
belong in a Quality gate, and are named as candidates below.

What convergence *should* mean here is: **the seams between the vocabularies stop being private
heuristics and become declared, typed, and enforced.**

---

## 2. The defect the generalisation found

`modules/commissioning/domain/commissioning-readiness.ts` held:

```ts
const APPROVED_DRAWING_STATUSES = new Set(['approved', 'issued_for_construction', 'as_built']);
```

Engineering's `DrawingStatus` is `draft | submitted | under_review | approved | rejected |
revision_required | transmitted | closed | superseded`. It contains neither of the last two, and
**`issued_for_construction` appears nowhere else in the entire repository** — it is not a value any
domain has ever produced.

So two thirds of that set could never match anything. It did not break the gate, because `approved`
carried it — **which is exactly why nothing noticed for eight gates.** This is the same bug class as
the one TC-GATE-6 found in handover's as-built gate, in the same file's neighbourhood, still live.

Now: `new Set(['approved'])`, with `transmitted` and `closed` deliberately excluded and said so —
this gate asks whether the design was approved, not how far it has travelled since.

---

## 3. What was built

**`shared/src/dimensions/elv-system-discipline.ts`** — the ELV-system → discipline map, moved out of
commissioning where it was a private `Record<string, readonly string[]>` that no other module could
see, nothing checked, and which silently decided which drawings counted for which system's
readiness. It sits in `@aura/shared` beside `discipline.ts` because **both sides already live there
and neither owns the relationship** (ADR-0012, the same reasoning that promoted `Discipline` itself).

**The type is the enforcement.** `Record<ElvSystem, readonly Discipline[]>` means a new ELV system
fails to compile until it is mapped, and an invented discipline fails to compile at all. The private
version was strings on both sides — which is how a dead literal survived in a sibling set.

**`disciplinesForElvSystem(untrusted)`** falls back to `other`'s mapping rather than an empty list: a
system the map has not heard of still has ELV drawings, and returning nothing would make the gate
say "no drawings recognised", which is a statement about the map rather than about the project.

**The three foreign-literal sets are now exported and asserted.** `INSTALLED_STATUSES`,
`APPROVED_DRAWING_STATUSES` and `OPEN_NCR_STATUSES` each hold values belonging to another domain,
arriving as bare `string` because a port widens the owner's type at the boundary. That is what a port
is *for*, and it is a blind spot the compiler cannot cover — so the application layer does, in
`port-vocabulary.fitness.test.ts`, which was generalised from the single as-built case to all of
them.

The NCR assertion goes further than membership: it checks the set equals *every* NCR status except
`closed`, so a new status added in Quality fails here rather than being silently treated as not-open.

---

## 4. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 302/302
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — the full affected set across Gates 1–10 | **38 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/api` | **405 passed** (was 399 — six new vocabulary assertions) |
| `@aura/shared` | 705 passed |
| `@aura/commissioning` | 149 passed |
| `@aura/web` | 182 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 253 / 253, unchanged |

**No behaviour changed, and that is the claim being made.** The two removed literals were dead —
nothing could produce them — so removing them alters no outcome. Every gate from 1 to 10 passes
unchanged, which is the evidence that this was a lie removed rather than a rule.

---

## 5. Known limitations

1. **Two free-text vocabularies remain**, both in Quality: the ITP's `discipline` and the NCR's
   nullable `system`. They are why the explicit ITP link exists at all. Fixing them is a Quality
   migration and a Quality gate.
2. **`RegisterDiscipline` (6 values) is still separate** from `Discipline` (18). Document control
   files by coarse trade and that is legitimate, but nothing maps between them, so the as-built link
   remains a person's assertion rather than something the register could narrow.
3. **Quality's IR discipline (4 values, none of them ELV)** is untouched and still cannot describe an
   ELV system — the reason inspection requests contribute nothing to commissioning readiness.
4. **The map is generous by design.** Every system includes `elv`, so a project filing one coarse ELV
   package satisfies every system's drawing check. It decides what a system RECOGNISES, not what
   proves it — a matched drawing must still be approved — but it is a broad net.
5. **The fitness test covers commissioning's literals only.** Other modules match on foreign literals
   too; nothing yet forces them into this test.

---

## 6. Gate-12 candidates

1. **Quality's free-text vocabularies** — the ITP discipline and the NCR system, converted to the
   canonical dimensions, which would let inspection requests finally contribute to readiness.
2. **Transmittal-based issue** for the dossier parts that are register entries.
3. **Spares**, which still needs a new concept rather than a port.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 12 not started.
