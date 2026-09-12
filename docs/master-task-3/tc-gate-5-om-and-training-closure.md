# TC-GATE-5-OM-AND-TRAINING-CLOSURE

**Verdict: CLOSED / VERIFIED.** Proven in the browser against the disposable PostgreSQL database
with auth on. `rls-fitness` re-measured with migration `0299` applied: **250 / 250**.

**Scope taken:** the two Gate-4 candidates I named and you approved — an **O&M package authority**
and a **client training & demonstration record** — plus the work to turn the two readiness
assertions they answer into projections, and the Handover workspace sections needed to use them.

---

## 1. Why these are new authorities rather than borrowed ones

Gate 4 left four readiness items as assertions, each labelled *"nothing verifies this"*, because
nothing in the repository held the fact. Two of those four now have an owner:

- **O&M deliverables.** DocControl owns controlled documents and can tell you a manual exists. It
  cannot tell you whether **this system's pack is complete** — which deliverables were asked for,
  which were waived, which the client accepted. Engineering owns drawings, not manuals. Nobody held
  it, so Handover does.
- **Client training.** HSE's training records are **worker safety** — our people, inductions,
  competence to work on site. This is the **client's** people being taught to operate the system
  they are about to own. Conflating them would let a toolbox talk satisfy a handover obligation.

Neither table holds a document. `documentId` / `materialDocumentId` are **references** into
DocControl — no title, no revision, no file. The controlled copy stays where it is controlled.

---

## 2. What they do

### O&M pack — `aura_handover_om_items`

Nine canonical deliverables per system (manual, manufacturer manuals, datasheets, PM schedule,
spares, software/config, licences, warranty certificate, contacts). Lifecycle:

```
required → submitted → reviewed → accepted
```

- **One step at a time, in order.** Jumping straight to `accepted` would record an acceptance nobody
  reviewed, and the pack exists precisely because somebody should have looked.
- **Submitting requires a document reference.** "Submitted" with nothing to point at is a claim, and
  this authority exists to stop claims standing in for evidence.
- **`required: false`** is how a deliverable that genuinely does not apply is recorded — never a
  silent skip, which would make "complete" mean two different things on two systems.
- `UNIQUE (commissioning_id, deliverable)`: two "O&M manual" rows on one system would make "is the
  pack complete" unanswerable.

### Client training — `aura_handover_training_sessions`

```
planned → completed → acknowledged
```

- **Completing requires the client attendees.** A session nobody attended is a calendar entry, and
  the attendance list is what a client asks for months later.
- **Acknowledging requires a named client representative.** An acknowledgement with nobody's name on
  it is not one.
- `commissioning_id` is nullable: a single whole-package session legitimately covers every system.

---

## 3. The readiness projection now

| Item | Source | Evidence |
| --- | --- | --- |
| Systems commissioned and technically ready | T&C — the nine-gate chain | **derived** |
| As-built drawings released | Engineering | **derived** |
| **O&M deliverables accepted** | **Handover — O&M pack** | **derived (new)** |
| **Client training acknowledged** | **Handover — client training** | **derived (new)** |
| Warranty documents | — | asserted |
| Spares and consumables | — | asserted |

Four of six derived; **two ticks left**, both still saying *"nothing verifies this"*.

Rules that matter:

- **A system with no pack listed is UNKNOWN, not ready** — nothing was asked for, so nothing can be
  said.
- **Our "completed" is not enough.** Only a client-**acknowledged** session counts; a completed one
  reports *"recorded but not acknowledged"*.
- **A project-wide acknowledged session covers every system** — the legitimate whole-package case.
- Deliverables marked not required are excluded from the count. That is what marking them is for.

---

## 4. Handover gets sections — three, not eight

`/handover?section=packages|om|training`, the same URL contract as every other workspace: addressable
sections, `?project=` preserved across a switch, the strip inert while a project change is in flight,
and the AURA tab anchor unchanged.

