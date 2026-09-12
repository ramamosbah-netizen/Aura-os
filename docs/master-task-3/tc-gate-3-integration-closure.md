# TC-GATE-3-INTEGRATION-CLOSURE

**Verdict: CLOSED / VERIFIED.** Built, tested, and proven in the browser against the disposable
PostgreSQL database with auth on. `rls-fitness` re-measured with migration `0298` applied.

**Scope delivered:** Inspection & Test Plans, Pre-Commissioning, the Quality escalation seam,
Certificates & Records, and Readiness & Handover — completing the eight-surface T&C workspace. No
new authority was created in any of the five.

---

## 1. The final eight surfaces

`/commissioning?section=…`, project-scoped, AURA tab anchor unchanged from `08fd19e4`.

| # | Surface | Gate | What it reads / writes |
| --- | --- | --- | --- |
| 1 | Overview | 2 | Derived counters, now including **Commissioning ready** |
| 2 | Systems & Equipment | 2 | Scope (T&C) + devices (ELV register, read-only) |
| 3 | **Inspection & Test Plans** | **3** | Quality's ITPs, read. T&C writes only the LINK |
| 4 | **Pre-Commissioning** | **3** | Equipment · Installation · Engineering · Quality, all derived |
| 5 | Testing & Commissioning | 1–2 | T&C's own evidence: points, runs, sign-off |
| 6 | Defects & Retests | 2 + **3** | T&C punch items, now with a **Quality escalation seam** |
| 7 | **Certificates & Records** | **3** | T&C's evidence pack + a print view. DocControl owns issue |
| 8 | **Readiness & Handover** | **3** | The nine-gate chain to COMMISSIONING READY |

---

## 2. Authority matrix

| Business truth | Writer | T&C's relationship after Gate 3 |
| --- | --- | --- |
| Test point, test run, commissioning status, sign-off | **T&C** | Owns. Unchanged. |
| Commissioning punch item | **T&C** | Owns. Gained an escalation NOTE and an NCR REFERENCE. |
| ITP ↔ system link | **T&C** | Owns — a sentence about T&C's own scope, not about the plan. |
| ITP: plan, points, acceptance criteria, **results** | **Quality** | Read through a port. Never written. |
| NCR / snag / corrective action | **Quality** | Read. Referenced by id. Never created here. |
| Device: tag, model, serial, status | **`@aura/elv`** | Read through a port. No writer exposed. |
| Drawing release | **Engineering** | Read through a port. Only discipline + status. |
| Controlled document issue | **DocControl** | Not linked. Stated on the page as a gap. |
| Handover acceptance, O&M, training, warranty | **Handover** | Untouched. T&C stops at "technically ready". |

**The boundary, stated once:** T&C owns *commissioned / technically ready*. Handover owns *ready to
transfer and accepted by the client*. The Readiness surface says so on the page.

---

## 3. Cross-module design

Commissioning became a **consumer** for the first time, using the pattern Projects already uses for
closeout (`modules/commissioning/src/ports.ts`):

- The **consumer declares** the interface — `ElvEquipmentPort`, `QualityEvidencePort`,
  `EngineeringReleasePort`.
- The **owning module implements** the method about itself — `ElvDeviceService.readProjectEquipment`,
  `QualityService.readProjectQualityEvidence`, `EngineeringService.readProjectDrawingRelease`.
- The **composition root binds** them (`apps/api/src/wiring/gates.module.ts`). No business module
  imports another; `architecture.fitness.test.ts` still passes.
- Every port is `@Optional()`. **An absent or throwing port yields `null`, which the chain renders as
  UNKNOWN, and UNKNOWN blocks.** Forgetting a wire cannot silently declare systems ready.

Each port returns the minimum that answers its question — a discipline and a status per drawing, a
tag/system/status per device — so nothing is copied into T&C that another domain maintains.

---

