# SEC-01 stage 4 — the thirteen owner decisions (for review)

**Status: FOR THE OWNER'S REVIEW, 2026-09-28. Nothing here is applied.** The 52 routes behind these decisions are held draft-only by `apps/api/src/sec01-stage4.fitness.test.ts`: the build fails if any role names one of their permissions before the owner decides it. Route-level detail is in [sec-01-stage-4-authority-draft.md](sec-01-stage-4-authority-draft.md).

"Proposed default" is a recommendation for a Standard Contractor template, not a decision. Where a proposal needs a monetary threshold, the amount is left for the owner. "Code" in the last-but-one column means the proposal needs more than a role change: a new domain rule, or a route split.

| # | Action / authority | Current holder(s) | Current grant | Risk or problem | Proposed Standard Contractor default | Alternative | What changes if approved | SoD? |
|---|---|---|---|---|---|---|---|---|
| D-01 | Record a payment; post a manual journal; reconcile and **un-reconcile** a bank line | Finance | `finance.payment.*`, `finance.journal.*`, `finance.bank-transaction.*` (entity wildcards) | One Finance user can pay, journal, and reconcile — or un-reconcile — the bank line that would expose it; no second person anywhere. (The Finance Controller is already barred from recording payments by an existing test.) | Finance keeps payment, journal and reconcile, by name. **Un-reconcile** (reversing a matched line) moves to the Finance Controller. | Keep all four with Finance; or add a second-person payment release above an amount you set (a new release step — code). | Finance: 3 names, loses un-reconcile (its bank-transaction wildcard narrowed, reads kept). Controller: gains un-reconcile. 4 routes leave the list. | Yes — maker/checker on reversals |
| D-02 | Generate a VAT return; mark it filed / paid | Finance | `finance.vat-return.*` | The person who prepares the return also records it as filed with the tax authority — a declaration with no review. | Finance generates; the **Finance Controller** marks filed / paid. | Keep both with Finance. | Finance loses the status change; Controller gains it. 2 routes. | Yes |
| D-03 | Change a bank guarantee's status (released / claimed / expired); a post-dated cheque's (deposited / cleared / bounced / cancelled) | Finance | `finance.bank-guarantee.*`, `finance.post-dated-cheque.*` | Releasing or claiming a guarantee is a commercial act against a counterparty (a claimed bond is a dispute). Cheque status is routine treasury. | Cheque status stays with Finance; **guarantee status → Finance Controller**. | Keep both with Finance; or guarantee claims with the Commercial Manager. | Finance keeps cheque status by name, loses guarantee status; Controller gains it. 2 routes. | Partial (guarantees) |
| D-04 | Engineering review: start review / review a drawing, set submittal status, decide a design change, move an engineering document, version a BIM model | Technical Manager | `engineering.*` (module wildcard) | One role — and the code does **not** stop the Technical Manager (who can also author through `engineering.*`) reviewing a drawing they submitted: only the permission is checked. | Technical Manager, by name, for all six; **plus a rule: the author / submitter may not review or decide their own item.** | Add a second reviewer role (e.g. Design Manager); or let the Project Engineer start reviews. | 6 names on the Technical Manager; author ≠ reviewer rule (**code**). 6 routes. | Yes — author ≠ reviewer |
| D-05 | Record the answer to an RFI | Project Engineer, Technical Manager | `engineering.rfi.*`, `engineering.*` | The Project Engineer can raise an RFI and record the answer to it themselves. | Keep both, by name; **the person who raised an RFI may not record its answer.** | Technical Manager only. | Names on both; raiser ≠ answerer rule (**code**). 1 route. | Yes |
| D-06 | Move a project variation's status (submit / approve / reject) | Project Manager, Commercial Manager | `projects.variation.*` — the service already asks for separate submit / approve / reject permissions, but both roles hold all three through the wildcard | One person can raise **and approve** the same variation; and a draft can jump straight to approved without being submitted. | **PM raises and submits; Commercial Manager approves / rejects; the raiser may not approve their own; a draft must be submitted before it is decided.** | Both roles may approve, with only the "not your own" rule. | PM loses approve / reject (variation wildcard narrowed); CM keeps them; two domain rules (**code**). 1 route. | Yes |
| D-07 | Finalise a project closeout; change a delay's status | Finalise: PM. Delay status: Planning Engineer, PM | `projects.closeout.*`; `projects.delay.*` | Low. Finalising is already refused until the readiness gates pass, and it locks the closeout. Delay status is routine. | **Keep as today, by name.** | Finalising also needs a Commercial Manager or Executive sign-off. | Names only. 2 routes. | No |
| D-08 | Change a project's status (planned → … → completed / cancelled); approve a WBS baseline; save a cash-flow forecast; create the delivery-item maps IPC billing needs | **Nobody but the System Administrator** | `*` only | No business role can run a project through its life, approve its baseline, forecast its cash, or create the maps billing posts against. | Project status → **PM**, except **cancelling → Executive** (needs the status route split — **code**); WBS baseline → **PM** (the Planning Engineer prepares); cash-flow forecast → **PM and Commercial Manager**; delivery-item maps → **Commercial Manager / QS**. | Executive for every project status change; Planning Engineer approves baselines. | New names on PM, Commercial Manager, Executive. 4 routes. | Yes — the planner prepares, the PM approves the baseline |
| D-09 | Authority approvals (Civil Defence, SIRA, utilities): register an authority, open a case, submit, schedule an inspection, record the outcome / decision, issue the certificate record, change case status | **Nobody but the System Administrator** — the `/compliance` screen refuses everyone else | `*` only | Authority approvals cannot be tracked by anyone doing the work. | **Document Controller** owns the register and records submissions, inspections, decisions and certificates; **PM and Project Engineer** may open cases and schedule inspections. | A dedicated Authority Approvals role; or the Project Engineer owns it. | Names on Document Controller, PM, Project Engineer. 8 routes. | Low — the decision is the authority's; the recorder attaches its evidence |
| D-10 | ELV device register: register a device, change its status, link it to commissioning | **Nobody but the System Administrator** | `*` only | The people who install and test devices cannot register them. | **T&C Engineer** registers, sets status and links to commissioning; **Technical Engineer** may register from design. | The Store registers devices on receipt, with serials. | Names on T&C and Technical Engineer. 4 routes. | No |
| D-11 | Generic documents: upload, add a version, share, revoke a share | **Nobody but the System Administrator** (module screens have their own upload routes) | `*` only | The generic document routes are unusable except by the administrator. | **Document Controller** holds all four. | Any staff member may upload to, and share, documents they can already read. | Names on the Document Controller. 4 routes. | No |
| D-12 | Run a line estimate; record a pricing source; trigger calibration; call AI completion | **Nobody but the System Administrator** | `*` only | Estimators cannot run a line estimate or record where a price came from. | Line estimate → **Estimator**; pricing source → **Estimator and Procurement Manager**; calibration and AI completion **stay administration** until the AI Center decides AI access. | Open AI completion to all staff now. | Names on Estimator and Procurement Manager; two routes named on the administrator. 4 routes. | No |
| D-13 | Pre-award package: override an opportunity outcome, set a pricing policy, add an estimate, edit build-ups, open the package, open / revise / preview pricing, add scope, edit scope lines | **Sales Manager only** | `crm.*` | By the role catalogue, the Estimator and Pre-Sales engineer are refused the estimate, build-up and scope acts the estimation workspace calls (not yet reproduced in the browser — I would reproduce it before applying). | Sales Manager keeps everything, by name; **Estimator** also gets estimate, build-ups and pricing open / revise / preview; **Pre-Sales** gets scope and scope lines; outcome override and pricing policy stay **Sales Manager only**. | Keep the Sales Manager only. | Names on Sales Manager, Estimator, Pre-Sales. 10 routes. | Yes — the pricing policy is set by the manager, not by the estimator who prices |