Only three, because only three have real data. **Scope, snags, as-builts, the dossier and a separate
acceptance surface are absent on purpose** — each needs work that does not exist, and an empty
section promises what the app cannot do.

---

## 5. Tests

| Suite | Cases | Proves |
| --- | --- | --- |
| `handover-readiness.test.ts` (extended) | 20 | The O&M and training projections: UNKNOWN with no pack and no session; required-only counting; completed-but-unacknowledged blocking; a project-wide session covering every system; one-of-two systems uncovered; the four derived ticks all refused; submission following the evidence; **acceptance, warranty and the AMC event still untouched**. |
| `handover.test.ts`, Gate 1–4 suites | — | Unchanged and green. |
| `handover-om-training.spec.ts` (new, browser) | 2 | §6. |

Commissioning module **109 passed / 8 skipped**; `@aura/api` 396; `@aura/web` 182; `pnpm typecheck`
51/51; production build clean; **27 e2e** on PostgreSQL including every earlier gate re-run.

---

## 6. Browser evidence

Auth **ON**, **u-admin**, disposable PostgreSQL (`e2e-disposable`, 299/299 migrations).

| Proof | Result |
| --- | --- |
| The two new items can no longer be ticked | ✓ `omManuals` and `training` both refused by the API |
| Nothing listed ⇒ UNKNOWN, not ready | ✓ *"no O&M deliverables listed"*, *"no training session has been recorded"* |
| The standard pack can be laid out | ✓ nine deliverables, all `required` |
| Submitting without a document is refused | ✓ *"a controlled document reference is required"* |
| The lifecycle runs one step at a time | ✓ required → submitted → reviewed → accepted, each visible |
| The readiness item counts the rows | ✓ UNKNOWN → BLOCKED *"not accepted"* once rows exist |
| Our "completed" is not enough | ✓ *"recorded but not acknowledged"* |
| The client's acknowledgement flips it | ✓ READY after a named representative acknowledges |
| The Gate-5 items do not make the Gate-3 chain optional | ✓ a full pack + acknowledged training still refused while a system is not commissioning ready |
| Sections keep the project | ✓ `project=` preserved across all three |

---

## 7. Two things the proofs caught

1. **A pluralisation bug in my own reason text** — *"1 of 1 system **have** no O&M deliverables"*.
   Visible because the reason is on screen (a Gate-4 change); fixed to *"has"* / *"have"*.
2. **The Gate-4 spec asserted `omManuals` was an assertion**, which this gate made false by design.
   Updated to record the new truth and to keep testing the "asserted" property against
   `warrantyDocs`, which still is one — rather than deleting the check.

---

## 8. Known limitations

1. **Two assertions remain** — warranty documents and spares. No authority exists for either.
   Warranty documents plausibly belong with Contract; spares with Inventory. Neither link exists.
2. **The O&M document reference is free text.** It is not validated against DocControl, so a typo
   records a reference to nothing. A real link needs a DocControl read port.
3. **No attachment or upload** anywhere in this gate. Documents live in DocControl; this references
   them.
4. **Training does not model competency or expiry** — it records that a session happened and was
   acknowledged, not that anyone remains qualified.
5. **Handover still has three sections, not eight.** Scope, snags, as-builts and the dossier are
   untouched.
6. All Gate-3 dependencies (device hierarchy, device authoring UI, drawing↔system link, DocControl
   linkage, governed override, vocabulary convergence) remain open.

---

## 9. Gate-6 candidates

1. **A DocControl read port**, so an O&M reference resolves to a real controlled document and the
   as-built item can be per-system rather than project-wide.
2. **The remaining two assertions** — warranty documents via Contract, spares via Inventory.
3. **The handover dossier**, which is now mostly assembly: T&C evidence packs, O&M, training and
   as-builts all exist as rows to gather.
4. The Gate-3 backlog, unchanged.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 6 not started.
