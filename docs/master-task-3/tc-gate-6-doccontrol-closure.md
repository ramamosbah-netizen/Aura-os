# TC-GATE-6-DOCCONTROL-REFERENCES-CLOSURE

**Verdict: CLOSED / VERIFIED.** Proven in the browser against the disposable PostgreSQL database
with auth on as `u-admin`. **No migration** — this gate adds no table and no column, so the schema
stayed at 299 and `rls-fitness` re-measured unchanged at **250 / 250**.

**Scope taken:** the DocControl read port, with `warrantyDocs` folded in — the two items you
approved. Phase-A discovery then found a defect inside that scope which the port is the fix for, so
it was fixed here rather than deferred.

---

## 1. The defect Phase A found

**Handover's as-built gate could never pass.**

TC-GATE-4 derived `asBuilts` from `EngineeringReleasePort` and filtered for `status === 'as_built'`.
Engineering's `DrawingStatus` is:

```
draft | submitted | under_review | approved | rejected | revision_required | transmitted | closed | superseded
```

There is no `as_built` in it, and there never was. So the gate could reach BLOCKED (drawings exist,
none match) or UNKNOWN (none exist) and **never READY** — which meant `readyToSubmit` was false on
every project, and **no handover package could be submitted at all**.

Three things should have caught it and none did:

1. **The compiler could not.** A port deliberately widens `status` to `string` at the boundary —
   that is the point of ADR-0004, the consumer must not import the owner's enum. The type system was
   working as designed; the design has a blind spot.
2. **The unit test could not.** It built its own fact with a fabricated `status: 'as_built'`, so it
   tested the filter against a value only the test could produce. It passed while the product could
   not.
3. **The e2e could not**, because I wrote it to stop at BLOCKED. It drove a drawing to `approved`,
   asserted BLOCKED, then fired `transmit` and `close` with `.catch(() => undefined)` and asserted
   **nothing** afterwards. Those two trailing calls are the fingerprint of the bug: I tried to reach
   as-built through Engineering, it did not work, and I left the attempt in the file without a
   conclusion. **A test that stops where the product stops records the dead end as the design.**

Document control's `RegisterStatus` *does* carry `as_built`, and `DocControlService.readProject-
DocumentReadiness` has read it as the as-built authority since the Projects closeout gate was
built — `closeout-readiness.spec.ts` and `journey-signal-to-close.spec.ts` both create as-builts
through `/doccontrol/register`. **Projects had it right the whole time. Handover asked the wrong
domain,** and this gate moves the question to the register that can answer it.

---

## 2. The second defect, also mine

`handover-client.tsx` still rendered checkboxes for **O&M manuals**, **Warranty documents** and
**Client training completed**. TC-GATE-5 turned `omManuals` and `training` into projections and
taught the API to refuse a tick for both — but left their controls on the page. Two controls could
therefore only ever produce an error, and `handover-readiness.spec.ts` **asserted they were
there**, locking the fault in.

Deriving an item and withdrawing its control are one change, not two. The checklist now offers
exactly one item — spares — and the spec asserts the other five are gone.

---

## 3. What the port does

`DocControlPort.readProjectDocuments(tenantId, projectId)` — declared by the consumer in
`modules/commissioning/src/ports.ts`, implemented by `DocControlService`, bound in
`apps/api/src/wiring/gates.module.ts`. One call per project, like every other port here.

It returns a **projection**, not the register row: id, number, title, revision, status, discipline,
docType. No custodian, no distribution list. A consumer that cannot see the distribution matrix
cannot come to depend on it.

`ENGINEERING_RELEASE` stays bound — **Testing & Commissioning still reads drawing release** for its
own pre-commissioning chain. That is a different question, and one Engineering *can* answer. Only
Handover's as-built question moved.

---

## 4. What a reference now means

`resolveDocumentReference` (`domain/document-reference.ts`) matches the stored text against the
project register by **id or document number**, case-insensitively. Matching by number is deliberate:
the control asks a person for a reference and a person types `DOC-OM-014`, never a UUID. Accepting
only the id would be a rule the interface itself makes impossible to obey.

Checked in **two places, for two different reasons**:

- **On write** (`advanceOmItem` → `submitted`): a reference the register does not hold is refused
  where it is typed. `validation: the document reference "…" must match a controlled document in
  this project's register — by document number or id` → 400 via the error taxonomy.
- **On every read**: the readiness projection re-resolves. This is not redundant — **a document can
  be superseded long after it was referenced**, and no write-time check can see the future. The
  browser proof below shows exactly this case.

