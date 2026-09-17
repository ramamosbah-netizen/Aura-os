# Workspace / page coverage

217 page.tsx templates enumerated. Enumeration is not audit. 36 templates now carry new live browser evidence; the remainder stay visibly NOT_AUDITED. Dynamic routes are templates, not counts of records.

| Source page | New browser status | Output status |
| --- | --- | --- |
| apps/web/app/admin/access/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/ai/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/approval-matrix/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/audit/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/calendar/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/connectors/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/data/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/feature-flags/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/forms/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/health/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/intelligence/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/module-settings/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/modules/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/notifications/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/numbering/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/organization/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/security/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/settings/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/templates/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/users/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/webhooks/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/workflows/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/admin/workspace/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/ai/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/amc/dispatch/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/amc/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/amc/ppm/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/amc/work-orders/page.tsx | PARTIAL | Live work-order register path passed |
| apps/web/app/amc/work-orders/[id]/page.tsx | PARTIAL | Live assign/complete/SLA outcome path passed |
| apps/web/app/assets/control/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/assets/depreciation/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/assets/disposals/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/assets/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/assets/register/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/assets/register/[id]/page.tsx | PARTIAL | Live disposal gate blocked while maintenance remained open |
| apps/web/app/command-center/page.tsx | PARTIAL | Live administrator and CEO perspectives inspected |
| apps/web/app/commissioning/page.tsx | PARTIAL | Live fail/defect/retest/witnessed commissioning workflow passed |
| apps/web/app/commissioning/[id]/certificate/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/commissioning/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/compliance/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/contracts/certificates/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/contracts/certificates/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/contracts/clauses/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/contracts/contracts/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/contracts/contracts/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/contracts/contracts/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/contracts/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/controls/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/accounts/page.tsx | PARTIAL | Live customer create and native XLSX download |
| apps/web/app/crm/accounts/print/page.tsx | PARTIAL | Live one-page print view; PDF file not inspected |
| apps/web/app/crm/accounts/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/accounts/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/activities/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/analytics/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/campaigns/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/commercial/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/contacts/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/contacts/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/customers/page.tsx | PARTIAL | Live Accounts/Contacts/Stakeholder Map switching passed |
| apps/web/app/crm/forecast/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/leads/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/leads/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/market-intelligence/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/my-day/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/opportunities/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/opportunities/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/opportunities/[id]/pre-award/estimate/[estimateId]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/opportunities/[id]/pre-award/pricing/[sheetId]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/overview/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/pipeline/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/quotations/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/quotations/register/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/quotations/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/quotations/[id]/pricing/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/quotations/[id]/pricing/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/quotations/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/radar/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/crm/reports/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/doccontrol/register/page.tsx | PARTIAL | Live browser lifecycle test passed |
| apps/web/app/doccontrol/register/[id]/page.tsx | PARTIAL | Live revision/review/issue lifecycle test passed |
| apps/web/app/doccontrol/submittals/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/doccontrol/transmittals/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/documents/control/page.tsx | PARTIAL | Transmittal UI now distinguishes draft, sent, receipt and acknowledgement and displays purpose |
| apps/web/app/documents/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/documents/[id]/pdf/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/engineering/drawings/page.tsx | PARTIAL | Live grouped register/search/open path passed |
| apps/web/app/engineering/drawings/[id]/page.tsx | PARTIAL | Live submit/review/approve audit path passed; transmit not executed |
| apps/web/app/engineering/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/events/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/ap-aging/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/ar-aging/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/bank-guarantees/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/bank-reconciliation/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/budgets/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/consolidation/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/customer-invoices/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/customer-invoices/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/dashboard/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/fx/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/invoices/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/invoices/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/ledger/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/period-close/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/petty-cash/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/post-dated-cheques/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/revenue-recognition/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/statements/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/statements/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/tax/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/finance/vat-returns/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/fleet/control/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/fleet/fines/page.tsx | PARTIAL | Live disputed-fine resolution paths passed |
| apps/web/app/fleet/salik/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/handover/page.tsx | PARTIAL | Live dossier/transmittal/revision evidence workflow passed |
| apps/web/app/handover/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/appraisals/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/attendance/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/control/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/dashboard/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/document-expiry/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/eosb/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/expense-claims/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/payroll/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/staff-advances/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hr/timesheets/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hse/control/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hse/permits/page.tsx | PARTIAL | Live register and visible authorization-gate status passed |
| apps/web/app/hse/permits/[id]/page.tsx | PARTIAL | Live approve/reject/reopen/SoD/close paths passed |
| apps/web/app/hse/risk-assessments/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/hse/toolbox-talks/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inbox/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/intelligence/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/dashboard/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/grns/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/grns/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/locations/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/serials/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/stock/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/transfers/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/inventory/valuation/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/login/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/my-projects/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/my-work/approvals/page.tsx | PARTIAL | Live decision queue filters/views/mobile layout passed |
| apps/web/app/my-work/command-center/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/my-work/communication/page.tsx | PARTIAL | Live internal mail plus 7 browser tests; external accounts/attachments disconnected |
| apps/web/app/my-work/favorites/page.tsx | PARTIAL | Live in-app source-link path passed |
| apps/web/app/my-work/my-day/page.tsx | PARTIAL | Live daily focus/source coverage/mobile path passed |
| apps/web/app/my-work/page.tsx | PARTIAL | Live cross-module attention aggregation and source-link paths passed |
| apps/web/app/my-work/tasks/page.tsx | PARTIAL | Live source-owned task center and project responsibility Start/Complete handoff passed |
| apps/web/app/notifications/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/operations/overview/page.tsx | PARTIAL | Live filtered operations-to-project drilldown test passed |
| apps/web/app/operations/pre-execution/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/operations/reports/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/page.tsx | PARTIAL | Live root-to-My Work entry path passed |
| apps/web/app/procurement/dashboard/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/purchase-orders/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/purchase-orders/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/purchase-orders/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/purchase-requests/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/quotations/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/requirements/[prLineId]/comparison/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/rfqs/page.tsx | PARTIAL | Live RFQ create and two-quote comparison |
| apps/web/app/procurement/rfqs/[rfqId]/quotations/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/spend-analytics/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/suppliers/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/technical-evaluation/[quotationId]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/procurement/three-way-match/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/project/[projectId]/controls/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/project/[projectId]/drawings/page.tsx | PARTIAL | Wave 3 live project-scoped drawing registration path passed |
| apps/web/app/project/[projectId]/drawings/[drawingId]/page.tsx | PARTIAL | Wave 3 live review, sent DocControl transmittal and linked delivery-receipt path passed |
| apps/web/app/project/[projectId]/page.tsx | PARTIAL | Live authorized/anonymous/forbidden project context test passed |
| apps/web/app/project/[projectId]/team/page.tsx | PARTIAL | Wave 3 manager assignment and assignee handoff/history path passed |
| apps/web/app/project/[projectId]/workspace/[section]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/project/[projectId]/[area]/page.tsx | PARTIAL | Live site register/filter/mobile path test passed |
| apps/web/app/projects/approvals/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/projects/closeout/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/projects/controls/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/projects/dashboard/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/projects/projects/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/projects/projects/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/projects/schedule/page.tsx | PARTIAL | Wave 3 Auth-ON proof requires a same-project WBS package, creates/reloads the linked activity and displays its package; resource/progress/cost continuity remains open |
| apps/web/app/projects/variations/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/quality/calibrations/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/quality/control/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/quality/inspection-requests/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/quality/itps/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/quality/material-approvals/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/quality/ncrs/page.tsx | PARTIAL | Live NCR register path passed |
| apps/web/app/quality/ncrs/[id]/page.tsx | PARTIAL | Live plan/correct/verify-close path passed |
| apps/web/app/quality/snags/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/search/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/site/control/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/site/daily-reports/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/site/daily-reports/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/site/execution/page.tsx | PARTIAL | Live daily-report register path passed |
| apps/web/app/site/execution/[id]/page.tsx | PARTIAL | Live submit/reject/resubmit/approve/lock path passed |
| apps/web/app/site/instructions/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/subcontracts/back-charges/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/subcontracts/claims/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/subcontracts/subcontracts/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/subcontracts/subcontracts/[id]/print/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/subcontracts/variations/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/suites/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/suites/[suiteId]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/tendering/outcomes/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/tendering/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/tendering/pricing/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/tendering/tenders/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/tendering/tenders/[id]/boq/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/tendering/tenders/[id]/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/tendering/tenders/[id]/pricing/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/views/page.tsx | NOT_AUDITED | UNVERIFIED |
| apps/web/app/workspace/page.tsx | NOT_AUDITED | UNVERIFIED |