**Grant-only** (a role change the fitness test can prove): D-02, D-03, D-07, D-09, D-10, D-11, D-12, and D-01 / D-13 as proposed. **Needs code as well** (a domain rule or a route split, each with its own proof): D-04 and D-05 (author ≠ reviewer / answerer), D-06 (raiser ≠ approver, submit before decide), D-08 (cancelling split from the other status changes).


## Owner's decisions, 2026-09-28 — applied

D-01…D-08 and D-10…D-13 are applied as the owner decided them (with the owner's modifications to D-01, D-06, D-08 and D-10), each with an allowed and a forbidden actor proved (`apps/api/test/sec01-owner-decisions.e2e-spec.ts`), the domain rules of D-04, D-05 and D-06 proved on real records, and D-13 applied only after the Estimator's and Pre-Sales' refusals were reproduced in the browser. `sec01-stage4.fitness.test.ts` holds every decided act to exactly the decided holders. D-09 was held for the route split below. The owner answered it on 2026-09-29, and it is now applied (see the last section).

## D-09 — the route split the owner asked to see before anything is applied

**The owner's decision:** PM and Project Engineer own the operational authority-approval process; the Document Controller manages the controlled submissions, documents and certificates.

**Why the current routes cannot express it.** Three of the eight compliance routes do an operational act and a record-keeping act in one call, and none of them carries a document:

| Route | What it records | What it ALSO does |
|---|---|---|
| `POST compliance/cases/:id/submissions` | date, authority reference, fee, notes — **no documents** | moves the case to **submitted** |
| `POST compliance/cases/:id/decisions` | the authority's decision, conditions, reason | moves the case to **approved / rejected** |
| `POST compliance/cases/:id/certificates` | certificate number, issue and expiry dates — **no file** | moves the case to **certified** |

Giving the Document Controller the submission or certificate route would hand them the case's status; giving it to the PM would leave the Document Controller nothing to manage — the controlled documents are not in the compliance module at all today.

**The split proposed.**

| Act | Route | Holder |
|---|---|---|
| Register an authority (master data: Dubai Civil Defence, SIRA, a utility) | `POST compliance/authorities` | **owner to choose** — the Document Controller, or company configuration later (it is a configuration candidate) |
| Open a case; change its status; schedule an inspection; record the inspection outcome; record the authority's decision | existing routes | **PM, Project Engineer** |
| Prepare the controlled submission package — the register revisions sent, issued as a controlled transmittal to the authority | **new** `POST compliance/cases/:id/submission-packages` (links a doccontrol transmittal / register revisions to the case; changes no status) | **Document Controller** |
| Record that the case was submitted (date, authority reference, fee), citing the package | existing `…/submissions`, now **requiring** a package reference | **PM, Project Engineer** |
| Record the certificate as a controlled record (number, dates, the certificate file in the register) | `…/certificates`, **no longer moving the case** | **Document Controller** |
| Confirm the case certified | `PUT …/cases/:id/status` → `certified` (refused unless a live certificate is recorded) | **PM, Project Engineer** |

**Questions before it is built:** (1) who registers an authority; (2) should recording a certificate keep moving the case to *certified* automatically (simpler; the Document Controller then effectively closes the case) or require the PM/PE's confirmation as proposed; (3) is a submission without a controlled package ever acceptable (e.g. an online portal submission with no transmittal) — if so, the package reference stays optional and the screen says so.

## D-09 — the owner's answers, 2026-09-29 — applied

**The answers.** (1) The Project Engineer and the Document Controller register the authority and open the case. The PE owns the technical side, the DC the controlled submissions and records, and the PM has oversight. (2) Recording the certificate must **not** close the case. The DC records it and the case waits at *certificate received*; the PM or the PE confirms the closure. (3) A submission without a controlled package is allowed only where the method produces none, such as an authority's online portal. It then needs the evidence plus the method and reference, and **a submission never exists without evidence**.

**Who holds what now.**

| Act | Route | Holder |
|---|---|---|
| Register an authority; open a case | `POST compliance/authorities`, `POST compliance/cases` | Project Engineer, Document Controller |
| Change a case's status (including confirming closure); schedule inspections and record their outcomes; record the authority's decision | `PUT …/cases/:id/status`, `…/inspections`, `…/inspections/:id/outcome`, `…/decisions` | PM, Project Engineer |
| Record a submission | `POST …/cases/:id/submissions` | Document Controller, Project Engineer ¹ |
| Record the certificate | `POST …/cases/:id/certificates` | Document Controller |
| Read the register | `compliance.*.read` | PM, Project Engineer, Document Controller |

**The transition and closure rules, enforced in the domain:**

- A new state, `certificate_received`, sits between *approved* and *certified*.
- Recording a certificate moves an approved case (or a certified or expired one being renewed) to *certificate received*. Anywhere else it is refused with 409.
- Nobody can set *certificate received* by hand ("a case can only reach certificate received by recording its certificate").
- *Certified* is reachable only from *certificate received*, and only with a live certificate on file. *Approved* can never jump straight to *certified*.

**Evidence** (migration 0399, enforced by the table as well as the domain, so no writer can skip it):

- Every submission names its method.
- A `controlled_package` submission cites a Document Control transmittal that was actually **sent**. A draft transmittal is refused, because nothing reached the authority.
- An `authority_portal` submission cites a stored DMS document the recorder can open, plus the portal reference. An id that is not a stored document is refused.
- Submissions recorded before 0399 have no method. The constraint is `NOT VALID`, so they are kept as they were, and the screen labels them "recorded before evidence was required".

**How this differs from the split proposed above.** There is no separate `submission-packages` route. The submission cites the transmittal directly, because the transmittal *is* Document Control's controlled package: making it a second record would only duplicate it.

¹ **An interpretation to confirm.** The owner gave the controlled submissions to the Document Controller, and the operational process to the PM and PE. Recording a submission is both at once: it files the record and moves the case to *submitted*. It is therefore given to the DC **and** to the PE, since a portal submission is often made by the engineer. If the owner wants it to be the Document Controller's alone, that is a one-line role change, and the fitness test and the e2e allowed/forbidden pair go with it.

**Proof:**

- `apps/api/test/sec01-owner-decisions.e2e-spec.ts` (Auth ON, shipped roles): the allowed and forbidden actor for every act, including the PM refused registration, submission and certificate, the DC refused decisions, inspections and closure, and the PE refused the certificate. It also covers every evidence refusal and the hold at *certificate received* before the PM confirms closure.
- `modules/compliance/src/postgres-compliance-evidence.pg.test.ts`: against PostgreSQL, the table refuses an unevidenced submission however it is written, and a *certificate received* case persists.
- `apps/web/e2e/compliance-certificate-received.spec.ts`: on the real /compliance screen, the recorded certificate leaves the case at *certificate received*, with a note that closure waits for the PM or PE. The submission's evidence is shown, and the case reads *certified* only after closure is confirmed.
