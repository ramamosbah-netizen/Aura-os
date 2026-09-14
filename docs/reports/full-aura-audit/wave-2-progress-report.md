# Wave 2 Progress Report - Technical Basis to Approved Offer

**State:** ACTIVE - bounded corrections verified; Wave 2 exit gate is not yet met  
**Evidence date:** 14 September 2026  
**Frozen discovery baseline:** unchanged at 180 capability leaves, 46 gaps and 55 UNVERIFIED cells

## Outcome of this pass

The Wave 2 passes have corrected fourteen concrete breaks in the Sales / Tender study-to-offer chain:

| Correction | Result | Evidence |
| --- | --- | --- |
| Direct quotation bypass | An Opportunity created from a Sales Enquiry cannot create a customer quotation until its approved scope, approved estimate and frozen pricing exist. | `j1-journey-audit.e2e-spec.ts`: pre-study quotation HTTP 400; final governed conversion HTTP 201. |
| Tender quotation bypass | Opening Tender estimation/pricing and generating the Tender quotation resolve the approved Technical Study through the persisted Tender-to-package relation. | J1 Auth-ON: pre-study Tender quotation HTTP 400; governed post-approval quotation HTTP 201. |
| Tender quantity-to-pricing gate | Every per-Tender pricing read/write/export/source action and customer quotation generation now requires a BOQ projected from an approved Quantity Take-Off. Legacy/manual BOQ lines cannot become priced commercial truth, appear in the pricing hub, or reach a customer offer. Item writes also resolve item → BOQ → Tender. Cost writes require estimate-update plus internal-pricing access; offer creation additionally requires quotation-create. | J1 Auth-ON: after Technical Study approval but before Take-Off projection, pricing and quotation both HTTP 409; after projection Estimator pricing/offer creation succeeds and Commercial Manager approval succeeds. Fitness 4/4 and pricing permission contract 2/2. |
| Tender submission governance | Submission now composes an approved Technical Study, an approved and projected Quantity Take-Off, and an internally approved quotation with a locked commercial baseline. | J1 Auth-ON: premature submit HTTP 409; approved path HTTP 201. |
| User-facing Tender readiness | Tender 360 shows the three submission prerequisites in order, links only to the next missing workspace and disables Submit while a prerequisite is open. The pricing workspace explains that it is waiting for approved quantities and links back to Technical Study & Quantity Take-Off. | `wave1-presales-ux.spec.ts` and `wave2-offer-output.spec.ts`: Chromium proof covers readiness, the four-step quantity workspace and the costing handoff. |
| Offer line fidelity | Customer quotation generation retains every approved scope line's description, quantity, unit and source line identity. Selling value is allocated across the actual lines and reconciles exactly after discount/rounding. | CRM pricing tests 41/41; J1 carries `24 IP cameras`, quantity `24`, unit `no`, source `camera-line`, unit sell `125`. |
| Revision traversal | Reading the quotation chain from either its root or current leaf returns the same complete ordered history. | J1 Auth-ON: root count 2, leaf count 2, parent link retained. |
| Internal commercial-data separation | Customer quotation visibility no longer implies access to cost and margin. Internal pricing requires an explicit internal-pricing capability; Estimator and Commercial Manager are allowed, while Sales is denied. The Quotation 360 UI removes internal pricing actions, margin KPI and tab when the API returns the functional refusal. Tender JSON/CSV/XLSX pricing surfaces apply the same separation. | Controller contracts green; role contract 21/21; J1 Auth-ON: Estimator/Commercial workbooks 200, Sales pricing/workbooks 403. |
| Quotation action authority | Each quotation transition now evaluates its own functional capability against the persisted quotation company. An Estimator can prepare and submit a quotation for review but cannot approve it; Commercial Manager can approve; Sales can record customer submission and negotiation without receiving approval authority. Quotation 360 obtains an action-access contract from the API and only renders actions the current actor may execute. | `wave2-quotation-role-workflow.spec.ts`: intended three-role Chromium journey 1/1; direct Estimator approval API attempt 403. Quotation security 10/10 and action-access UI fitness 3/3. |
| Approval checklist BFF connection | The reachable “Create checklist” action now reaches the canonical document-requirements seed API instead of a Next.js 404. Persisted requirement waivers are also forwarded by requirement id with the authenticated actor. | Role journey creates and settles the real approval checklist before Commercial approval; BFF fitness 2/2. |
| Tender internal pricing workbook | The Tender pricing workspace downloads a native XLSX whose Summary resolves the persisted Tender → approved Technical Study relation and whose detail retains BOQ item/build-up ids, quantities, cost components and selling values. A third sheet retains supplier RFQ/quote links when present. Every Tender pricing read surface now also requires `tendering.internal-pricing.access`, closing the CSV and JSON cost-data bypasses. | J1 Auth-ON: Estimator/Commercial Manager 200; Sales XLSX/JSON/CSV 403; Technical Manager 403; foreign tenant 404. Browser downloads a valid XLSX from the visible pricing-workspace action. |
| Tender study → quantity take-off → BOQ lineage | Tender quantity preparation now reuses the versioned Pre-Award basis. Creation resolves the persisted Tender package and approved study, assigns line identity on the server and validates optional study-item references. Pre-Sales/Estimator prepare; Technical Manager independently approves; Estimator projects the approved revision. BOQ and item rows retain basis/line provenance, projected quantities are locked against manual edits, and a new approved take-off revision is the correction path. URL/body BOQ and item ownership are resolved back to the canonical Tender. | J1 Auth-ON: correct functional roles allowed; wrong functional roles 403; incomplete approval 400; wrong-Tender projection 404; manual quantity rewrite 409; projection/reload/submission pass. Chromium shows the four-step workflow, source revision, locked BOQ and costing next action. Migration 0311 applied; health 311/311. |
| Lead ownership eligibility | Read-only CRM access no longer makes Finance assignable as a Sales lead owner. Lead receipt now has the explicit `crm.lead-assignment.receive` capability. | CRM assignment 16/16; full CRM 435/435 active tests. |
| Separate Tender technical proposal | Tender 360 now offers a separate customer Technical Proposal PDF only after the canonical Technical Study and commercial offer are approved. Its source resolves the persisted Tender → approved study → approved quotation chain, includes scope, systems, requirements/compliance, surveys, clarifications, deviations, assumptions, exclusions and evidence revisions, and excludes price/cost/margin. | J1 Auth-ON: Commercial Manager 200, Pre-Sales wrong-role 403, foreign tenant 404, no internal commercial fields. PDF renderer 3/3; persisted browser output opened, text extracted and visually inspected. |

