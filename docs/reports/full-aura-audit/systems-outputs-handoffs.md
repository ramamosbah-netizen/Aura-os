# System-specific T&C, outputs and handoffs

## T&C representation versus engineering content

The canonical taxonomy contains 14 values. Generic representation supports named test points, expected criteria, actual text readings, PASS/FAIL, tester/time, immutable runs, defects/corrections and retests. Commissioning sign-off has a required witnessedBy name. That is not proof of a captured witness signature on every test. Controlled certificate/as-built links and readiness are existing authorities and must be preserved.

N-TC proves generic rules, not any system's approved test protocol. New live browser proof added a synthetic point with expected/actual readings, required failure remarks, defect, correction, retained fail/retest/pass history, double-submit protection, keyboard section navigation and witnessed commissioning. R-J26 exercised a synthetic CCTV job, not all CCTV performance requirements. No regulatory compliance or engineering adequacy is asserted here. Each system's criteria must come from the applicable approved specification/procedure, not values invented by this audit.

| System | Canonical identification | Prerequisites | System-specific checklist and criteria | Readings / pass-fail / defect / retest | Witness signature / attachments | Certificate → readiness → handover | Overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CCTV | cctv | PARTIAL generic gates | UNVERIFIED approved CCTV content | PARTIAL generic + reused synthetic scenario | UNVERIFIED; witness name exists | PARTIAL reused scenario | PARTIAL |
| Access Control | access_control | PARTIAL generic gates | UNVERIFIED door/controller/interface content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED actual system output | UNVERIFIED |
| Intercom | intercom | PARTIAL generic gates | UNVERIFIED calling/interface content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Structured Cabling | structured_cabling | PARTIAL generic gates | UNVERIFIED certification readings/procedure | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Wi-Fi / Network | network; Wi-Fi specialization unverified | PARTIAL generic gates | UNVERIFIED network/wireless-specific content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| PA / BGM | public_address; BGM specialization unverified | PARTIAL generic gates | UNVERIFIED zone/interface/performance content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Fire Alarm | fire_alarm | PARTIAL generic gates | UNVERIFIED approved cause/effect and authority procedure | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| BMS | bms | PARTIAL generic gates | UNVERIFIED point schedule, sequence and interfaces | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| EMS / metering | No distinct canonical enum; other/BMS mapping unverified | UNVERIFIED | UNVERIFIED meter/communication/measurement procedure | UNVERIFIED system setup | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Intrusion Alarm | intrusion_alarm | PARTIAL generic gates | UNVERIFIED approved system content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Audio Visual | audio_visual | PARTIAL generic gates | UNVERIFIED approved system content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Nurse Call | nurse_call | PARTIAL generic gates | UNVERIFIED approved system content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Gate / Barrier | gate_barrier | PARTIAL generic gates | UNVERIFIED approved system content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Parking Management | parking_management | PARTIAL generic gates | UNVERIFIED approved system content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| HVAC / Mechanical | No distinct value in inspected T&C enum | UNVERIFIED | UNVERIFIED alternate/project-defined representation | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Plumbing / Fire Fighting | No distinct value in inspected T&C enum | UNVERIFIED | UNVERIFIED alternate/project-defined representation | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Other project system | other | PARTIAL generic gates | UNVERIFIED project-defined approved content | PARTIAL generic representation | UNVERIFIED | UNVERIFIED | UNVERIFIED |

17 audit system families are not 17 enum values: Wi-Fi/Network and PA/BGM group operational variants; EMS and MEP add required scope outside the inspected list. Do not count these rows as additional gap records. They refine TC-01..11 and UX-04.

## Export / document / report matrix

The application is running against a marked disposable database. Source existence is not COMPLETE. One native workbook and one HTML print view were inspected; a print route is still not evidence of a generated PDF file, and a stored PDF preview is not transaction PDF generation.

