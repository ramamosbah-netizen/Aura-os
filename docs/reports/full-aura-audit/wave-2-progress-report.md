# Wave 2 Closure Report — Technical Basis to Final Offer

**State:** CLOSED / VERIFIED for the bounded Wave 2 journey

**Evidence date:** 14 September 2026

**Recovery base:** `a4b2ea39` on local `main`

**Frozen discovery baseline:** unchanged at 180 capability leaves, 46 gaps and 55 UNVERIFIED cells

## Closure decision

Wave 2 is closed because one Direct Sale and one Tender now complete the same governed commercial chain:

`approved technical basis → canonical quantities → cost build-up → frozen pricing → maker/checker approval → issued Rev 0 → recorded negotiation reason → Rev 1 → re-approval → final issue/submission → frozen award basis`

Both browser journeys prove that Rev 0 remains readable and comparable after revision, changes to `revised` status, and cannot be edited, sent again or selected as the current award basis. Rev 1 inherits the canonical quantity, unit, scope-line identity and cost build-up; it remains editable until approval; it receives a new immutable baseline after approval; and only this final revision is consumed by contract/award processing.

This closure does not promote the frozen Full AURA audit to functional completion. Supplier landed-cost and technical/commercial comparison leaves `EST-07`, `EST-11`, `EST-12` and `EST-13` remain in the verification queue and are sequenced with the canonical supplier-decision work in Wave 4. No supplier-comparison feature was added to satisfy this bounded gate.

## Final gate matrix

| Gate | Direct Sale | Tender |
| --- | --- | --- |
| Governed basis | Approved study, estimate and frozen pricing required before quotation | Approved study and approved QTO projected to locked BOQ required before pricing/quotation |
| Rev 0 | Approved and sent | Approved and sent |
| Negotiation | Persisted reason remains visible from Rev 1 | Persisted reason remains visible from Rev 1 |
| Create revision | Server locks the canonical source row before deriving the child | Same quotation service and row-lock rule |
| Rev 0 after revision | `revised`; view/PDF allowed; terms mutation, repeat send and stale revise denied | `revised`; view/PDF allowed; mutation, repeat send and stale revise denied |
| Forged lineage | Caller `parentQuotationId` and revision values cannot replace persisted lineage | Forged parent/revision and old commercial ids cannot replace persisted lineage |
| Rev 1 carry-forward | Quantity 24, unit `no`, source identity and cost categories retained | BOQ quantity 24, unit `no`, source item and cost build-up retained |
| Repricing | Margin changed from 20% to 18%, then frozen | Margin changed to 17%, then frozen |
| Maker/checker | Estimator prepares; cannot approve. Commercial Manager approves. Sales issues/negotiates. | Estimator and Technical roles prepare governed records; independent Technical/Commercial managers approve. |
| Final issue | Rev 1 approved, sent and accepted | Rev 1 approved and sent; Tender submitted from its value |
| History | Root and leaf both return Rev 0 and Rev 1 in order | Root and leaf both return Rev 0 and Rev 1 in order |
| Award basis | Old Rev 0 conversion denied; accepted Rev 1 creates contract from Rev 1 baseline | Submit and Award resolve final Rev 1 on the server; outbox contract uses its exact baseline and value |

## Corrections completed

The earlier Wave 2 corrections remain in force: quotation bypasses are gated; Tender submission requires approved technical and quantity truth; projected BOQ quantities are locked; customer quotation and technical-proposal PDFs use governed company/record data; internal cost access is separate from customer quotation access; approval-checklist BFF routes are connected; and Direct/Tender pricing workbooks are native, typed XLSX outputs.

The final closure pass added these corrections:

