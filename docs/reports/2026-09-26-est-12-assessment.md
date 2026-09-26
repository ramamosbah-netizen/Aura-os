# EST-12 — the Technical Compliance Matrix: eight-layer assessment

Date: 2026-09-26. Scope: the programme owner's decision of 2026-09-25, "EST-12: select (b)":

> Build a separate server-generated, controlled Technical Compliance Matrix under Technical Manager authority. Include supplier, relevant quotation revision and line, BOQ/PR-line lineage, technical verdict, rationale, deviations, evaluator and date. Keep commercial prices out of this technical document. File it in the internal tender dossier; do not automatically include it in the client submission pack. Enforce authorized access and verify persisted output and handoff.
>
> Supplier scope preparation may remain with the Estimator. Technical verdict and commercial approval remain separate governed authorities.

## Where it stood

Seven layers were already COMPLETE: the verdict is SUP-13's (ADR-0022), consumed through `eligibilityFor`, and it moves coverage and the approval gate. Actual output was PARTIAL. Only the verdict record existed; there was no technical comparison document, pending this decision.

## What was built

- **The facts, price-free.** `TechnicalComplianceService` in procurement (which owns every fact) walks the tender's pricing requisition → RFQs → supplier families and offers → each offer's **effective** revision → its lines → the **current** verdict. It builds each row field by field, never spreading a supplier line, so unit price, discount and currency cannot travel.
- **The issued record.** `makeComplianceMatrixIssue` in tendering adds BOQ lineage and freezes the rows into a numbered revision (`TCM-<tender reference>`, Rev 0, 1, …). It refuses:
  - an empty matrix;
  - a quoted line with no verdict (naming each one; a no-bid is never waited on);
  - a re-issue without a reason;
  - re-issuing anything but the current revision;
  - any commercial key anywhere in the rows.
- **The controlled document.** The API renders an `.xlsx` workbook server-side from the frozen issue: an Issue sheet (number, revision, tender, issuer, date, reason, classification "INTERNAL … not part of the client submission", summary) and a Matrix sheet with every required field. It files the workbook in the tender's DMS dossier as a new document of kind `technical_compliance_matrix`, then records the issue with that document id and DMS's content hash. Each revision is its own sealed document, and a re-issue supersedes the previous revision rather than overwriting it.
- **Migration 0393** (`aura_tender_compliance_matrices`):
  - append-only: no delete, and nothing changes except the one supersede link, set once;
  - revisions contiguous from 0, serialised by an advisory lock, and a re-issue must carry a reason;
  - rows must be a non-empty array with no price key (a CHECK);
  - RLS tenant isolation.
- **The seal.** `TenderComplianceMatrixCommittedProvider` seals every matrix document from the moment it is filed, so EDIT and SHARE are withheld even from its creator. A new version is refused by name: "can only be superseded by re-issuing the matrix".
- **Access.**
  - Issuing: `engineering.compliance-matrix.issue`, named on the Technical Manager (the only role holding `engineering.*`).
  - Reading: `tendering.compliance-matrix.read`, which `readOnly('tendering')` reaches (Sales, Pre-Sales, Technical Manager, Commercial Manager, Executive) and which is granted explicitly to the Estimator.
  - DMS: matrix documents are read under that grant, so the Estimator reads the matrix without reading the study.
- **Screens.**
  - Tender page: the live matrix (summary, rows, awaiting count), an issue control shown only when the server says this reader may issue (disabled with the reason while lines await a verdict, and asking for a reason on re-issue), and the issued revisions with downloads.
  - Pricing page: the current issue as a compact line for the Estimator.

## Eight layers

| Layer | Status | Evidence |
|---|---|---|
| domain | COMPLETE | Unchanged verdict authority (SUP-13). Issue rules in `compliance-matrix.ts`: 6 unit tests (Rev 0 summary; empty and unjudged refused, naming the line; no-bid not waited on; re-issue reason; only the current revision; price keys refused, including nested). |
| persistence | COMPLETE | Migration 0393 plus `PostgresComplianceMatrixStore`. The pg test drives the real store and raw SQL: Rev 0 → Rev 1 supersede; a second supersede refused with nothing left behind; rows, issuer and delete refused; price, empty, skipped revision, unreasoned re-issue (NULL and blank) and blank issuer each refused. Down/up round trip verified. |
| api | COMPLETE | `GET tendering/tenders/:id/compliance-matrix` (live rows, current, issues, `canIssue`); `POST …/compliance-matrix/issue {reason}`; `GET …/issues/:issueId/workbook`, which verifies the content hash before streaming from DMS. |
| permissions | COMPLETE | The Estimator issuing is refused (403); a viewer reading the matrix or its workbook is refused (403). The issuer holds no generic document write (403). An administrator replacing the filed bytes is refused by the seal (409, by name). The verdict itself stays the Technical Manager's (`technical-verdict-handoff`, `tender-real-supply-path` green). Commercial approval is untouched. |
| ui | COMPLETE | On the tender page the Technical Manager sees the live matrix, finds the issue control disabled while lines await, and issues and re-issues with a reason on screen. The issued list marks current and superseded revisions. The Estimator's pricing page shows the current issue with its download. |
| actualOutput | COMPLETE | The issued workbook, downloaded through the BFF and read cell by cell: number, revision, issuer, classification, BOQ item, requisition line, material, supplier, supplier quotation reference, quotation revision (AURA Rev · supplier ref), quotation line id, offered make and model, the supplier's claim, deviations, verdict, rationale, evaluator and date. It contains no supplier price as a cell value, and no currency or commercial column. |
| browser | COMPLETE | `tender-compliance-matrix.spec.ts`, Auth-ON against migrated PostgreSQL with shipped roles (u-e2e-techmgr, u-e2e-estimator, u-e2e-buyer, u-e2e-storekeeper, u-e2e-presales, u-e2e-salesmgr, u-e2e-viewer; u-admin for the seal). Regressions: technical-verdict-handoff, tender-real-supply-path, tender-offer-review-award, tender-offer-revisions, wave2-offer-output, journey-signal-to-close, and the other sealed-evidence specs (commissioning witness, inspection and site evidence, NCR verification, T&C handover closure). |
| handoff | COMPLETE | The matrix is filed in the internal dossier: it is listed among the tender's dossier documents with its kind and title. The Estimator reads the current issue on the pricing page and downloads the byte-identical workbook. The client technical proposal carries nothing of it (no matrix title, number or supplier name). A re-issue moves the Estimator's view to Rev 1, while Rev 0 still downloads byte-identical, with its original verdicts and hash. |

## Stated

- **Blocking rule:** the matrix can be issued only once every quoted supplier line has a verdict. A matrix with open verdicts would not be the Technical Manager's determination. A no-bid needs no verdict (SUP-13 refuses to evaluate one), so it is listed and never waited on.
- **Revision scope:** the matrix covers each supplier offer's effective revision, the one a comparison reads today. Earlier supplier revisions stay in procurement's own history.
- **Format:** the controlled document is a workbook, not a PDF. The API already carries `xlsx`. Adding a PDF library to the API rewrote the lockfile, so that change was reverted rather than churning a shared checkout.
- **Orphan risk:** the document is filed before the issue row is written. If the row insert fails (for example, a concurrent issue taking the same revision), a sealed document can remain without an issue record. It is never presented as the matrix, because every read goes through the issue record.
