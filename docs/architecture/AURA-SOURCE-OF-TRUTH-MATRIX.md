# AURA OS — Source-of-Truth Matrix

**Date:** 2026-07-14 · Verified against live tree (`main` @ `6e099e1`).

Purpose: for every major business object, name the **single authoritative owner**, its table, lifecycle, who creates it,
who consumes it, and whether any copies are **legitimate snapshots** or **duplication risk**.

Legend for "Copies": **SNAPSHOT-OK** = intentional immutable/point-in-time copy · **REF** = referenced by id (no copy) ·
**RISK** = duplication that could drift · **N/A**.

| Object | Owning module | Authoritative table/entity | Lifecycle states | Created by | Consumed by | Copies |
|---|---|---|---|---|---|---|
| **Account** | crm | `aura_crm_accounts` | prospect→active_customer→… (RelationshipStage, 0151) | manual / lead-conversion | opp, contract, invoice (by REF + name snapshot) | REF (+name snapshot SNAPSHOT-OK) |
| **Contact** | crm | `aura_crm_contacts` (0097, stakeholder 0152) | active | manual / conversion | opportunity stakeholders (REF) | REF |
| **Signal** | crm | `aura_crm_signals` (0158) | NEW→REVIEWING→RESEARCHING→PROMOTED/DISMISSED/DUPLICATE | manual / growth reactors (S9) | lead (promote) | REF (dedupeKey) |
| **Lead** | crm | `aura_crm_leads` (0044, +0156/0157) | new→qualified→converted/disqualified/nurturing | signal promote / manual | opportunity (lineage `signalId`, `leadId`) | REF |
| **Opportunity** | crm | `aura_crm_opportunities` (0044, +0145/0153/0161) | qualification→proposal→negotiation→won/lost | lead-conversion / manual | tender, quotation, contract (REF `sourceOpportunityId`) | REF |
| **Activity** | crm | `aura_crm_activities` (0098) | open→completed/cancelled (+outcome 0154) | manual | timeline, attention, advisor | N/A |
| **Requirement** | — | **none** | — | — | — | **MISSING** |
| **Site Survey** | — | **none** | — | — | — | **MISSING** |
| **Solution/Design (pre-award)** | — | **none** | — | — | — | **MISSING** |
| **BOQ** | tendering | `aura_tendering_boq` + items (0042) | authored on tender | tender / import | estimate, quotation lines, project CBS | Quotation lines = **SNAPSHOT-OK**; CBS = **SNAPSHOT-OK** (`cbs.syncFromBoq`) |
| **Rate Build-up (Estimate)** | tendering | `aura_tendering_rate_buildups` | built → **replaced on re-estimate** | estimator (`buildRate`) | BOQ selling rate, tender estimate | **RISK**: no version history (replace, `estimate.service.ts:47`) |
| **Tender Estimate (roll-up)** | tendering | derived (`summariseEstimate`) | computed | estimate service | quotation/tender total | N/A (derived) |
| **Supplier Quote** | procurement | `aura_procurement_rfqs` quotes | received→awarded/rejected | RFQ `addQuote` | PO award | REF |
| **Cost Baseline (bid)** | tendering | (via build-ups) | — | estimator | pricing | **no locked baseline object** |
| **Pricing Scenario** | — | **none** | — | — | — | **MISSING** |
| **Approved Price / Commercial Baseline** | crm (quotation) | `aura_crm_quotations` (0146) | draft→internal_review→approved→sent→…(revised) | convert / manual | client, contract value | **RISK**: approval bypassable; contract value not provably = approved total |
| **Quotation** | crm | `aura_crm_quotations` | draft→…→won/lost (revisions) | tender-gen / convert-to-quotation | contract | lines SNAPSHOT-OK from BOQ |
| **Tender** | tendering | `aura_tendering_tenders` | draft→submitted→awarded/lost (0148 provenance) | opp.won reactor / manual | contract (REF `tenderId`) | REF |
| **Contract** | contracts | `aura_contracts` | draft→active(signed)→completed | tender.awarded reactor | project (REF `contractId`), IPC, AR | REF |
| **Bond / Bank Guarantee** | contracts / finance | `aura_contracts_bonds` (0149) / `..bank_guarantees` (0061) | issued→released | contract | finance | REF |
| **Project** | projects | `aura_projects` | planned→active→completed/cancelled | contract.signed reactor | WBS/CBS, procurement, IPC | REF |
| **Budget (baseline)** | projects/finance | CBS + `aura_finance_budgets` | seeded from BOQ | contract.signed / manual | cost control | **PARTIAL** locked baseline |
| **WBS** | projects | `aura_projects_wbs` | active | contract.signed reactor / manual | progress, spend rollup | REF |
| **CBS** | projects | `aura_projects_cbs` (0047) | synced from BOQ | contract.signed reactor | cost vs budget | SNAPSHOT-OK from BOQ |
| **Purchase Request** | procurement | `aura_procurement_purchase_requests` | draft→approved→… | manual / reorder reactor | RFQ/PO | REF |
| **Purchase Order** | procurement | `aura_procurement_purchase_orders` (0062/0084) | draft→approved→issued→received→closed | RFQ award / PR | GRN, AP invoice, 3-way match | REF |
| **Inventory Item / Stock** | inventory | stock tables (0055/0073/0074/0112/0124) | on-hand (WAC) | GRN receipt | issue, GL, transfer | N/A |
| **Goods Receipt (GRN)** | inventory | `aura_inventory_goods_receipts` | created→inspected→accepted | receipt | PO status, AP suggest, GL | REF |
| **Installed Asset** | assets | `aura_assets` (0027) | active→disposed | manual (**not auto from issue**) | warranty, AMC, GL disposal | **GAP**: issue→asset not automated |
| **Variation** | projects | `aura_projects_variations` (0069 subcontract var) | draft→approved | design_change reactor / manual | contract value, billing | REF |
| **Progress Measurement** | projects | WBS spend/rollup | — | invoice.paid reactor / manual | IPC, EVM | **PARTIAL**: no formal %-complete measurement object |
| **IPC / Payment Certificate** | contracts | `aura_contracts_payment_certificates` | draft→certified | manual | AR invoice reactor | REF |
| **Customer Invoice (AR)** | finance | `aura_finance_customer_invoices` (0060/0089/0116) | draft→issued→paid | IPC/AMC reactors / manual | receivable, GL, collection | REF |
| **Supplier Invoice (AP)** | finance | `aura_finance_invoices` (0096) | draft→approved→paid | GRN/subcontract reactors / manual | payable, GL, 3-way match | REF |
| **Payment** | finance | `aura_finance_payments` | recorded | manual | invoice, GL, cash | REF |
| **Post-dated Cheque** | finance | `aura_finance_post_dated_cheques` (0072) | received/issued→cleared/bounced | manual | cash, maturity watch | REF |
| **Journal / GL** | finance | `aura_finance_journals` (0050 trigger, 0093/0117) | posted (balanced) | reactors + manual | statements, period close | N/A (authoritative ledger) |
| **Warranty** | assets/projects | (fields on asset/closeout) | — | closeout / manual | AMC, service | **PARTIAL** |
| **AMC Contract / Work Order** | amc | amc tables (0083/0118) | scheduled→completed(+escalation) | manual | AR reactor, renewal signal | REF |
| **Employee / Payroll (WPS)** | hr | hr tables (0056/0058/0063/0075/0086/0119) | — | manual | payroll, expense | **payroll→GL partial** |
| **Event (domain)** | core | `aura_events` (0001) | append-only | every service | outbox relay, projections, audit | N/A (immutable log) |

## Ambiguity / risk resolution (actionable)

1. **Rate build-up has no version** → introduce append-only build-up versions (or snapshot on approval). Until then,
   pricing history is unrecoverable. *(Gap G-EST-VER)*
2. **Approved Price is not a locked, immutable baseline carried into Contract** → the contract value can diverge from the
   approved quotation. Add a `CommercialBaseline` snapshot (locked on approval) that Contract references. *(Gap G-BASELINE)*
3. **Quotation approval bypassable** (`send` from `draft`) → make `send` require `approved` (or an explicit override with
   authorization + audit). *(Gap G-QUOTE-GATE)*
4. **Installed Asset not derived from inventory issue/installation** → wire issue→asset (or handover→asset) so warranty/AMC
   have a real installed base. *(Gap G-ASSET-LINK)*
5. **Progress Measurement object missing** → formal %-complete/measured-quantity feeding IPC (today IPC is manual).
   *(Gap G-MEASURE)*

**No object has two competing owners.** The matrix is clean on ownership; the risks above are *missing links / missing
immutability*, not split truth.