**Nothing is stored.** The title and revision on screen are the register's answer *now*. When the
fixture's manual was revised B → C, the row changed to "rev C · superseded" without anything in
Handover being written.

**An unwired port does not block work.** If document control cannot be read the write still goes
through; only the *verification* is missing, and that surfaces as UNKNOWN in readiness. Optional
dependency, never optional evidence — applied in the right direction.

---

## 5. Warranty certificates

`warrantyDocs` is now derived from the O&M pack's `warranty_certificate` deliverable — an authority
that already existed, built in TC-GATE-5, and was simply never read.

The Gate-5 register said warranty documents "plausibly belong with Contract". **That was wrong.**
Contracts owns warranty *bonds* (`BondKind = 'warranty'` — financial security) and warranty
*clauses* (contract language). Neither is the equipment warranty certificate a client receives.

`omManuals` and `warrantyDocs` are **disjoint**: the warranty certificate is excluded from the pack
count, so a missing warranty lights up one failure, not two, and every deliverable is counted once.

---

## 6. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 299/299
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — handover, commissioning, closeout, document, drawing, shortcuts | **26 passed**, 0 failed |
| e2e — `journey-signal-to-close` | 2 passed, 2 skipped (pre-existing conditional skips) |
| `@aura/commissioning` | **118 passed**, 8 skipped (was 109) |
| `@aura/doccontrol` | 35 passed |
| `@aura/api` | **399 passed** (was 396 — the new vocabulary fitness test) |
| `@aura/web` | 182 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 250 tenant-scoped tables · enabled 250 · forced 250 · with-policy 250 |

**The assertion this gate exists to make**, now in `handover-readiness.spec.ts`: a register entry is
created `for_construction` (gate BLOCKED, "none marked as-built"), revised to `as_built`, and the
gate reads **READY**. That sentence could not be written before today.

**In the browser**, on the seeded project: *As-built drawings released — derived · Document control
— "1 as-built drawing in the register." — **READY***. And after superseding a referenced manual:
*"1 of 1 accepted deliverable — 1 pointing at a superseded revision." — **BLOCKED***.

---

## 7. The guard against a repeat

`apps/api/src/port-vocabulary.fitness.test.ts`. A port hides the owner's type, so only the
application layer — the one place that legitimately imports every module — can check that the words
on both sides still match. It asks **DocControl to make** an `as_built` register entry and asserts
the readiness gate matches it, rather than hand-writing the string. It also pins the original
defect: Engineering's statuses do not include `as_built`.

The rule it carries: *if a consumer matches on a literal from another domain's vocabulary, that
literal must be a value the owning domain can actually produce.*

---

## 8. Known limitations

1. **As-builts are still PROJECT-WIDE, not per system.** I said in the Gate-5 register that this
   port would let the item be per-system. Discovery says no: a register entry's finest dimension is
   `discipline` (elv, mep, civil …), and no link exists between a document and a commissioning
   system. Splitting it per system would mean inferring that link from a discipline name — answering
   confidently and sometimes wrongly. **Correcting my own earlier claim.**
2. **Only `superseded` is tested, not "issued".** `RegisterStatus` is drawing-shaped
   (`for_construction`), and an O&M manual has no honest state in it. Demanding one would push
   people to label manuals "for construction" — a lie the check itself caused.
3. **Revision-level state is not read.** DocControl's `DocumentRevision` has a real `issued` status,
   but the store can only list revisions *per register entry*; there is no project-wide query.
   Adding one is DocControl's call, not Handover's.
4. **Spares remains the one assertion.** Inventory holds stock, serial units and their issue to a
   project — none of which records spares being handed **to the client**. The O&M pack's recommended
   -spares *list* is a document, not a delivery, and reading it here would quietly redefine the item.
5. **Handover still has three sections, not eight.** Scope, snags, as-builts and the dossier are
   untouched.
6. All Gate-3 dependencies (device hierarchy, device authoring UI, drawing↔system link, governed
   override, vocabulary convergence) remain open.

---

## 9. Gate-7 candidates

1. **The handover dossier** — now the largest remaining piece of the target architecture, and mostly
   assembly: T&C evidence packs, O&M, training and as-builts all exist as rows to gather, and their
   document references now resolve.
2. **A drawing↔system link**, which would make as-builts per-system and close limitation 1.
3. **Spares**, which needs a new concept (spares delivered under a handover), not a port.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 7 not started.
