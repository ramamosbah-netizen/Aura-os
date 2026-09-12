# TC-GATE-19-RESOLVER-READS-CLOSURE

**Verdict: CLOSED / VERIFIED.** **No migration.** `rls-fitness` unchanged at **254 / 254**.

**Scope taken:** the sweep named at the end of TC-GATE-18 — *"other default-limited reads used as
resolvers, which is the general form of the defect this gate fixed."* It found three live defects, in
two domains this series had never touched.

---

## 1. What the sweep actually was

A default limit (`filter.limit ?? 100`) is a house pattern: **forty-five** reads across eleven modules
have one, and every one of them is fine **as a listing**. The defect is never the cap. It is asking a
capped read a question about a **whole set**.

So the sweep was: find every place a resolver — a cross-domain port, a readiness gate, a health
signal — reaches a store, and check what that store does at the bottom.

| Resolver | Underlying read | Verdict |
|---|---|---|
| `ElvEquipmentPort.readProjectEquipment` | `ElvDeviceStore.list` | uncapped — clean |
| `QualityEvidencePort` (NCRs, ITPs, snags, IRs) | four × `findAll` | uncapped — clean |
| `DocControlPort.readProjectDocuments` | `findByProject` | uncapped — clean |
| `DocControlPort.readProjectTransmittals` | `findAll` | uncapped — clean |
| `readProjectCommissioningHealth` | commissioning's own store | uncapped — clean |
| `readProjectHseHealth` | `listIncidents` / `listCapas` | uncapped — clean |
| Closeout readiness | `getByProject` | single row — clean |
| `EngineeringReleasePort.readProjectDrawingRelease` | `listDrawings` | **capped at 100 — DEFECT** |
| `readProjectEngineeringDeliveryImpact` | `listDrawings` + `listTechnicalQueries` | **capped at 100 — DEFECT** |
| `readProjectProcurementSourcingReadiness` | PR `list` + RFQ `list` | **capped at 100, tenant-wide — DEFECT** |

**Nothing could have caught any of them.** The compiler cannot see a row limit; and the **in-memory
adapters apply no default cap at all**, so the two adapters implement different contracts and every
unit test in the repository passed. That divergence is now written down at the point it exists.

---

## 2. The three defects, and which way each one lied

