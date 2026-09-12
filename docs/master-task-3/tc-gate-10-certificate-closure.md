# TC-GATE-10-CERTIFICATE-AS-DOCUMENT-CLOSURE

**Verdict: CLOSED / VERIFIED.** Proven in the browser against the disposable PostgreSQL database
with auth on as `u-admin`. Migration `0302` applied; `rls-fitness` re-measured at **253 / 253**.

**Scope taken:** the last `not linked` label in Testing & Commissioning — the evidence pack can now
be registered as a controlled document. This was the first Gate-10 candidate in the Gate-9 register.

---

## 1. The label this removes

Since TC-GATE-3 the Certificates & Records surface has said, in as many words:

> Formal issue — **DocControl — not linked**

and the printed evidence pack carried the same admission. T&C could produce the evidence — the test
sheet, every run behind every point including the ones that failed first, the witnessed sign-off —
and it printed well, but it was a **screen**. No document number, no revision, no issue date, no
place in the register a client is handed at the end of a job. **A dossier that cited it cited a
URL.**

---

## 2. What was built, and what was deliberately not

`aura_commissioning_certificate_links` (migration 0302). **T&C creates no document.** It does not
make a register entry, assign a number, or issue anything. A person registers the certificate in
**document control**, where documents are registered, and then says here: *this register entry is
this system's commissioning certificate.*

That is the third link of this exact shape — ITP (Gate 3), as-built (Gate 8), certificate (Gate 10) —
and the third time the answer to "these two domains cannot be joined automatically" has been an
explicit sentence a person writes rather than an inference the code makes.

**Two guards, each closing a way the record could lie:**

1. **The system must be commissioned.** A certificate for work that has not been signed off is a
   claim, and the register would then carry a controlled document making it. The evidence must exist
   before the document that attests to it. → `only a commissioned system can have its certificate
   registered — TC-G10-… is 'pending'` (409).
2. **The reference must resolve** when document control can be read — the same failure TC-GATE-6
   removed from the O&M pack. → 400.

**One certificate per system**, and that is the difference from the as-built link. A system can have
several as-built drawings, so that table is unique on `(system, document)`. A system has one
commissioning certificate; re-issuing it is a new **revision** of the same register entry, which
document control already models. A second link for one sign-off would not be a richer record — it
would be an ambiguous one.

**No register status is demanded**, unlike the as-built guard. `RegisterStatus` is drawing-shaped —
draft, for_review, for_construction, superseded, as_built — and a test certificate has no honest
value in it. Demanding one would push people to label certificates "for construction", a lie the
check itself caused. Superseded is surfaced on every read instead.

**A reference, not a copy.** Only `document_id` is stored. Number, title, revision and status are
read from the register whenever they are shown.

---

## 3. Where it shows

- **Certificates & Records** — "Formal issue" reads the document number and revision, or
  *evidence pack only*, or the reason it is not current. The control registers and withdraws.
- **The printed evidence pack** — a `CONTROLLED DOCUMENT` field, and notes that now say *"This pack
  is registered in the controlled register as CX-CERT-91719 revision A"* instead of an admission.
  When none is registered it says so: *"this pack is the evidence, not an issued document."*
- **The dossier** — the certificate line cites the document number and revision instead of the
  system code.

**The pack is still issuable without one.** A missing certificate is not a missing evidence pack, so
the dossier line stays included and says *evidence pack only*. No new blocking gate was added:
nobody has stated that formal issue is required for handover, and inventing that requirement would
have made every existing package unsubmittable for a reason nobody asked for.

---

## 4. The proof

All against the disposable PostgreSQL database (`environment: "e2e-disposable"`, 302/302
migrations) with auth ON as `u-admin`.

| Check | Result |
|---|---|
| e2e — certificates, defects, as-built links, dossier, handover, commissioning, closeout, NCR, document, drawing, journey, shortcuts | **38 passed**, 0 failed, 2 pre-existing conditional skips |
| `@aura/commissioning` | **149 passed** (was 146) |
| `@aura/api` | 399 passed |
| `@aura/web` | 182 passed |
| `pnpm typecheck` | 51 / 51 |
| production `next build` | clean |
| `rls-fitness` | 253 tenant-scoped tables · enabled 253 · forced 253 · with-policy 253 |

**The sequence the e2e drives:** register a document, try to link it to an uncommissioned system →
refused; sign the system off; link a typo → refused; link the real document → accepted; a second
document → refused; the surface, the printed pack and the dossier all cite it; supersede it in the
register → the link stands and the surface says superseded; withdraw the registration → back to
*evidence pack only*, and the controlled document is untouched.

---

## 5. What the proofs caught

**A Gate-3 assertion my own change invalidated.** `commissioning-readiness.spec.ts` asserted the
literal text `DocControl — not linked` — the exact label this gate removes. It now asserts
*evidence pack only* and carries a note saying why the old text is gone, with a pointer to the spec
that proves registration.

**One flake worth naming rather than burying.** That spec failed once against a dev server that had
not yet recompiled the changed component, and passed on every run afterwards, alone and in the full
suite. Recorded as a stale-server artifact — the same class as the incident in the Gate-2 register —
not a product fault.

---

## 6. Known limitations

1. **Still no transmittal.** Registering a certificate is not conveying it. `TransmittalItem` carries
   register entries, so the path is now open for the certificate and the as-built — but O&M
   deliverables and training records are not register entries, so a dossier-wide controlled
   conveyance remains a separate design.
2. **No PDF is stored anywhere.** The pack is rendered on demand; the register entry is a reference
   to a document that lives in document control. Nothing here uploads or attaches a file.
3. **Registration is not required for handover.** A deliberate choice (see §3) — but it means a
   package can be accepted with no controlled certificate for any system.
4. **The link does not verify the document is a certificate.** Like the as-built link, it is a
   person's assertion; what is verified is that the document exists and is current.
5. **Spares remains the one assertion** on handover readiness.
6. **Handover has five sections, not eight.** Overview and Handover Scope are still absent for want
   of data.

---

## 7. Gate-11 candidates

1. **Vocabulary convergence** — the five incompatible discipline/system vocabularies that have now
   forced three explicit links into existence.
2. **Transmittal-based issue** for the parts of the dossier that are register entries.
3. **Spares**, which still needs a new concept rather than a port.

---

**CLOSED / NOT CLOSED: CLOSED / VERIFIED.** Gate 11 not started.