| Output | Source / path | Current implementation evidence | Required acceptance | Classification |
| --- | --- | --- | --- | --- |
| Shared register CSV | components/export-button.tsx | Escaped text; passed rows unless csvUrl supplied | Full authorized/filter population, Unicode, safe cell interpretation and exact totals | PARTIAL |
| Shared register Excel | components/export-button.tsx | HTML table named .xls; uses passed rows | Real operational workbook requirements, types/formulas, no missing pages | PARTIAL |
| Shared register PDF | components/export-button.tsx | Browser print window | Actual multipage PDF with headers, page breaks and complete dataset | UNVERIFIED |
| Customer register XLSX | API crm/account-360.controller.ts accountsXlsx | Actual XLSX opened: correct 12-column account row and Unicode; values text, no table/filter/freeze/branding; 10,000 row limit | Typed values, operational formatting, formulas/totals where required, and authorized population beyond cap | PARTIAL |
| Customer dossier XLSX | Same controller dossierXlsx | Multi-sheet workbook from compose | Actual sheet values, related record lineage, restricted data omission | PARTIAL |
| Template PDF preview | components/visual-template-builder.tsx | jsPDF sample variables/logo/table placeholders | Real approved transaction and branding, revision-controlled output | PARTIAL |
| Company document sheet | components/document-sheet.tsx | Live CRM Accounts print view is clean A4 HTML but uses hardcoded company/TRN | Correct tenant/company identity, logo, legal fields, multipage render and inspected PDF | WRONG_BEHAVIOR |
| Customer quotation | /crm/quotations/[id]/print | Print page discovered; R-J1 commercial output gap | Technical scope, customer pricing, correct revision, no internal margin leakage | UNVERIFIED |
| Internal pricing sheet | /crm/quotations/[id]/pricing/print | Separate print route discovered | All cost components, quantities, margin/markup and approval basis | UNVERIFIED |
| Contract | /contracts/contracts/[id]/print | Print route discovered | Approved terms, parties, award scope/value and revision | UNVERIFIED |
| Purchase order | /procurement/purchase-orders/[id]/print | Print route discovered | Selected quote items/terms, tax/currency/delivery, approval | UNVERIFIED |
| Goods receipt | /inventory/grns/[id]/print | Print route discovered | Actual partial accepted quantities and PO lineage | UNVERIFIED |
| IPC | /contracts/certificates/[id]/print | Print route discovered | Certified quantities, retention/tax, approval and cumulative amounts | UNVERIFIED |
| Customer invoice | /finance/customer-invoices/[id]/print | Print route discovered | Invoice number/tax/lines/recipient and canonical billing basis | UNVERIFIED |
| Customer statement | /finance/statements/print | Print route discovered | As-of transactions, receipts and reconciled outstanding balance | UNVERIFIED |
| Daily report | /site/daily-reports/[id]/print | Reused UI + print route | Persisted photos/signature, quantities, date, reviewer | PARTIAL |
| Handover | /handover/[id]/print | Print route discovered | Exact issued manifest and client acceptance; delivery status distinct | UNVERIFIED |
| Subcontract | /subcontracts/subcontracts/[id]/print | Print route discovered | Approved scope/rates/terms and correct company identity | UNVERIFIED |
| Payroll | /hr/payroll/[id]/print | Supporting print route discovered | Authorized confidential output and actual payroll reconciliation | NOT_AUDITED |
| Supplier comparison | RFQ client | Live two-quote comparison showed supplier, total amount, lead days, status and lowest-price recommendation; report output absent | Signed/approved item-level technical-commercial comparison and selection basis | PARTIAL |
| Programme / resource plan / look-ahead | Gantt + planning panel | Live dated task, solver proposal and acceptance work; task authoring omits WBS/dependencies/resources/quantities/productivity and no look-ahead output was found | Baseline/revision, dates, dependencies, capacity, allocations, actuals and exported programme/look-ahead | PARTIAL |
| System test sheets / certificate | Commissioning + DocControl | Evidence/controlled certificate linkage reused | Actual system-specific issued report with readings/witness/evidence | UNVERIFIED |
| Management pack | CRM/project/procurement/finance dashboards | Individual sources; consolidated pack not proven | Period, freshness, currency, reconciled KPI and record drilldown | UNVERIFIED |

23 output families. They refine OUT/EST/TC/MGT capabilities and existing gaps; no additional defect count is implied.

## Integration / handoff matrix