## Actual outputs proved

### Customer quotation PDF

The Quotation 360 action now downloads a real `application/pdf` file. The server resolves legal identity from the quotation's persisted `companyId` and company/profile records. A missing company name blocks generation with a clear configuration error. The customer file contains quantities, units, unit prices, VAT, totals, payment conditions, delivery terms, exclusions, quotation revision and page numbering. It receives only customer quotation data and does not receive the internal cost/margin view.

Proof:

- `wave2-offer-output.spec.ts`: authenticated download, PDF signature, MIME type, filename and non-empty file.
- `output/pdf/wave2-quotation-proof.pdf`: opened through `pypdf`, rendered to PNG and visually inspected. One page; no clipping or overlap was found.

### Direct-sale internal pricing workbook

An authenticated `pricing.xlsx` endpoint now produces a native XLSX for quotation revisions that have a persisted cost build-up. Quotes without a cost build-up are refused. The workbook contains:

- Summary: legal company identity, quotation/revision/customer/status, direct and indirect cost, total cost, sell, profit, margin, markup and lock state.
- Cost Breakdown: 29 typed columns covering material, wastage, consumables, technician/engineer/PM labour, transport, equipment, subcontract, direct/indirect cost, unit cost, sell, profit, margin and markup.
- Complete-row autofilter and practical column widths.

The canonical estimate-to-offer projection was corrected so material, labour, plant, other direct and subcontract amounts remain in their proper cost categories. Loadings preserve the approved estimate's exact total.

Proof:

- J1 Auth-ON opens the generated workbook and verifies both sheets, legal identity and canonical values.
- The same Auth-ON proof allows Estimator and Commercial Manager, denies Sales from internal pricing with HTTP 403, denies an unrelated role from the customer-output sources with HTTP 403, and hides a foreign tenant's quotation/output sources with HTTP 404.
- `outputs/full-aura-audit/wave2-internal-pricing-proof.xlsx`: independently reopened; cells are native numeric values and the detail range is filterable.
- Reconciliation: quantity 24; material 2,400; subcontract 0; cost 2,400; sell 3,000; profit 600; margin 20%; markup 25%.

### Tender internal pricing workbook

The Tender pricing workspace now downloads an actual XLSX from its primary action. It is an internal file and is independent of the customer quotation and technical proposal. The workbook contains:

- Summary: legal company identity, Tender/reference/client/status/currency, canonical approved Technical Study id/revision/client-input revision, approved Quantity Take-Off id/source/projection audit fields, BOQ id, completeness counts and reconciled cost/sell totals.
- Cost Breakdown: 45 typed columns covering exact BOQ item and build-up identity, study lineage, quantity/unit, material, wastage, accessories, technician/engineer/PM labour, transport, equipment, subcontract, direct/indirect/overhead/risk/profit, selling rate, total and margin.
- Supplier Sources: persisted estimate-source links to RFQ, supplier quotation, component and sourced unit cost when they exist; an explicit empty-state row otherwise.

Proof:

- J1 Auth-ON opens all three sheets and verifies company identity, Technical Study S-001, input revision, BOQ/build-up identity, quantity and reconciled numeric cost/sell values.
- Estimator and Commercial Manager receive HTTP 200. Sales is denied XLSX, pricing JSON and CSV with HTTP 403; Technical Manager is denied HTTP 403; a foreign-tenant administrator receives HTTP 404.
- `wave2-offer-output.spec.ts` opens the real Tender pricing workspace, sees the internal-workspace label and priced BOQ line, uses the visible `Download pricing workbook (.xlsx)` action and verifies the downloaded ZIP/XLSX signature and filename.
- `outputs/full-aura-audit/wave2-tender-pricing-proof.xlsx`: independently reopened through two spreadsheet readers. All three sheets and key typed values were inspected; all sheets were rendered for visual inspection; no formula errors were present. The proof fixture reconciles quantity 24, direct cost 2,400 and selling value 2,400.