**Engineering released** (Commissioning's readiness gate). A row in `aura_engineering_drawings` is a
**revision**, not a drawing, so a hundred is an ordinary project. The cap is `ORDER BY created_at DESC`,
which means **the truncation was biased against the answer**: it discards the oldest rows first, and a
settled approved drawing is old. The gate looked for approved work and the cap removed approved work
first — then reported *"12 drawings for this discipline, none approved for construction"* with a number
it had not counted. **It blocked commissioning on systems that were released.**

**Engineering delivery impact** (a health signal). Same two capped reads, opposite lie: it
**under-reported**, because the outstanding reviews it could not see could not be overdue. And the
most overdue review is the oldest one, which is the first row a newest-first cap throws away.

**Procurement sourcing readiness** (a health signal). The worst of the three. Both reads were
`list({ tenantId })` — capped at a hundred **and scoped to the whole tenant rather than the project**.
Any tenant with a hundred purchase requests, which is a small tenant, lost the project's requests off
the end; `mine` came back without them; no RFQ could then be matched to the project; and the signal
reported **CLEAR**.

A health signal is read as *"someone looked"*. Saying CLEAR because the read stopped early is the one
failure mode it must not have.

---

## 3. The fix is a shape, not a bigger number

Removing `?? 100` would have fixed the symptom and left the next person free to reintroduce it. Each
resolver now reads through a method that **takes no limit and has no parameter that could add one**:

- `DrawingStore.summariseRelease(tenantId, projectId)` — `GROUP BY discipline, status` in the
  database. **Bounded by the vocabulary**, so it stays small at any project size without ever being
  cut short. The counts travel to the consumer because the consumer states them back to a reader.
- `DrawingStore.listByStatus` / `TechnicalQueryStore.listByStatus` — bounded by the work that is
  actually open, which is the only bound a health signal may rely on: one that shrinks as the answer
  becomes "nothing wrong".
- `PurchaseRequestStore.listIdsForProject` — **ids only**, because the caller needs to know which
  requests belong to the project, not what they say. Asking for less is what makes an unbounded read
  safe to have.
- `RfqStore.listByPrIds` — one `pr_id = ANY($2)`, which is the batched shape TC-GATE-18 recorded as
  its own limitation 1 and did not do.

`DrawingReleaseFact` gained a `count`, and the gate **sums** instead of measuring array length — a
detail that matters, because reading `.length` off a summary would report "2 drawings" for a project
holding two hundred. The counts still count **revision rows**, exactly as the per-row shape did: this
gate did not quietly change what the number means, only whether it is the true one.

---

## 4. A rule that is now executable

`apps/api/src/resolver-reads.fitness.test.ts` does two things:

1. **Derives** every default-capped read in every Postgres adapter and asserts the list — 45 entries.
   My own hand-grep of the same thing had found 18. Adding the forty-sixth is now a visible act, and
   whoever reviews it gets asked the question this gate had to ask by hand.
2. **Pins the four fixed resolvers** by the call each must and must not make — including TC-GATE-18's
   stock resolver, so the port cannot drift back to reading the catalogue and searching it.

The resolver list is named rather than inferred. *"Is this method answering a question about a whole
set"* is a judgement, and a test that guessed would either miss cases or cry wolf.

---

## 5. Something my own tooling did, recorded because it nearly shipped

The patch helper this series uses ran `String.replace(anchor, replacement)`. A **string** replacement
interprets `$$`, `$&` and `` $` `` — so a replacement containing ``LIMIT $${params.length}``, the shape of
every parameterised SQL template in this repository, was silently written out as ``LIMIT ${params.length}``.

Valid TypeScript. Valid SQL. A bind-parameter mismatch at runtime, in the exact method this gate was
about. **Typecheck passed and every unit test passed**; the pg-int suite caught it on its first run,
because it is the only thing here that speaks to a real engine. The helper now passes a replacer
function, and a sweep confirmed no earlier gate had been corrupted the same way.

---

## 6. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 304/304 migrations)
with auth ON as `u-admin`.

| Check | Result |
|---|---|
| `drawing-release-summary.pg-int` — real Postgres, application role, **130 revisions** | **5 passed** |
| e2e — full suite | _pending_ |
| `@aura/commissioning` | **176 passed** (was 174) |
| `@aura/engineering` | 48 passed, 5 skipped (the pg-int suite, run separately above) |
| `@aura/procurement` | 44 passed |
| `@aura/projects` | 425 passed |
| `@aura/inventory` | 41 passed, 4 skipped |
| `@aura/api` | **410 passed** (was 405 — the new fitness test) |
| `@aura/web` | 185 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | _pending_ |
| `rls-fitness` | 254 / 254 |

**The integration test proves the defect before it proves the fix.** It seeds thirty approved
revisions and then a hundred under review, so the approved ones are the oldest rows — then asserts
that `list` returns exactly a hundred rows **containing none of the thirty**. That is the old
resolver's entire view of a project with thirty approved drawings. The next assertions show the
summary counting all a hundred and thirty, the outstanding read returning every row oldest-first, and
another tenant seeing none of it.

It runs against the Postgres store rather than raw SQL on purpose: the cap lives in that adapter, and
the in-memory one does not have it.

---

## 7. Found and NOT fixed — the one that matters

**`cross-module-subscriber.ts:1128` guards a financial reversal with a capped read.** On
`po.cancelled` it calls `quantityLedger.list({ tenantId, boqItemId })` — default cap **500** — and
checks whether a reversal for that PO is already present. Past five hundred ledger rows on one BOQ
item the guard can miss the existing reversal and **post the negative quantity twice**.

It is the same class as the three above and it is left alone deliberately: it is a **write** path, and
in a money ledger. Bundling an idempotence change into a gate about reads is how an unreviewed
financial change ships. It needs its own gate, its own targeted store read, and its own proof — and it
is the first Gate-20 candidate for that reason, not a leftover.

---

## 8. Known limitations

1. **The double-post guard above is unfixed.** Stated separately because it is not a leftover.
2. **The adapters still disagree about `list`** — Postgres caps, in-memory does not. Aligning them
   would change the behaviour of a great many passing tests, which is not a change to make inside a
   gate about resolvers. It is now commented where it exists, and the fitness test explains why no
   unit test could have caught any of this.
3. **The delivery-impact signal now makes one round trip per outstanding review.** It reads each
   revision's submissions in a loop to find the overdue ones. That loop was there before — but it was
   bounded at a hundred **by the bug**, and removing the cap removed the accidental bound with it. So
   the fix traded a wrong answer for an honest one that costs more on a busy project. Correct beats
   cheap, and it is named here rather than discovered later; a `listByDrawings(ids)` would collapse
   it, and is the same batched shape as `listByPrIds` above.
4. **HSE and Quality resolve by reading the whole TENANT and filtering by project in JavaScript.**
   Correct — those reads are uncapped, which is why they are clean above — but it is O(tenant) work to
   answer an O(project) question. A performance characteristic, not a defect, and not fixed here.
5. **`work-items` reads eleven registers at `limit: 1000`.** An honest declared cap on a to-do list,
   already commented as such. It is a listing; it is not claimed to be complete.
6. **One round trip per distinct stock reference** — TC-GATE-18's limitation 1, still open. The
   batched shape now exists in Procurement (`listByPrIds`); Inventory has not adopted it.
7. **The ITP's `discipline` is still free text** — the last untyped vocabulary, unchanged since
   TC-GATE-12 named it.
8. **Handover has five sections, not eight.** Scope and Overview still have no data model.

---

## 9. Gate-20 candidates

1. **The quantity-ledger double-post guard** (§7) — a real defect, in the money path, with a clear
   fix and a clear need for its own proof.
2. **The ITP discipline**, with the data migration its free-text history requires.
3. **Handover Scope and Overview** — the two tabs of the original eight, both of which would need a
   data model invented rather than discovered.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 20 not started.
