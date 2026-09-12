# TC-GATE-8-ASBUILT-LINKS-CLOSURE

**Verdict: CLOSED / VERIFIED.** Proven in the browser against the disposable PostgreSQL database
with auth on as `u-admin`. Migration `0301` applied; `rls-fitness` re-measured at **252 / 252**.

**Scope taken:** the drawing↔system link — the debt I deferred in Gates 3, 5, 6 and 7, and the first
Gate-8 candidate named in the Gate-7 register.

---

## 1. The weakness this closes

TC-GATE-6 moved Handover's as-built question to the register that can answer it, but asked it **once
for the whole project**: is there an entry marked `as_built`? One drawing answered for every system.
A ten-system project with a single as-built lift-lobby layout read READY — and the gate said so in
as many words, *"1 as-built drawing in the register"*, which is weak evidence wearing a pass.

**Why it could not simply be split.** Nothing joined the two sides. A register entry carries
`discipline` (architectural | structural | mep | elv | civil | other); a commissioning record carries
the canonical `ElvSystem` (cctv, access_control, fire_alarm …). **Every ELV system on a project has
the same discipline**, so discipline cannot tell the CCTV as-built from the access-control one.
Inferring the link from a document number or a title would be a guess dressed as a fact, and a wrong
guess here tells a client that a system's as-built exists when what exists is a different system's
drawing.

I recorded that as a limitation three times rather than inventing the link. This gate adds it
explicitly instead.

---

## 2. What was built

`aura_commissioning_asbuilt_links` (migration 0301) — the same shape, and for the same reason, as the
ITP links in 0298. A person says: *this register entry is this system's as-built.* Document control
still owns the drawing; this table owns one sentence about it.

**Only the reference is stored.** No number, no title, no revision, no status — those are read from
the register at the moment they are needed, through the port added in TC-GATE-6. A drawing that is
superseded or renumbered shows as superseded or renumbered rather than as whatever was true on the
day somebody linked it.

**Mutable, unlike the dossier manifest in 0300**, and the contrast is deliberate: a link is a
statement about the present, and one made in error must be retractable. What must never change is
what was *sent*, which is why the manifest has no UPDATE or DELETE policy and this table does.

**Checked when it is made.** The register entry must exist in this project's register **and already
be marked `as_built`**. Linking a for-construction drawing would put a not-yet-as-built document
behind an as-built claim, so it is refused at the moment of the link and the refusal names the state
it actually found. When the port is unreadable the link is still recorded — an unwired port blocks
proof, never work.

**No backfill.** Nothing in the repository knows which drawing documents which system — that is the
gap the table fills — so a backfill would be the guess the table exists to avoid.

---

## 3. The behaviour change, stated plainly

**Handover's `asBuilts` item is now answered per system, and this makes some previously-READY
packages UNKNOWN.** That is the correction, not a side effect:

- A system with **no link** → **UNKNOWN** ("N of M systems have no as-built drawing linked"). Nobody
  has said anything about it; nothing has failed.
- A system whose linked drawing is **missing, superseded, or not marked as-built** → **BLOCKED**.
  Something was said, and it does not hold.
- Every system covered → **READY**, and the reason counts links, not documents.

The dossier's as-built section is per system too, and a system with nothing linked gets a line
saying so rather than being silently absent from the pack.

---

## 4. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 301/301
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — as-built links, dossier, handover, commissioning, closeout, document, drawing, journey, shortcuts | **33 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **141 passed** (was 135) |
| `dossier-immutability.rls.pg-int` — real Postgres, application role | 8 passed |
| `@aura/api` | 399 passed |
| `@aura/web` | 182 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 252 tenant-scoped tables · enabled 252 · forced 252 · with-policy 252 |

**In the browser**, on one project with two systems: *Access control — Tower A* shows
**`ELV-AB2-55901` rev B — as-built linked**, and *CCTV — Tower A* shows **none linked**. Before this
gate, one drawing on that project answered for both. On another project, a linked as-built that was
then superseded reads **not current — "The register has superseded the revision this points at"**,
with the link still in place: the register moved, not the statement.

The e2e also proves the two refusals (a reference the register does not hold; a for-construction
drawing), that unlinking returns the system to UNKNOWN, and that unlinking leaves the controlled
document untouched.

---

## 5. What the proofs caught

**A strict-mode violation in my own Gate-7 dossier spec**, surfaced only when the full suite ran in
one pass: a project can carry more than one handover package — a lifecycle reactor raises one of its
own — so an unscoped `dossier-section-*` testid matched two cards. A test that passes or fails
depending on what else ran is worse than one that fails; the assertions are now scoped to the
package under test.

**One failure that was not mine.** `closeout-readiness` "a clean project closes" failed in the first
full run and passed in isolation and in the re-run. Recorded as cross-test interference in a
single-worker run, not a regression — and not quietly dropped.

**The Gate-6 port-vocabulary fitness test** needed updating, correctly: it built facts with no
systems, which is now UNKNOWN rather than READY. It still asks DocControl to *make* an `as_built`
entry; it now also links it to a system, which is what the gate means today.

---

## 6. Known limitations

1. **One link per system is enough to pass.** A system with several as-built drawings needs only one
   current link for the gate to read READY. Modelling "all drawings that make up this system's
   as-built set" would need a completeness rule nobody has stated.
2. **Nothing checks the drawing is *about* that system.** The link is a person's assertion; the
   register cannot confirm that `ELV-AB-002` really depicts access control. What the gate verifies is
   that the document exists, is current, and is marked as-built.
3. **The link is not offered where the as-built is consumed.** It is written in Testing &
   Commissioning → Certificates & Records, because the system is T&C's; the Handover dossier reads it
   but cannot create one.
4. **Spares remains the one assertion** on handover readiness.
5. **Handover has four sections, not eight.** Scope, snags and a separate acceptance surface are
   still absent for want of data.
6. Remaining Gate-3 dependencies (device hierarchy, device authoring UI, governed override,
   vocabulary convergence) are open. **The drawing↔system link is now closed** and comes off that
   list.

---

## 7. Gate-9 candidates

1. **Issuing the dossier through DocControl's transmittal**, so what is sent becomes a controlled
   conveyance rather than a state change plus a manifest.
2. **Spares**, which needs a new concept (spares delivered under a handover), not a port.
3. **Vocabulary convergence** — the five incompatible discipline/system vocabularies that forced both
   explicit links (ITP and as-built) into existence.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 9 not started.