## 4. Findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| F-G3-01 | **Five different discipline/system vocabularies** in play: `ElvSystem` (commissioning, ELV), shared `Discipline` (engineering), `RegisterDiscipline` (doccontrol), IR's four-value enum (which contains no ELV discipline at all), and ITP's free-text `discipline`. | **Designed around, not papered over.** Where a canonical join exists (ELV system ↔ ELV device) it is used. Where it does not (ITP), the link is explicit and human-made. Where a mapping is a judgement (ELV system → engineering disciplines) it is a documented table in the domain, and an unmapped system reports UNKNOWN. |
| F-G3-02 | **Quality's IR cannot express an ELV discipline**, so "inspection requests" cannot contribute to per-system readiness. | Not used. The Quality gate reads NCRs and linked ITP points, both of which can be attributed to a system. Recorded as a Gate-4 input. |
| F-G3-03 | **NCR system is free text.** | Compared normalised (`Access-Control` matches `access_control`), and a null system is treated as **project-wide**, blocking every system — Quality's own model already says so. |
| F-G3-04 | **Punch INSERT was left with 17 placeholders against 20 parameters** by an incomplete patch. | Caught by the browser proof, which showed the raw Postgres error on screen rather than failing silently. Fixed; the on-conflict clause now carries the new columns too. |
| F-G3-05 | An ITP must be **active** before Quality can record a point result. | Not a product change — the spec now activates the plan, which is what a person does. |
| F-G3-06 | A link may point at an ITP Quality no longer returns. | Renders as nothing rather than a broken row; asserted. |

---

## 5. Pre-commissioning: what each gate actually asks

No checkbox exists anywhere in this surface. Nine gates, each derived, each naming its source:

| Gate | Source | READY when | UNKNOWN when |
| --- | --- | --- | --- |
| Equipment registered | ELV register | ≥1 device for this system or tied to this record | the register is unreadable, or nothing is registered |
| Installation complete | ELV register | every device installed/terminated or beyond (removed ignored) | as above |
| Engineering released | Engineering | ≥1 approved drawing in a discipline this system recognises | unreadable, or no drawing carries a recognised discipline |
| Quality clear | Quality | no open NCR for this system or project-wide, and every linked ITP point passed | Quality unreadable |
| Tests complete | T&C | every point executed and passing | — (no sheet ⇒ BLOCKED, not UNKNOWN: T&C owns that fact) |
| Defects closed | T&C | no open punch item | — |
| Retests passed | T&C | every previously-failed point now passes | — (NOT_APPLICABLE when none ever failed) |
| Witnessed sign-off | T&C | commissioned with both a signer and a witness | — |
| Evidence pack complete | T&C | a sheet exists and the system is signed off | — |

**COMMISSIONING READY = every gate READY or NOT_APPLICABLE.** One BLOCKED or UNKNOWN is enough to
say no.

**Not built, and recorded as a decision rather than assumed:** a hard block on *executing tests*
while prerequisites are unmet, with a governed override. That needs an override authority — who may,
recorded where, audited how — and inventing one was out of scope. Today the gates are visible and
advisory before testing; they are binding on COMMISSIONING READY.

---

## 6. Defects, retests and the Quality escalation seam

The Gate-2 model is unchanged: a failed run is immutable, a defect may be raised from it with
provenance, a retest is a new run, and the failure is never overwritten.

Gate 3 adds the escalation seam — three nullable columns on **T&C's own** punch item:

- `escalation_requested_at` — someone said this needs Quality.
- `escalated_by` — who said it.
- `quality_ncr_id` — a **reference** to the NCR a person raised in Quality.

The UI offers a picker of the project's real NCRs (read through the Quality port) and records the
reference. **No NCR is created, mirrored, or copied**, and the browser proof asserts that Quality's
NCR count is unchanged by the escalation. When a defect has no NCR yet, the seam says so rather than
implying coverage.

When a failed test is which:
- **(a) retest only** — the default; the point stands failed and a new run clears it.
- **(b) defect** — tracked rectification, linked to the point and the failing run (Gate 2).
- **(c) Quality escalation** — a person raises the NCR in Quality and links it here (Gate 3).

---

## 7. Schema, domain, API, UI

**Schema** — `0298_commissioning_itp_links_and_escalation.sql`: one new table
(`aura_commissioning_itp_links`, RLS enabled + FORCED + policy, unique on
`(commissioning_id, itp_id, point_index)`) plus three nullable columns on the punch table. Nothing
altered or dropped.

**Domain** — `commissioning-readiness.ts` (the nine gates, pure and fully unit-tested),
`commissioning-itp-link.ts`, `escalateToQuality` on the punch item.

**Service** — three optional ports and a `readPort` wrapper that logs and returns null;
`readWorkspace` now assembles readiness per system from four project-wide reads;
`linkItp` / `unlinkItp` / `listItpLinks`; `escalatePunchItem`; `readQualityEvidence`; `readEquipment`.

**API** — `GET records/quality-evidence`, `GET records/equipment`, `POST/GET/DELETE
records/:id/itp-links`, `PUT records/:id/punch/:punchId/escalate`. The literal reads are declared
before `:id`.

