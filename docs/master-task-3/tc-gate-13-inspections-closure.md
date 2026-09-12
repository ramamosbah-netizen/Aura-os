# TC-GATE-13-INSPECTIONS-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration** — the vocabulary this needed was widened in
TC-GATE-12, and nothing else had to move. `rls-fitness` unchanged at **253 / 253**.

**Scope taken:** F-G3-02 — *"Inspection Requests do not contribute to readiness"* — the gap recorded
in every closure register since TC-GATE-3, ten gates ago.

---

## 1. Why it stayed open for ten gates

It was never an oversight. An inspection request's `discipline` was four values —
`civil | mechanical | electrical | plumbing` — and **none of them could name an ELV system.** There
was nothing on an IR that could be matched to a commissioning record, so there was nothing to read.

Each register recorded it as a gap rather than inventing a join. TC-GATE-12 widened the field to the
canonical platform `Discipline`; this gate is what that unblocked, and it needed no further schema
change of its own.

---

## 2. The gate

A tenth link in the chain — **`inspections` / "Installation inspected"**, owned by Quality, placed
after `engineering` and before `quality`, because that is the order the work happens in: the
installation is inspected before it is commissioned.

**Matched by discipline**, through the shared map added in TC-GATE-11. An IR is filed against a
trade and a location, not against a commissioning record, so the map does the narrowing. That map is
deliberately generous — every system recognises the coarse `elv` package — so a general ELV
inspection counts for every system. Coarse, and recorded as such rather than hidden.

**Nothing raised is NOT_APPLICABLE, not UNKNOWN**, and that distinction is the whole judgement of
this gate:

- *Unreadable Quality* → **UNKNOWN**, blocks. We asked and could not hear.
- *No inspection filed for this trade* → **NOT_APPLICABLE**, passes. We were heard perfectly well;
  Quality was never asked to inspect it, which is a legitimate contract. Blocking every system on
  that would invent a requirement nobody stated.

The `retests` gate has used NOT_APPLICABLE for the same shape of answer since TC-GATE-3, and
`commissioningReady` has always treated it as passing.

**A rejected IR does not block here.** Quality's own model makes a rejection the trigger for a
non-conformance, and the `quality` gate already blocks on open NCRs. Counting the rejection too
would report one problem as two — the rule this chain has followed since TC-GATE-6. The gate says so
in its own reason, so a reader is not left wondering where the rejection went.

---

## 3. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 302/302
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — inspections, certificates, defects, as-built links, dossier, handover, commissioning, closeout, NCR, lens, Project-360, journey | **52 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **158 passed** (was 151) |
| `@aura/api` | 405 passed |
| `@aura/web` | 185 passed |
| `@aura/quality` | 30 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 253 / 253, unchanged |

**The sequence the e2e drives:** nothing raised → NOT APPLICABLE and the chain still passes; Quality
raises an IR **against `cctv`** — a discipline that could not be put on an inspection request before
TC-GATE-12 — → **BLOCKED**, naming the IR; Quality approves it → **READY**. A second spec proves a
rejection leaves this gate READY and says which gate answers it; a third proves a plumbing
inspection is not a CCTV precondition.

**On screen**: ten gates, with *Installation inspected — Quality — "0 of 1 inspection approved; 1
rejected, which Quality answers with a non-conformance rather than this gate."*

---

## 4. What the proofs caught

**One assertion of mine, not a product fault.** I asserted the state text as `NOT_APPLICABLE`; the
UI renders `NOT APPLICABLE`. The spec was wrong about the product's own display convention — caught
on first run and corrected.

---

## 5. Known limitations

1. **Discipline-level matching is coarse.** An IR is filed against a trade and a location; nothing
   ties it to a commissioning record. A general `elv` inspection blocks every system on the project,
   and an IR for one riser cannot be told apart from one for another. Sharpening it needs an
   IR↔system link — the fourth of these explicit links, and not obviously worth it.
2. **`locationDetail` is carried but unused.** It is on the fact and shown nowhere; it is the
   natural raw material for a finer match, and would still be a guess.
3. **The gate does not require an inspection to exist.** A project that files none passes it. That
   is deliberate (see §2), but it means the gate cannot enforce "this installation must be
   inspected" — only "a raised inspection must be resolved".
4. **The ITP's `discipline` is still free text** — the last untyped vocabulary, unchanged from the
   TC-GATE-12 register.
5. **Approved is Quality's word**, taken as given. Nothing here checks what was inspected or against
   what criteria.

---

## 6. Gate-14 candidates

1. **The ITP discipline**, with the data migration its free-text history requires.
2. **Transmittal-based issue** for the dossier parts that are register entries.
3. **Spares**, which still needs a new concept rather than a port.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 14 not started.
