# TC-GATE-7-HANDOVER-DOSSIER-CLOSURE

**Verdict: CLOSED / VERIFIED.** Proven in the browser against the disposable PostgreSQL database
with auth on as `u-admin`. Migration `0300` applied; `rls-fitness` re-measured at **251 / 251**.

**Scope taken:** the handover dossier — the largest remaining piece of the target architecture, and
the Gate-7 candidate named in the Gate-6 register. Handover now has four sections, not three.

---

## 1. The dossier owns nothing — except one thing

Every line of a dossier already belongs to a domain that produced it:

| Section | Owner | Since |
|---|---|---|
| Commissioning evidence packs | Testing & Commissioning | TC-GATE-3 |
| As-built records | Document control | readable only since TC-GATE-6 |
| O&M deliverables | Handover — O&M pack | TC-GATE-5 |
| Training & demonstration | Handover — client training | TC-GATE-5 |

So the dossier VIEW stores nothing. It is assembled on every read, which is how it stays true:
there is no copy here to fall out of step with the domains it reports. **This gate could not have
been built before the six that precede it** — three of its four sections had no data behind them,
and the as-builts were unreadable until the document-control port existed.

**The one fact nobody else holds** is what the client actually RECEIVED. A derived view always
answers "what would we hand over today". A dispute asks a different question, and the two answers
diverge the moment anything moves. The owning domains each hold their own current state, not the
composition of a package at a moment — so that composition is the only thing this gate stores.

---

## 2. The manifest

`aura_handover_dossier_items` (migration 0300), captured when a package is **submitted**.

**It stores citations, not content.** Each row is a reference to a row in the owning domain plus the
label and state it carried AT ISSUE. No document, no test result, no file. Keeping the label is a
deliberate, minimal duplication and it is the reason the table exists: *"DOC-OM-014 rev B,
accepted"* is what the client was handed, and re-reading DocControl next year says *"rev C,
superseded"* — a true statement about today and a false one about the handover.

**Immutable, enforced by the database**, the same model as the test-run lineage (0296): SELECT and
INSERT policies and nothing else, so UPDATE and DELETE match no rows. A manifest that could be
edited after issue would be worth less than no manifest, because it would look like a record while
behaving like a draft.

**Issues are numbered.** A rejected package that is reworked and resubmitted produces issue #2; #1
stays exactly as it was sent.

**No backfill.** A package submitted before this migration was submitted without a manifest, and
inventing one from today's data would fabricate the very record the table protects. Those packages
show no captured issue, and the surface says so.

**Capture is ordered deliberately:** after the domain guard accepts the transition, so a refused
submission leaves no phantom issue; before the package is saved as submitted, so a package can never
read "submitted" with no record of what it contained. Both halves are asserted.

---

## 3. What it does not do

**It does not gate the submission.** Handover readiness already decides whether a package may be
sent, from the same authorities. A dossier that refused on its own terms would be a second opinion
on one question, and the two would eventually disagree.

**It shows what is NOT in the pack**, with the reason — a deliverable accepted against a missing
reference, a system registered but not commissioned, training we completed but the client has not
acknowledged. A dossier listing only what was ready would hide the work remaining, which is the
question the person looking at it actually has.

---

## 4. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 300/300
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — dossier, handover, commissioning, closeout, document, drawing, journey, shortcuts | **30 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **135 passed** (was 118) |
| `dossier-immutability.rls.pg-int` — real Postgres, application role | **8 passed** |
| `@aura/api` | 399 passed |
| `@aura/web` | 182 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 251 tenant-scoped tables · enabled 251 · forced 251 · with-policy 251 |

**The property this gate exists for**, asserted in both the unit suite and the browser: submit a
package, then supersede a document it cited. Today's pack drops the line and says why; **Issue 1
still cites `rev B`, accepted**. The screenshot shows both on one screen — nine O&M lines reading
*"accepted · rev C — the register has superseded the revision this points at"* above an issue of
twelve items reading *"accepted · rev B"*.

The RLS proof asserts the refusals directly: UPDATE affects 0 rows and the row still reads as
captured; DELETE affects 0 rows; a citation attached to another tenant's package is refused by
policy; the same source cited twice in one issue is refused by constraint.

---

## 5. What the proofs caught

**One error-taxonomy escape, caught by the fitness test, not by me.** My guard read
`validation: a dossier issue number starts at 1`. The classifier keys on message SHAPE — `must`,
`required`, `invalid` — so a guard written as prose escapes to a 500. Reworded to *"must be 1 or
greater"*. This is the second time that test has caught a message of mine; it earns its place.

**Two mistakes in my own test setup**, both caught on first run: a regex asserting *"not in the
project register"* against a message that reads *"No document … is in the project register"*, and a
missing Engineering port — T&C's own pre-commissioning chain still reads drawing release, which is a
different question to the as-built one and one Engineering can answer.

**One fixture that would have blocked the thing under test:** the spec's reachability probe created
a commissioning record, leaving an uncommissioned second system on the project that the readiness
chain would rightly refuse to submit. Changed to a read.

---

## 6. Known limitations

1. **The dossier is not a document.** There is no PDF, no transmittal, no controlled issue — formal
   issue is DocControl's authority, and this gate deliberately does not cross that line. What exists
   is the manifest and the on-screen assembly.
2. **No link from a manifest line back to the evidence.** A citation names its source id but the
   surface does not yet navigate to the T&C evidence pack or the register entry.
3. **As-builts are still project-wide**, not per system — the drawing↔system link named in the
   Gate-6 register remains open, and nothing here infers it.
4. **Spares remains the one assertion** on handover readiness. Nothing changed here.
5. **Handover has four sections, not eight.** Scope, snags and a separate acceptance surface are
   still absent, each for want of data that does not exist.
6. All Gate-3 dependencies (device hierarchy, device authoring UI, governed override, vocabulary
   convergence) remain open.

---

## 7. Gate-8 candidates

1. **A drawing↔system link**, which would make as-builts per-system and let the dossier group
   evidence by system throughout.
2. **Issuing the dossier through DocControl's transmittal**, so what is sent becomes a controlled
   conveyance rather than a state change plus a manifest.
3. **Spares**, which needs a new concept (spares delivered under a handover), not a port.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 8 not started.