| From → To | Canonical payload required | Evidence / current state | Status |
| --- | --- | --- | --- |
| Enquiry → Opportunity | Customer/contact/site/systems/requirements/documents | R-J1 leadId retained; study input disconnected | DISCONNECTED |
| Sales → Engineer | Assigned study, due date, revisions, deliverables, reviewer | Generic task works; structured receipt incomplete, J1-04 | PARTIAL |
| Study → Estimation | Approved requirements/take-off revision | Caller quantity mismatch J1-08 | WRONG_BEHAVIOR |
| Supplier quote → Estimate | Item rate and quote version/currency/terms | EstimateSource stamps quote amount as sourced unit cost; full commercial normalization unverified | PARTIAL |
| Estimate → Customer offer | Approved cost/pricing scope and revision | Legacy bypass/output gaps J1-09/10/14 | WRONG_BEHAVIOR |
| Award → Contract / Project | Frozen scope/value/quantity | Reused isolated handoff succeeds; live role proof pending | PARTIAL |
| Frozen scope → Execution mapping | Same sold item and project/work package | J2-02/03 mapping UI/projection gap | DISCONNECTED |
| Engineering → Site / Buyer | Current approved revision and quantities | Drawing approval reused; notification/receipt not proven | UNVERIFIED |
| Plan → Resource owners / Site | Accepted dates, demand, allocation | Live proposal and acceptance work; schedule UI cannot author resource demand or allocate named resources, and no owner task handoff was produced | DISCONNECTED |
| RFQ award → PO | Selected supplier/item costs/terms/project | N-RFQ aggregate transfer only | PARTIAL |
| PO → GRN → Stock → Site | Ordered/received/issued/returned lineage | J3 partial receipt and dedupe defects | WRONG_BEHAVIOR |
| Site → QA / Planner / QS | Measured work and persisted evidence | R-J26 quantities work; images/signatures gap | PARTIAL |
| Certified IPC → Finance invoice | Certified line quantities and authority | J5-01 lump-sum loss of frozen lineage | DISCONNECTED |
| Invoice → Receipt / Bank | Allocation and actual settlement | Local paid status reused; bank settlement not proved | UNVERIFIED |
| T&C → Handover → DocControl | Current certificate/as-built/evidence and issued manifest | Live T&C and dossier proof retained fail/retest history, assembled canonical evidence, opened DocControl transmittal, recorded acknowledgement and preserved the issued revision after supersession; external file delivery not proved | PARTIAL |
| Handover → AMC / FM | Customer/project/assets/warranty/dossier | J6-01 wrong customer and missing canonical links | DISCONNECTED |
| Closeout → Portfolio | Completed obligations distinct from project status | J6-02 UI status mismatch | WRONG_BEHAVIOR |

17 handoff edges. New live employee handoff proof is UNVERIFIED on every edge; underlying bounded evidence remains valid where cited.

## UX friction register (aliases, not duplicate gaps)

| Existing/master gap | User friction | Required UI proof |
| --- | --- | --- |
| J1-02/04/06 | User cannot complete and hand over a structured study from intake | Sales assigns; engineer sees exact inputs and returns reviewed output |
| J1-12/13, UX-01 | Customer/project context lost across launchers | Each destination opens correct record and retains return context |
| J2-01 | Search only first 50 | Search finds authorized record beyond first page |
| J2-02 | Mapping view lacks operational action | PM creates mapping without manual IDs or duplicate quantities |
| J3-05 | Buyer cannot express full material need in header-only form | Item/spec/quantity/date/cost-code from engineering basis |
| J4-01/02/03/04 | Unsaved evidence, incorrect day, repeated project selection, hidden review route | Save/reload/download evidence, correct local date and one-click review |
| J5-02 | QS cannot author measured IPC lines in the inspected screen | Visible available/claimed/certified quantities and correct contract |
| J6-02, UX-02/03 | State labels and technical prose obscure action | Correct completed status, clear current task and issued-versus-delivered wording |
| F-01/02/03 | Output looks available but branding/data/format may not meet use | Actual approved document/workbook opens correctly and matches source |
| F-04/05/06 | Compare/mail/dashboard presence overstates operational completeness | Real comparison result, external delivery and full-population drilldown |
| F-07/08 | Planner reaches a working solver but cannot build the WBS/resource inputs it needs on that screen | WBS-linked task, dependencies, named resources, availability conflict and recipient handoff |
| F-09 | Email looks usable but cannot attach governed documents | Select authorized DMS file, external delivery/receipt and related-record history |
| F-10 | CEO cards do not lead to the records or decisions behind them | As-of/source population, cross-functional KPIs and one-click record drilldown |

The internal email workspace passed a 390×844 browser check and the project/site flow passed a mobile-path check. Broad mobile coverage, keyboard-only use, accessibility, user timing and representative non-admin role sessions remain NOT_AUDITED.
