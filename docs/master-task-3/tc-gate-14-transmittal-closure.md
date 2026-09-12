# TC-GATE-14-TRANSMITTAL-CLOSURE

**Verdict: CLOSED / VERIFIED.** Migration `0303` applied — one nullable column, no new table.
`rls-fitness` unchanged at **253 / 253** (the column joins a table that was already covered).

**Scope taken:** the controlled conveyance, recorded as a limitation in the TC-GATE-7 and TC-GATE-10
registers and carried as a Gate-N candidate ever since.

---

## 1. The question the manifest could not answer

TC-GATE-7 captured, at submission, exactly what a handover package was sending. That answers **"what
did we send?"**

It does not answer **"did they get it?"** — and those are different questions, asked by different
people. The second is the one a dispute turns on, and *"we never received the O&M manuals"* is not
refuted by our own record of having listed them.

Document control already models the answer. A transmittal has a recipient, a sent date, and an
acknowledgement with who and when. Nothing connected the two.

---

## 2. The first command port in this series

Every port before this one READS. This one asks another domain to WRITE, and the distinction that
makes it legitimate is that **DocControl performs the write itself**: it assigns the code, applies
its own permission check, emits its own event, and owns every state the transmittal moves through
afterwards. Handover supplies a list of register entries and a title. It cannot choose a number,
cannot send, cannot record receipt, and cannot acknowledge on the client's behalf.

**It opens a DRAFT, deliberately.** Sending is a decision with a recipient attached, and a handover
package does not know the client's document controller. DocControl completes and sends it, which is
its job. The draft is the handoff point: **Handover assembles and asks; DocControl conveys.**

The port carries `{ registerEntryId, revision }` and nothing else. Document control reads the number
and title from its own register when it builds each line — passing them would be this consumer
restating facts it does not own, and they would be the ones that went stale.

---

## 3. What is conveyed, and what cannot be

A transmittal carries **controlled documents**. Three of the dossier's four sections cite one when a
person has registered it — as-built drawings (TC-GATE-8), commissioning certificates (TC-GATE-10)
and O&M deliverables (TC-GATE-6). **Training records are not documents and never appear**, which is
why the surface says the issue was conveyed rather than implying every line of it was.

One document is conveyed **once**, however many deliverables cite it: two deliverables pointing at
one manual do not put it on the transmittal twice.

**Three cases produce no transmittal, and none is a failure:** the port is unwired, the register
could not be read, or the dossier cites nothing that is a controlled document. A package of evidence
packs and training records with no registered documents has nothing for a transmittal to carry, and
opening an empty one would put a hollow conveyance in the register.

**A DocControl failure does not refuse the submission.** It is caught, logged, and the manifest is
captured without a transmittal. Letting one domain's outage block another's decision would be worse
than recording the gap — and the surface states the gap plainly.

---

## 4. Ordering, and why it is not negotiable

The transmittal is opened **before** the manifest is captured, so its id exists when the rows are
written. `aura_handover_dossier_items` has no UPDATE policy (migration 0300) and **does not gain one
here**: an issued manifest is a record of what was sent, and that includes how it was sent. Stamping
the id afterwards would have required making the record editable, which is the property the table
exists to have.

---

## 5. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 303/303
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — dossier, inspections, certificates, defects, as-built links, handover, commissioning, closeout, NCR, journey | **39 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **164 passed** (was 158) |
| `@aura/doccontrol` | 35 passed |
| `@aura/api` | 405 passed |
| `@aura/web` | 185 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 253 / 253 |

**The e2e asserts it from the other side of the boundary**: after submission it reads
`/doccontrol/transmittals` and finds exactly one for the project, coded `TR-<package>-1`, in status
**`draft`** — proving DocControl holds it, made it, and has not sent it. The unit tests cover the
three no-transmittal cases and that a DocControl outage leaves the package submitted.

---

## 6. Known limitations

1. **Nothing sends it.** The transmittal is opened as a draft and waits for a person in document
   control to add a recipient and send. Handover shows that a conveyance exists, not that it has been
   received — the acknowledgement lives in DocControl and is not surfaced here.
2. **Still no PDF.** The evidence pack is rendered on demand and the register entry is a reference to
   a document living in document control. Nothing in this series has ever uploaded a file.
3. **A resubmission opens a second transmittal** (`TR-…-2`), by design — but nothing links it to the
   first, so a reader must infer the sequence from the issue numbers.
4. **Training records are outside the conveyance** and always will be under this design, because they
   are not documents. If a client's training record must be formally issued, it has to become a
   controlled document first.
5. **The ITP's `discipline` is still free text** — the last untyped vocabulary, unchanged.

---

## 7. Gate-15 candidates

1. **Surfacing the acknowledgement** — reading the transmittal's status and acknowledgement back onto
   the dossier, which turns "we conveyed it" into "they confirmed receipt".
2. **The ITP discipline**, with the data migration its free-text history requires.
3. **Spares**, which still needs a new concept rather than a port.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 15 not started.