1. Quotation revision creation now locks the persisted canonical source inside the transaction before calculating the next revision, preventing concurrent double children.
2. Negotiation history resolves the complete quotation chain, so the Rev 0 change reason remains visible from Rev 1.
3. Revision pricing opens from the persisted quotation estimation when no independent pricing sheet exists.
4. Saving revised estimation retains `unit`, `sourceItemId` and the original line VAT rate alongside canonical quantity and cost data.
5. Tender quotation creation carries approved BOQ and estimate build-up truth into the quotation estimation, including material, labour, equipment, subcontract, consumables, overhead, risk/contingency and margin mapping.
6. Tender submission resolves the approved current commercial baseline on the server and uses its value. Body/query quotation, baseline, parent and revision identifiers cannot nominate another commercial truth.
7. Tender award and the downstream contract event consume the stamped final Rev 1 baseline; the browser proof verifies exact quotation id, baseline id and value.

No migration was added in this pass.

## Actual final-revision outputs

| Output | Inspected result |
| --- | --- |
| `output/pdf/wave2-direct-final-rev1-offer.pdf` | One-page customer PDF, `QUO-2026-000008 | Rev 1`; quantity 24 `no`; subtotal AED 4,975.68; VAT AED 248.78; total AED 5,224.46; negotiated payment conditions present. Text extraction and 150 dpi rendering found no clipping or overlap. |
| `outputs/full-aura-audit/wave2-direct-final-rev1-pricing.xlsx` | Native XLSX with Summary and Cost Breakdown. Approved Rev 1; material AED 2,400; labour AED 1,680; total cost AED 4,080; sell AED 4,975.68; margin 18%; locked commercial basis `Yes`. Numeric cells reopen as numbers. |
| `output/pdf/wave2-tender-final-rev1-offer.pdf` | One-page customer PDF, `QUO-2026-000007 | Rev 1`; IP camera line quantity 24 `no`; subtotal AED 2,891.52; VAT AED 144.58; total AED 3,036.10; negotiated delivery terms present. Text extraction and rendering found no clipping or overlap. |
| `outputs/full-aura-audit/wave2-tender-final-rev1-pricing.xlsx` | Native XLSX with Summary and Cost Breakdown. Approved Rev 1; quantity 24; cost AED 2,400; sell AED 2,891.52; margin 17%; locked basis `Yes`. Numeric cells reopen as numbers. |

Earlier persisted proof outputs remain available for the initial customer quotation, Tender technical proposal and Tender three-sheet pricing workbook.

## Verification ledger

| Check | Result |
| --- | ---: |
| Direct + Tender final revision browser gate | 3/3 passed in Chromium: PDF fixture, Tender revision/award, Direct role journey |
| Project Scope service closure | 69/69 passed, including the 59 classified assertions |
| CRM active suite | 437 passed; 37 PostgreSQL integration tests remain visibly skipped in this unit tier |
| Tendering active suite | 112 passed; 12 PostgreSQL integration tests remain visibly skipped in this unit tier |
| API suite | 488 passed; 4 PostgreSQL integration tests remain visibly skipped in this unit tier |
| Web suite | 203/203 passed |
| Repository typecheck | 51/51 passed |
| Repository production build | 27/27 passed, including Next.js and Nest builds |
| Migration policy | 311 sequential migrations; `@DOWN` present from migration 137 onward |
| Actual PDF inspection | Both final Rev 1 PDFs parsed and rendered successfully |
| Actual XLSX inspection | Both final Rev 1 workbooks reopened; expected sheets, typed values and reconciled totals verified; no formula errors |

## Programme state

- **Wave 0 — CLOSED / VERIFIED**
- **Wave 1 — CLOSED / VERIFIED**
- **Wave 2 — CLOSED / VERIFIED**
- **Wave 3 — READY TO START**
- **AURA overall — still OPEN / NOT Functionally Complete / NOT Production Ready**

Wave 3 may consume the frozen commercial/award basis without re-entering BOQ quantity or selling price. Its own exit gate must still prove contract/project mobilisation, sold-item mapping, engineering release, connected planning and responsibility assignment before any later closure claim.