**UI** — `commissioning-gate3-sections.tsx` (four surfaces + the escalation control),
`/commissioning/[id]/certificate` (the evidence pack print view). The page now reads equipment and
Quality evidence **through commissioning's own endpoints**, so the screen and the readiness chain
cannot compute from different sources.

---

## 8. Tests

| Suite | Cases | Proves |
| --- | --- | --- |
| `commissioning-readiness.test.ts` (new) | 28 | Every gate: UNKNOWN on an unreadable domain and on nothing-to-judge; devices of other systems ignored; removed devices not counted as outstanding; the coarse `elv` discipline accepted; project-wide NCRs blocking; NCR system matched however Quality spelled it; retests NOT_APPLICABLE when nothing failed; **a commissioned system failing the wider chain**. |
| `integration.test.ts` (new) | 14 | Unbound ports ⇒ UNKNOWN ⇒ not ready; a throwing port does not blind the others; ITP requirements shown with Quality's result; point-level link with a nominated test point; refusals (foreign test point, whole-plan nomination, duplicate link); escalation records a reference and creates nothing in Quality; escalation refused on a closed defect. |
| `commissioning-readiness.spec.ts` (new, browser) | 4 | §9. |
| Gate 1 + Gate 2 suites | — | Unchanged and green. |

Commissioning module **91 passed / 8 skipped**; quality, elv, engineering suites green; `@aura/api`
396; `@aura/web` 182; `pnpm typecheck` 51/51; production `next build` clean;
`architecture.fitness.test.ts` 6/6 (ADR-0004 respected); `rls-fitness`: **248 tenant-scoped tables ·
enabled 248 · forced 248 · with-policy 248**.

---

## 9. Browser evidence

Auth **ON**, signed in as **u-admin**, against the disposable PostgreSQL database
(`environment: "e2e-disposable"`, 298/298 migrations). **25 e2e passed** including the Gate-1 and
Gate-2 suites re-run unchanged.

| Proof | Result |
| --- | --- |
| A commissioned system is **not** automatically ready | ✓ sign-off READY while equipment and engineering are UNKNOWN |
| UNKNOWN blocks | ✓ "No equipment is registered for this system, so there is nothing to say it is ready" |
| Every gate names its owning domain | ✓ "ELV device register", "Engineering", "Quality" |
| Readiness changes when the ELV register answers | ✓ register + install a device → equipment and installation go READY |
| …and when Engineering answers | ✓ create → submit → review(approved) drawing → engineering READY |
| COMMISSIONING READY once every domain answers | ✓ state flips; the summary counts it |
| ITP linked from Quality, shown with Quality's result | ✓ hold point, acceptance criteria, `pending` |
| An unproven ITP point blocks the Quality gate | ✓ BLOCKED, reason names the ITP point |
| Quality passes the point **in Quality** → gate clears | ✓ "all 1 linked ITP point passed" |
| Escalation records a reference and creates no NCR | ✓ NCR count unchanged (asserted) |
| Evidence pack | ✓ print view with points, measured values, run counts, and the DocControl disclaimer |
| Eight sections reachable, project preserved | ✓ every section keeps `project=` and sets `aria-current` |

---

## 10. Known limitations

1. **No hard pre-commissioning block with governed override** (§5) — a deliberate decision, not an
   omission.
2. **No ELV device authoring UI, and no device hierarchy** (`NVR-01 → CAM-001…064`). Carried forward
   from Gate 2, still unfixed, still visible.
3. **No search** on the workspace; filtering is by project and state.
4. **Certificates stop at the evidence pack.** No controlled document is created, and no link to a
   DocControl register entry exists.
5. **Inspection Requests do not contribute** to readiness (F-G3-02).
6. **Engineering release is coarse**: "≥1 approved drawing in a recognised discipline" is a signal,
   not proof that this system's drawings are released. Sharpening it needs a drawing↔system link.
7. **`fail(record, reason)`** still sets status independently of the points — the Gate-1 gap.
8. **`commissioning.test-run.recorded` still has no subscriber.**

---

## 11. Gate-4 dependencies

1. **Handover consumes this chain.** `commissioningReady` per system is the fact Handover's readiness
   should read instead of its six hand-ticked booleans.
2. **A drawing↔system link** in Engineering, to make the engineering gate specific.
3. **An ELV device authoring surface and hierarchy.**
4. **DocControl linkage** for formal certificate issue.
5. **A governed override authority** if pre-commissioning is to become binding before testing.
6. **Vocabulary convergence** (F-G3-01) — the broadest of these, and the one that would let several
   of the explicit links become automatic.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 4 not started.
