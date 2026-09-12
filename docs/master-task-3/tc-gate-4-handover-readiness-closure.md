# TC-GATE-4-HANDOVER-READINESS-CLOSURE

**Verdict: CLOSED / VERIFIED.** Proven in the browser against the disposable PostgreSQL database
with auth on.

**Scope taken:** the first Gate-4 dependency named in the Gate-3 register — *Handover consumes the
commissioning readiness chain instead of its six hand-ticked booleans* — and the minimum around it
to make that truthful. **No new authority was created.** The remaining Gate-3 dependencies (device
hierarchy, DocControl linkage, drawing↔system link, governed override, vocabulary convergence) are
untouched and still open. No schema change was needed.

---

## 1. What was wrong

Handover readiness was six booleans on the package. Each was a person asserting that evidence
existed somewhere else, and nothing checked. A package could read **"test certificates ✓" while its
systems had never been tested** — the tick and the evidence lived in different places, and only one
of them was ever looked at. `submit` gated on three of those ticks, so a submission could be bought
by clicking.

---

## 2. What it does now

| Item | Source | Evidence |
| --- | --- | --- |
| **Systems commissioned and technically ready** | Testing & Commissioning — the TC-GATE-3 nine-gate chain, unchanged | **derived** |
| **As-built drawings released** | Engineering — a drawing at status `as_built` | **derived** |
| O&M manuals | — | asserted |
| Warranty documents | — | asserted |
| Client training and demonstration | — | asserted |
| Spares and consumables | — | asserted |

Three consequences, each asserted in tests:

1. **The two derived items cannot be ticked.** `PUT …/checklist` refuses `testCertificates` and
   `asBuilts` with *"only an item without an owning authority can be ticked by hand"*, and the two
   checkboxes are gone from the UI — a checkbox that always errored would be worse than none.
2. **`submit` gates on the assessment, not on booleans.** The refusal names what is standing in the
   way, in T&C's own words: *"1 of 2 systems not commissioning ready — TC-ACS-02: No equipment is
   registered for this system…"*.
3. **UNKNOWN is never a pass**, the same rule the T&C chain follows. Engineering unreadable, or a
   project with no drawings, or no systems registered ⇒ UNKNOWN ⇒ blocked.

**The four that stay assertions say so on the page** — *"asserted · nothing verifies this"*, and each
reason names the authority that does not exist yet (*"no O&M package authority exists yet"*). An
assertion labelled as an assertion is honest; an assertion rendered as evidence is what this gate
removed.

---

## 3. Design

- `domain/handover-readiness.ts` — pure assessment, six items, `projected` vs `asserted`.
- `HandoverService` calls **`CommissioningService.readWorkspace`** directly. Same module, so no port
  — and deliberately the *same calculation* the T&C workspace shows and the sign-off guard uses. Two
  answers to "is this system ready" would be exactly the drift this architecture exists to prevent.
- Engineering is another context, so it comes through the **`EngineeringReleasePort`** commissioning
  already declares (TC-GATE-3). Optional; absent or throwing ⇒ null ⇒ UNKNOWN.
- `submit(pkg, readiness)` now takes the assessment. `isReadyToSubmit` is kept and marked
  `@deprecated` rather than deleted, so no caller breaks silently.
- **Untouched, as required:** `accept`, the warranty start semantics, and
  `handover.accepted → AMC` — asserted directly in `handover-readiness.test.ts`.

---

## 4. Tests

| Suite | Cases | Proves |
| --- | --- | --- |
| `handover-readiness.test.ts` (new) | 11 | Every item's states; `projected` vs `asserted` labelling; UNKNOWN on unreadable Engineering, on no drawings, on no systems; the ticks for the derived items refused; submission refused while a system is not ready *whatever is ticked*; submission allowed once the evidence supports it; **acceptance, warranty and the AMC event unchanged**. |
| `handover.test.ts` | updated | `submit` now takes the assessment; the refusal names the blocker. |
| `handover-readiness.spec.ts` (new, browser) | 2 | §5. |

Commissioning module **102 passed / 8 skipped**; `@aura/api` 396; `@aura/web` 182;
`pnpm typecheck` 51/51; production build clean.

---

## 5. Browser evidence

Auth **ON**, **u-admin**, disposable PostgreSQL (`e2e-disposable`, 298/298). **25 e2e passed**,
including every Gate-1/2/3 suite re-run unchanged.

| Proof | Result |
| --- | --- |
| The derived items cannot be ticked | ✓ both refused by the API with the authority message |
| Ticking everything a person can is not enough | ✓ submission refused: *"not commissioning ready"* |
| The refusal is visible before the click | ✓ submit button disabled, its title carrying the reason |
| The panel names the source and the evidence kind | ✓ *"derived · Testing & commissioning"* / *"asserted · nothing verifies this"* |
| The reason is on screen, not just in a tooltip | ✓ made visible during this gate — a state on its own is a colour |
| Evidence made real in the owning domains moves the item | ✓ commissioning goes READY once the system passes its chain |
| Approved ≠ as-built | ✓ an approved drawing leaves as-builts BLOCKED: *"none marked as-built"* |
| The checklist no longer offers the two derived items | ✓ asserted, with a note saying where they went |

---

## 6. Known limitations

1. **Four items remain assertions** — O&M, warranty documents, client training, spares. No authority
   exists for any of them; building one is a new authority and was out of scope.
2. **As-built detection is project-wide and coarse**: "≥1 drawing at `as_built`". Per-system as-built
   coverage needs the drawing↔system link still open from Gate 3.
3. **The stored `testCertificates` / `asBuilts` booleans are now vestigial.** They are no longer read
   and no longer writable; the columns were left in place rather than migrated away, so existing rows
   keep their history.
4. **The Handover workspace is still one register** — it did not gain the eight sections sketched in
   the architecture directive. That is a separate build, and this gate deliberately did not start it.
5. Gate-3's open dependencies are all still open.

---

## 7. Gate-5 candidates

1. **The Handover workspace's own sections** (Scope, Snags, As-Builts, O&M, Training, Dossier,
   Acceptance) — several of which need new authorities, and so need explicit approval first.
2. **An O&M package authority** and a **client training & demonstration record** — the two assertions
   with the clearest shape.
3. **Drawing↔system link**, which sharpens both the T&C engineering gate and the as-built item.
4. The remaining Gate-3 items, unchanged.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 5 not started.