### Tender technical proposal PDF

Tender 360 now exposes a second customer document when both submission prerequisites are complete. The document is traced to the approved study revision and approved commercial quotation reference. It contains technical scope and compliance evidence without prices or internal commercial calculations. The source endpoint requires both Tender study-read and quotation-read capabilities; Commercial Manager can assemble it without receiving Technical Study approval authority.

Proof:

- J1 Auth-ON resolves Technical Study S-001 and quotation Rev 0 from the persisted Tender; caller-supplied study or quotation identity is not accepted.
- Commercial Manager receives HTTP 200; the study author receives HTTP 403 because they cannot see the commercial offer; a foreign-tenant administrator receives HTTP 404.
- `wave2-offer-output.spec.ts` builds a persisted Tender, records and independently approves its study, prices its BOQ, independently approves the commercial offer and downloads the technical proposal through the browser BFF.
- `output/pdf/wave2-technical-proposal-proof.pdf`: the persisted browser fixture produced a one-page PDF. Its signature and MIME were verified, required sections were extracted, absence of internal cost/margin fields was asserted, and the rendered page was visually inspected without clipping or overlap.

## Verification ledger

| Check | Result |
| --- | ---: |
| CRM complete active suite | 435/435 pass; 37 PostgreSQL integration tests remain visibly skipped in this unit-tier command |
| J1 Auth-ON API journey | 1/1 pass |
| Wave 1 + readiness browser journey | 4/4 pass |
| Wave 2 output browser proof | 2/2 pass: commercial quotation PDF; Tender quantity workflow + pricing workspace XLSX + governed technical-proposal PDF. The changed Tender scenario was rerun separately 1/1. |
| Direct quotation role browser proof | 1/1 pass: Estimator creates/finalizes pricing and submits review; Estimator approve is denied; Commercial Manager approves; Sales cannot see internal pricing and records sent/negotiation status. |
| API typecheck | Pass |
| Web typecheck | Pass |
| Repository typecheck | 51/51 pass |
| Repository build | 27/27 pass |
| Tendering active suite | 110/110 pass; 12 PostgreSQL integration tests remain visibly skipped in this unit-tier command |
| Project-scope service closure | 69/69 pass |
| Customer PDF BFF authorization propagation | 3/3 pass; authenticated source calls and 403/404 refusals produce no PDF |
| Tender technical-proposal PDF renderer | 3/3 pass; governed source, authenticated identity lookup and 403/404 refusal propagation |
| Canonical Tender proposal source | J1 Auth-ON pass; intended Commercial Manager allowed, wrong role and foreign tenant denied |
| Tender pricing read-surface permission contract | 1/1 pass across sheets, summary CSV, detail CSV, native XLSX, page payload and supplier sources |
| Tender pricing XLSX BFF | 3/3 pass; authenticated stream, safe headers and exact 403/404 propagation |
| Tender pricing and take-off role contract | 21/21 role-suite pass; Pre-Sales/Estimator prepare quantities, Technical Manager approves, Estimator projects/prices/prepares the draft offer, Commercial Manager independently approves; cost workbook access remains limited to Estimation, Commercial and Executive roles |
| Direct quotation/pricing security contracts | 33/33 pass: 21 role assertions, 10 quotation action/security assertions and 2 pricing-sheet permission assertions. |
| Quotation action-access and checklist BFF fitness | 5/5 pass; permission-aware action rendering and the previously disconnected checklist seed/waive routes are pinned. |
| Tender pricing permission contract | 2/2 pass; read/export surfaces require estimate-read plus internal-pricing access, cost mutations require estimate-update plus internal-pricing access, and customer-offer creation additionally requires quotation-create |
| Tender quantity lineage fitness | 4/4 pass; distinct permissions, persisted migration columns, canonical Tender-owned projection resolution and the mandatory pricing/quotation gate are pinned |
| Tender BOQ domain projection | 6/6 pass; provenance, idempotent reprojection, unknown-quantity refusal, manual-edit lock and wrong-Tender ownership are covered |
| Database and live API | Migration 0311 applied; health reports schema 311/311 and projections ready in the disposable environment |

## Remaining Wave 2 work

Wave 2 remains active because these exit conditions are still open:

1. Supplier quotation links are exported when present, but landed cost, currency/tax/freight and selected-source revision remain assigned to the supplier-comparison work in Wave 4 and must feed the estimate without retyping.
2. The direct role chain now proves negotiation and permission separation in the browser. Direct revision plus Tender revision/negotiation still need browser proof before the complete offer lifecycle is closed.

The corrections above reduce confirmed gaps but do not change the frozen discovery totals. Wave 2, the Business Journey programme and AURA functional completion remain open.
