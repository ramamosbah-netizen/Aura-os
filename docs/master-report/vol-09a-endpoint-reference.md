# Volume 9A — Full Endpoint Reference

[← Volume 9](vol-09-api.md) · [← Master index](README.md)

Generated from controller sources on 2026-07-03 — **551 handlers across 32 areas**. Regenerate with `node docs/master-report/tools/gen-endpoints.mjs <repo-root>`; do not hand-edit rows.


## ai (2)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/v1/ai/complete` | `complete` |
| GET | `/api/v1/ai/provider` | `provider` |

## amc (22)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/amc/contracts` | `listContracts` |
| POST | `/api/v1/amc/contracts` | `createContract` |
| GET | `/api/v1/amc/contracts/:id` | `getContract` |
| POST | `/api/v1/amc/contracts/:id/terminate` | `terminateContract` |
| GET | `/api/v1/amc/dispatch-board` | `getDispatchBoard` |
| GET | `/api/v1/amc/ppm-schedules` | `listPpms` |
| POST | `/api/v1/amc/ppm-schedules` | `createPpm` |
| POST | `/api/v1/amc/ppm-schedules/:id/deactivate` | `deactivatePpm` |
| POST | `/api/v1/amc/ppm-schedules/generate-due` | `generateDue` |
| GET | `/api/v1/amc/tickets` | `listTickets` |
| POST | `/api/v1/amc/tickets` | `raiseTicket` |
| GET | `/api/v1/amc/tickets/:id` | `getTicket` |
| POST | `/api/v1/amc/tickets/:id/assign` | `assignTicket` |
| POST | `/api/v1/amc/tickets/:id/resolve` | `resolveTicket` |
| GET | `/api/v1/amc/tickets/paged` | `pagedTickets` |
| GET | `/api/v1/amc/tickets/sla-status` | `slaStatus` |
| POST | `/api/v1/amc/tickets/sla-sweep` | `slaSweep` |
| GET | `/api/v1/amc/work-orders` | `listWorkOrders` |
| POST | `/api/v1/amc/work-orders` | `createWorkOrder` |
| POST | `/api/v1/amc/work-orders/:id/assign` | `assignWorkOrder` |
| POST | `/api/v1/amc/work-orders/:id/complete` | `completeWorkOrder` |
| GET | `/api/v1/amc/work-orders/paged` | `pagedWorkOrders` |

## assets (15)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/assets` | `listAssets` |
| POST | `/api/v1/assets` | `createAsset` |
| DELETE | `/api/v1/assets/:id` | `deleteAsset` |
| GET | `/api/v1/assets/:id/depreciation` | `depreciation` |
| GET | `/api/v1/assets/:id/qr-tag` | `qrTag` |
| GET | `/api/v1/assets/:id/qr-tag/svg` | `Header` |
| POST | `/api/v1/assets/:id/restore` | `restoreAsset` |
| GET | `/api/v1/assets/disposals` | `listDisposals` |
| POST | `/api/v1/assets/disposals` | `disposeAsset` |
| GET | `/api/v1/assets/inspections` | `listInspections` |
| POST | `/api/v1/assets/inspections` | `recordInspection` |
| GET | `/api/v1/assets/maintenance` | `listMaintenance` |
| POST | `/api/v1/assets/maintenance` | `scheduleMaintenance` |
| PUT | `/api/v1/assets/maintenance/:id/complete` | `completeMaintenance` |
| POST | `/api/v1/assets/qr-tags/batch` | `qrTagBatch` |

## audit (2)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/audit` | `list` |
| GET | `/api/v1/audit/:id` | `getById` |

## auth (3)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/v1/auth/dev-token` | `devToken` |
| POST | `/api/v1/auth/login` | `login` |
| GET | `/api/v1/auth/status` | `status` |

## builder (9)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/v1/builder/approvals` | `createApprovalMatrix` |
| POST | `/api/v1/builder/approvals/:entityType/evaluate` | `evaluateApproval` |
| GET | `/api/v1/builder/entities` | `listEntities` |
| POST | `/api/v1/builder/entities` | `registerEntity` |
| GET | `/api/v1/builder/entities/:entityKey` | `getEntity` |
| GET | `/api/v1/builder/forms` | `listForms` |
| POST | `/api/v1/builder/forms` | `createForm` |
| GET | `/api/v1/builder/forms/:formKey` | `getForm` |
| POST | `/api/v1/builder/forms/:formKey/validate` | `validateFormData` |

## contracts (23)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/contracts/certificates` | `list` |
| POST | `/api/v1/contracts/certificates` | `create` |
| GET | `/api/v1/contracts/certificates/:id` | `get` |
| PATCH | `/api/v1/contracts/certificates/:id/status` | `changeStatus` |
| GET | `/api/v1/contracts/certificates/paged` | `paged` |
| GET | `/api/v1/contracts/certificates/summary/:contractId` | `summary` |
| GET | `/api/v1/contracts/clauses` | `list` |
| POST | `/api/v1/contracts/clauses` | `create` |
| GET | `/api/v1/contracts/clauses/:id` | `get` |
| PATCH | `/api/v1/contracts/clauses/:id` | `revise` |
| GET | `/api/v1/contracts/clauses/paged` | `paged` |
| GET | `/api/v1/contracts/contracts` | `list` |
| POST | `/api/v1/contracts/contracts` | `create` |
| GET | `/api/v1/contracts/contracts/:id` | `get` |
| PATCH | `/api/v1/contracts/contracts/:id` | `update` |
| PATCH | `/api/v1/contracts/contracts/:id/status` | `changeStatus` |
| GET | `/api/v1/contracts/contracts/paged` | `paged` |
| GET | `/api/v1/contracts/obligations` | `list` |
| POST | `/api/v1/contracts/obligations` | `create` |
| GET | `/api/v1/contracts/obligations/:id` | `get` |
| PATCH | `/api/v1/contracts/obligations/:id/status` | `changeStatus` |
| GET | `/api/v1/contracts/obligations/due-soon` | `dueSoon` |
| GET | `/api/v1/contracts/obligations/paged` | `paged` |

## crm (32)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/crm/accounts` | `list` |
| POST | `/api/v1/crm/accounts` | `create` |
| GET | `/api/v1/crm/accounts/:id` | `get` |
| PATCH | `/api/v1/crm/accounts/:id` | `update` |
| GET | `/api/v1/crm/accounts/paged` | `paged` |
| GET | `/api/v1/crm/activities` | `list` |
| POST | `/api/v1/crm/activities` | `create` |
| GET | `/api/v1/crm/activities/:id` | `get` |
| POST | `/api/v1/crm/activities/:id/complete` | `complete` |
| GET | `/api/v1/crm/activities/paged` | `paged` |
| GET | `/api/v1/crm/contacts` | `list` |
| POST | `/api/v1/crm/contacts` | `create` |
| GET | `/api/v1/crm/contacts/:id` | `get` |
| GET | `/api/v1/crm/contacts/paged` | `paged` |
| GET | `/api/v1/crm/leads` | `list` |
| POST | `/api/v1/crm/leads` | `create` |
| GET | `/api/v1/crm/leads/:id` | `get` |
| PATCH | `/api/v1/crm/leads/:id` | `update` |
| GET | `/api/v1/crm/leads/paged` | `paged` |
| GET | `/api/v1/crm/opportunities` | `list` |
| POST | `/api/v1/crm/opportunities` | `create` |
| GET | `/api/v1/crm/opportunities/:id` | `get` |
| PATCH | `/api/v1/crm/opportunities/:id` | `update` |
| POST | `/api/v1/crm/opportunities/:id/convert-to-quotation` | `convertToQuotation` |
| POST | `/api/v1/crm/opportunities/:id/forecast` | `forecast` |
| GET | `/api/v1/crm/opportunities/paged` | `paged` |
| GET | `/api/v1/crm/quotations` | `list` |
| POST | `/api/v1/crm/quotations` | `create` |
| GET | `/api/v1/crm/quotations/:id` | `get` |
| POST | `/api/v1/crm/quotations/:id/convert-to-contract` | `convertToContract` |
| PATCH | `/api/v1/crm/quotations/:id/status` | `changeStatus` |
| GET | `/api/v1/crm/quotations/paged` | `paged` |

## doccontrol (16)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/doccontrol/correspondence` | `listCorrespondence` |
| POST | `/api/v1/doccontrol/correspondence` | `createCorrespondence` |
| PUT | `/api/v1/doccontrol/correspondence/:id/close` | `closeCorrespondence` |
| GET | `/api/v1/doccontrol/register` | `listRegister` |
| POST | `/api/v1/doccontrol/register` | `createRegisterEntry` |
| GET | `/api/v1/doccontrol/register/:id/history` | `registerEntryHistory` |
| PUT | `/api/v1/doccontrol/register/:id/revise` | `reviseRegisterEntry` |
| GET | `/api/v1/doccontrol/submittals` | `listSubmittals` |
| POST | `/api/v1/doccontrol/submittals` | `createSubmittal` |
| PUT | `/api/v1/doccontrol/submittals/:id/return` | `returnSubmittal` |
| PUT | `/api/v1/doccontrol/submittals/:id/submit` | `submitSubmittal` |
| GET | `/api/v1/doccontrol/transmittals` | `listTransmittals` |
| POST | `/api/v1/doccontrol/transmittals` | `createTransmittal` |
| PUT | `/api/v1/doccontrol/transmittals/:id/acknowledge` | `acknowledgeTransmittal` |
| GET | `/api/v1/doccontrol/transmittals/:id/items` | `listTransmittalItems` |
| POST | `/api/v1/doccontrol/transmittals/:id/items` | `addTransmittalItems` |

## documents (5)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/documents` | `list` |
| POST | `/api/v1/documents` | `create` |
| GET | `/api/v1/documents/:id` | `get` |
| GET | `/api/v1/documents/:id/content` | `download` |
| POST | `/api/v1/documents/:id/versions` | `addVersion` |

## engineering (26)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/engineering/bim-models` | `listBimModels` |
| POST | `/api/v1/engineering/bim-models` | `registerBimModel` |
| GET | `/api/v1/engineering/bim-models/:id` | `getBimModel` |
| PUT | `/api/v1/engineering/bim-models/:id/version` | `newBimModelVersion` |
| GET | `/api/v1/engineering/bim-models/paged` | `pagedBimModels` |
| GET | `/api/v1/engineering/drawings` | `listDrawings` |
| POST | `/api/v1/engineering/drawings` | `createDrawing` |
| GET | `/api/v1/engineering/drawings/:id` | `getDrawing` |
| PUT | `/api/v1/engineering/drawings/:id/approve` | `approveDrawing` |
| PUT | `/api/v1/engineering/drawings/:id/revision` | `reviseDrawing` |
| GET | `/api/v1/engineering/drawings/paged` | `pagedDrawings` |
| GET | `/api/v1/engineering/rfis` | `listRfis` |
| POST | `/api/v1/engineering/rfis` | `createRfi` |
| GET | `/api/v1/engineering/rfis/:id` | `getRfi` |
| PUT | `/api/v1/engineering/rfis/:id/answer` | `answerRfi` |
| GET | `/api/v1/engineering/rfis/paged` | `pagedRfis` |
| GET | `/api/v1/engineering/submittals` | `listSubmittals` |
| POST | `/api/v1/engineering/submittals` | `createSubmittal` |
| GET | `/api/v1/engineering/submittals/:id` | `getSubmittal` |
| PUT | `/api/v1/engineering/submittals/:id/status` | `updateSubmittalStatus` |
| GET | `/api/v1/engineering/submittals/paged` | `pagedSubmittals` |
| GET | `/api/v1/engineering/technical-queries` | `listTqs` |
| POST | `/api/v1/engineering/technical-queries` | `createTq` |
| GET | `/api/v1/engineering/technical-queries/:id` | `getTq` |
| PUT | `/api/v1/engineering/technical-queries/:id/respond` | `respondTq` |
| GET | `/api/v1/engineering/technical-queries/paged` | `pagedTqs` |

## events (3)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/events` | `list` |
| POST | `/api/v1/events` | `emit` |
| GET | `/api/v1/events/dead-letters` | `deadLetters` |

## finance (93)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/finance/accounts` | `listAccounts` |
| POST | `/api/v1/finance/accounts` | `createAccount` |
| GET | `/api/v1/finance/accounts/:id` | `getAccount` |
| POST | `/api/v1/finance/accounts/import` | `importAccounts` |
| GET | `/api/v1/finance/bank-guarantees` | `listBankGuarantees` |
| POST | `/api/v1/finance/bank-guarantees` | `createBankGuarantee` |
| GET | `/api/v1/finance/bank-guarantees/:id` | `getBankGuarantee` |
| PATCH | `/api/v1/finance/bank-guarantees/:id/status` | `changeBankGuaranteeStatus` |
| GET | `/api/v1/finance/bank-guarantees/expiring` | `expiringBankGuarantees` |
| GET | `/api/v1/finance/bank-guarantees/paged` | `pagedBankGuarantees` |
| GET | `/api/v1/finance/bank-transactions` | `listBankTransactions` |
| POST | `/api/v1/finance/bank-transactions/:id/reconcile` | `reconcileManually` |
| POST | `/api/v1/finance/bank-transactions/:id/unreconcile` | `unreconcileBankTransaction` |
| POST | `/api/v1/finance/bank-transactions/auto-match` | `autoMatchBankTransactions` |
| POST | `/api/v1/finance/bank-transactions/import` | `importTransactions` |
| GET | `/api/v1/finance/bank-transactions/paged` | `pagedBankTransactions` |
| GET | `/api/v1/finance/budgets` | `list` |
| POST | `/api/v1/finance/budgets` | `create` |
| GET | `/api/v1/finance/budgets/:id` | `get` |
| DELETE | `/api/v1/finance/budgets/:id` | `remove` |
| POST | `/api/v1/finance/budgets/:id/restore` | `restore` |
| GET | `/api/v1/finance/budgets/:id/vs-actual` | `vsActual` |
| GET | `/api/v1/finance/budgets/paged` | `paged` |
| GET | `/api/v1/finance/cost-centers` | `listCostCenters` |
| POST | `/api/v1/finance/cost-centers` | `createCostCenter` |
| GET | `/api/v1/finance/cost-centers/report` | `costCenterReport` |
| GET | `/api/v1/finance/customer-invoices` | `listCustomerInvoices` |
| POST | `/api/v1/finance/customer-invoices` | `createCustomerInvoice` |
| GET | `/api/v1/finance/customer-invoices/:id` | `getCustomerInvoice` |
| DELETE | `/api/v1/finance/customer-invoices/:id` | `softDeleteCustomerInvoice` |
| POST | `/api/v1/finance/customer-invoices/:id/cancel` | `cancelCustomerInvoice` |
| POST | `/api/v1/finance/customer-invoices/:id/issue` | `issueCustomerInvoice` |
| POST | `/api/v1/finance/customer-invoices/:id/receipts` | `recordReceipt` |
| POST | `/api/v1/finance/customer-invoices/:id/restore` | `restoreCustomerInvoice` |
| GET | `/api/v1/finance/customer-invoices/aging` | `arAging` |
| POST | `/api/v1/finance/customer-invoices/bulk` | `bulkCustomerInvoices` |
| GET | `/api/v1/finance/customer-invoices/fx-revaluation` | `fxRevaluation` |
| POST | `/api/v1/finance/customer-invoices/fx-revaluation/post` | `postFxRevaluation` |
| GET | `/api/v1/finance/customer-invoices/paged` | `pagedCustomerInvoices` |
| GET | `/api/v1/finance/fx/convert` | `convert` |
| GET | `/api/v1/finance/fx/rates` | `rates` |
| POST | `/api/v1/finance/fx/rates` | `setRate` |
| GET | `/api/v1/finance/invoices` | `listInvoices` |
| POST | `/api/v1/finance/invoices` | `createInvoice` |
| GET | `/api/v1/finance/invoices/:id` | `getInvoice` |
| PATCH | `/api/v1/finance/invoices/:id` | `updateInvoice` |
| PATCH | `/api/v1/finance/invoices/:id/status` | `changeInvoiceStatus` |
| GET | `/api/v1/finance/invoices/:id/tax-lines` | `getInvoiceTaxLines` |
| POST | `/api/v1/finance/invoices/:id/tax-lines` | `applyTaxLine` |
| GET | `/api/v1/finance/invoices/aging` | `apAging` |
| GET | `/api/v1/finance/invoices/fx-revaluation` | `apFxRevaluation` |
| POST | `/api/v1/finance/invoices/fx-revaluation/post` | `postApFxRevaluation` |
| GET | `/api/v1/finance/invoices/paged` | `pagedInvoices` |
| GET | `/api/v1/finance/journals` | `listJourels` |
| POST | `/api/v1/finance/journals` | `postJournal` |
| GET | `/api/v1/finance/journals/:id` | `getJournal` |
| GET | `/api/v1/finance/journals/paged` | `pagedJournals` |
| GET | `/api/v1/finance/payments` | `listPayments` |
| POST | `/api/v1/finance/payments` | `recordPayment` |
| GET | `/api/v1/finance/payments/:id` | `getPayment` |
| GET | `/api/v1/finance/payments/paged` | `pagedPayments` |
| GET | `/api/v1/finance/periods` | `list` |
| POST | `/api/v1/finance/periods/close` | `close` |
| POST | `/api/v1/finance/periods/reopen` | `reopen` |
| GET | `/api/v1/finance/petty-cash` | `listPettyCashFunds` |
| POST | `/api/v1/finance/petty-cash` | `createPettyCashFund` |
| GET | `/api/v1/finance/petty-cash/:id` | `getPettyCashFund` |
| POST | `/api/v1/finance/petty-cash/:id/transactions` | `recordPettyCashTx` |
| GET | `/api/v1/finance/petty-cash/paged` | `pagedPettyCashFunds` |
| GET | `/api/v1/finance/post-dated-cheques` | `listPostDatedCheques` |
| POST | `/api/v1/finance/post-dated-cheques` | `createPostDatedCheque` |
| GET | `/api/v1/finance/post-dated-cheques/:id` | `getPostDatedCheque` |
| PATCH | `/api/v1/finance/post-dated-cheques/:id/status` | `changeChequeStatus` |
| GET | `/api/v1/finance/post-dated-cheques/maturing` | `maturingCheques` |
| GET | `/api/v1/finance/post-dated-cheques/paged` | `pagedPostDatedCheques` |
| GET | `/api/v1/finance/post-dated-cheques/summary` | `chequeSummary` |
| GET | `/api/v1/finance/profit-centers` | `listProfitCenters` |
| POST | `/api/v1/finance/profit-centers` | `createProfitCenter` |
| GET | `/api/v1/finance/profit-centers/report` | `profitCenterReport` |
| GET | `/api/v1/finance/revenue-recognition` | `all` |
| GET | `/api/v1/finance/revenue-recognition/:projectId` | `forProject` |
| GET | `/api/v1/finance/statements/balance-sheet` | `balanceSheet` |
| GET | `/api/v1/finance/statements/cash-flow` | `cashFlow` |
| GET | `/api/v1/finance/statements/consolidated` | `consolidated` |
| GET | `/api/v1/finance/statements/income-statement` | `incomeStatement` |
| GET | `/api/v1/finance/statements/trial-balance` | `trialBalance` |
| GET | `/api/v1/finance/tax-codes` | `listTaxCodes` |
| POST | `/api/v1/finance/tax-codes` | `createTaxCode` |
| GET | `/api/v1/finance/tax-summary` | `getTaxSummary` |
| GET | `/api/v1/finance/vat-returns` | `listVatReturns` |
| POST | `/api/v1/finance/vat-returns` | `generateVatReturn` |
| PATCH | `/api/v1/finance/vat-returns/:id/status` | `setVatReturnStatus` |
| GET | `/api/v1/finance/vat-returns/preview` | `previewVatReturn` |

## fleet (22)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/fleet/fines` | `listFines` |
| POST | `/api/v1/fleet/fines` | `recordFine` |
| PUT | `/api/v1/fleet/fines/:id/assign` | `assignFine` |
| PUT | `/api/v1/fleet/fines/:id/dispute` | `disputeFine` |
| PUT | `/api/v1/fleet/fines/:id/pay` | `payFine` |
| GET | `/api/v1/fleet/fuel` | `listFuelLogs` |
| POST | `/api/v1/fleet/fuel` | `logFuel` |
| GET | `/api/v1/fleet/maintenance` | `listMaintenance` |
| POST | `/api/v1/fleet/maintenance` | `scheduleMaintenance` |
| PUT | `/api/v1/fleet/maintenance/:id/complete` | `completeMaintenance` |
| GET | `/api/v1/fleet/salik` | `listSalik` |
| POST | `/api/v1/fleet/salik` | `recordSalik` |
| PUT | `/api/v1/fleet/salik/:id/allocate` | `allocateSalik` |
| PUT | `/api/v1/fleet/salik/:id/dispute` | `disputeSalik` |
| GET | `/api/v1/fleet/salik/summary` | `salikSummary` |
| POST | `/api/v1/fleet/telemetry/webhook` | `recordTelemetry` |
| GET | `/api/v1/fleet/vehicles` | `listVehicles` |
| POST | `/api/v1/fleet/vehicles` | `createVehicle` |
| DELETE | `/api/v1/fleet/vehicles/:id` | `deleteVehicle` |
| POST | `/api/v1/fleet/vehicles/:id/restore` | `restoreVehicle` |
| GET | `/api/v1/fleet/vehicles/:id/telemetry` | `getVehicleTelemetry` |
| POST | `/api/v1/fleet/vehicles/check-expiry` | `checkExpiryAndTriggerRenewals` |

## health (1)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/health` | `check` |

## hr (41)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/hr/appraisals` | `listAppraisals` |
| POST | `/api/v1/hr/appraisals` | `createAppraisal` |
| PUT | `/api/v1/hr/appraisals/:id/acknowledge` | `acknowledgeAppraisal` |
| PUT | `/api/v1/hr/appraisals/:id/submit` | `submitAppraisal` |
| GET | `/api/v1/hr/attendance` | `listAttendance` |
| POST | `/api/v1/hr/attendance` | `recordAttendance` |
| PUT | `/api/v1/hr/attendance/:id/checkout` | `checkOutAttendance` |
| GET | `/api/v1/hr/attendance/summary` | `attendanceSummary` |
| GET | `/api/v1/hr/document-expiry` | `documentExpiry` |
| GET | `/api/v1/hr/employees` | `listEmployees` |
| POST | `/api/v1/hr/employees` | `createEmployee` |
| DELETE | `/api/v1/hr/employees/:id` | `deleteEmployee` |
| POST | `/api/v1/hr/employees/:id/restore` | `restoreEmployee` |
| POST | `/api/v1/hr/eosb` | `calcEosb` |
| GET | `/api/v1/hr/expense-claims` | `listExpenseClaims` |
| POST | `/api/v1/hr/expense-claims` | `createExpenseClaim` |
| POST | `/api/v1/hr/expense-claims/:id/approve` | `approveExpenseClaim` |
| POST | `/api/v1/hr/expense-claims/:id/reimburse` | `reimburseExpenseClaim` |
| POST | `/api/v1/hr/expense-claims/:id/reject` | `rejectExpenseClaim` |
| POST | `/api/v1/hr/expense-claims/:id/submit` | `submitExpenseClaim` |
| GET | `/api/v1/hr/leave-balance/:employeeId` | `leaveBalance` |
| GET | `/api/v1/hr/leaves` | `listLeaves` |
| POST | `/api/v1/hr/leaves` | `requestLeave` |
| PUT | `/api/v1/hr/leaves/:id/resolve` | `resolveLeave` |
| GET | `/api/v1/hr/org-chart` | `orgChart` |
| GET | `/api/v1/hr/payroll` | `listPayrollRuns` |
| POST | `/api/v1/hr/payroll` | `runPayroll` |
| GET | `/api/v1/hr/payroll/:id` | `getPayrollRun` |
| PUT | `/api/v1/hr/payroll/:id/pay` | `markPayrollPaid` |
| GET | `/api/v1/hr/staff-advances` | `listStaffAdvances` |
| POST | `/api/v1/hr/staff-advances` | `createStaffAdvance` |
| POST | `/api/v1/hr/staff-advances/:id/approve` | `approveStaffAdvance` |
| POST | `/api/v1/hr/staff-advances/:id/disburse` | `disburseStaffAdvance` |
| POST | `/api/v1/hr/staff-advances/:id/reject` | `rejectStaffAdvance` |
| POST | `/api/v1/hr/staff-advances/:id/repay` | `repayStaffAdvance` |
| GET | `/api/v1/hr/timesheets` | `listTimesheets` |
| POST | `/api/v1/hr/timesheets` | `createTimesheet` |
| POST | `/api/v1/hr/timesheets/:id/approve` | `approveTimesheet` |
| POST | `/api/v1/hr/timesheets/:id/reject` | `rejectTimesheet` |
| POST | `/api/v1/hr/timesheets/:id/submit` | `submitTimesheet` |
| POST | `/api/v1/hr/wps` | `generateWps` |

## hse (19)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/hse/capas` | `listCapas` |
| POST | `/api/v1/hse/capas` | `raiseCapa` |
| PUT | `/api/v1/hse/capas/:id/complete` | `completeCapa` |
| GET | `/api/v1/hse/incidents` | `listIncidents` |
| POST | `/api/v1/hse/incidents` | `reportIncident` |
| PUT | `/api/v1/hse/incidents/:id/close` | `closeIncident` |
| GET | `/api/v1/hse/incidents/paged` | `pagedIncidents` |
| GET | `/api/v1/hse/ptws` | `listPermits` |
| POST | `/api/v1/hse/ptws` | `requestPermit` |
| PUT | `/api/v1/hse/ptws/:id/approve` | `approvePermit` |
| GET | `/api/v1/hse/ptws/paged` | `pagedPermits` |
| GET | `/api/v1/hse/risk-assessments` | `listRiskAssessments` |
| POST | `/api/v1/hse/risk-assessments` | `createRiskAssessment` |
| PUT | `/api/v1/hse/risk-assessments/:id/approve` | `approveRiskAssessment` |
| GET | `/api/v1/hse/toolbox-talks` | `listToolboxTalks` |
| POST | `/api/v1/hse/toolbox-talks` | `recordToolboxTalk` |
| GET | `/api/v1/hse/training` | `listSafetyTraining` |
| POST | `/api/v1/hse/training` | `recordSafetyTraining` |
| GET | `/api/v1/hse/training/worker/:workerId` | `getSafetyTrainingForWorker` |

## inbox (1)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/inbox` | `list` |

## integration (3)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/integration/webhooks` | `list` |
| POST | `/api/v1/integration/webhooks` | `register` |
| GET | `/api/v1/integration/webhooks/deliveries` | `deliveries` |

## intelligence (11)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/intelligence/calibrations` | `listCalibrations` |
| POST | `/api/v1/intelligence/calibrations/trigger` | `triggerCalibration` |
| POST | `/api/v1/intelligence/chat` | `chat` |
| POST | `/api/v1/intelligence/insights` | `generate` |
| GET | `/api/v1/intelligence/pipeline` | `pipeline` |
| POST | `/api/v1/intelligence/pricing-sources` | `recordSource` |
| GET | `/api/v1/intelligence/projects` | `projects` |
| GET | `/api/v1/intelligence/proposals` | `listProposals` |
| POST | `/api/v1/intelligence/proposals` | `createProposal` |
| POST | `/api/v1/intelligence/proposals/:id/execute` | `executeProposal` |
| POST | `/api/v1/intelligence/proposals/:id/reject` | `rejectProposal` |

## inventory (19)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/inventory/grns` | `list` |
| POST | `/api/v1/inventory/grns` | `create` |
| GET | `/api/v1/inventory/grns/:id` | `get` |
| GET | `/api/v1/inventory/grns/paged` | `paged` |
| GET | `/api/v1/inventory/stock` | `listItems` |
| POST | `/api/v1/inventory/stock` | `createItem` |
| GET | `/api/v1/inventory/stock/:id` | `getItem` |
| GET | `/api/v1/inventory/stock/:id/fifo` | `fifo` |
| POST | `/api/v1/inventory/stock/:id/movements` | `recordMovement` |
| PATCH | `/api/v1/inventory/stock/:id/reorder` | `setReorder` |
| PATCH | `/api/v1/inventory/stock/:id/uom` | `setUom` |
| GET | `/api/v1/inventory/stock/by-barcode/:barcode` | `byBarcode` |
| GET | `/api/v1/inventory/stock/paged` | `pagedItems` |
| GET | `/api/v1/inventory/stock/reorder` | `reorder` |
| GET | `/api/v1/inventory/stock/valuation` | `valuation` |
| GET | `/api/v1/inventory/transfers` | `list` |
| POST | `/api/v1/inventory/transfers` | `create` |
| GET | `/api/v1/inventory/transfers/:id` | `get` |
| GET | `/api/v1/inventory/transfers/paged` | `paged` |

## notifications (3)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/notifications` | `list` |
| PATCH | `/api/v1/notifications/:id/read` | `markRead` |
| GET | `/api/v1/notifications/unread-count` | `unreadCount` |

## procurement (33)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/v1/procurement/approval-matrix` | `configureApprovalMatrix` |
| GET | `/api/v1/procurement/framework-agreements` | `list` |
| POST | `/api/v1/procurement/framework-agreements` | `create` |
| GET | `/api/v1/procurement/framework-agreements/:id` | `get` |
| POST | `/api/v1/procurement/framework-agreements/:id/activate` | `activate` |
| POST | `/api/v1/procurement/framework-agreements/:id/call-offs` | `callOff` |
| POST | `/api/v1/procurement/framework-agreements/:id/terminate` | `terminate` |
| GET | `/api/v1/procurement/framework-agreements/paged` | `paged` |
| GET | `/api/v1/procurement/purchase-orders` | `listPos` |
| POST | `/api/v1/procurement/purchase-orders` | `createPo` |
| GET | `/api/v1/procurement/purchase-orders/:id` | `getPo` |
| PATCH | `/api/v1/procurement/purchase-orders/:id` | `updatePo` |
| POST | `/api/v1/procurement/purchase-orders/:id/approve` | `approvePo` |
| PATCH | `/api/v1/procurement/purchase-orders/:id/status` | `changePoStatus` |
| POST | `/api/v1/procurement/purchase-orders/:id/submit` | `submitPo` |
| GET | `/api/v1/procurement/purchase-orders/paged` | `pagedPos` |
| GET | `/api/v1/procurement/purchase-requests` | `listPrs` |
| POST | `/api/v1/procurement/purchase-requests` | `createPr` |
| GET | `/api/v1/procurement/purchase-requests/:id` | `getPr` |
| PATCH | `/api/v1/procurement/purchase-requests/:id/status` | `changePrStatus` |
| GET | `/api/v1/procurement/purchase-requests/paged` | `pagedPrs` |
| GET | `/api/v1/procurement/rfqs` | `listRfqs` |
| POST | `/api/v1/procurement/rfqs` | `createRfq` |
| GET | `/api/v1/procurement/rfqs/:id` | `getRfq` |
| PATCH | `/api/v1/procurement/rfqs/:id/award` | `awardRfq` |
| POST | `/api/v1/procurement/rfqs/:id/quotes` | `addQuote` |
| PATCH | `/api/v1/procurement/rfqs/:id/send` | `sendRfq` |
| GET | `/api/v1/procurement/rfqs/paged` | `pagedRfqs` |
| GET | `/api/v1/procurement/suppliers` | `listSuppliers` |
| POST | `/api/v1/procurement/suppliers` | `createSupplier` |
| GET | `/api/v1/procurement/suppliers/:id` | `getSupplier` |
| PATCH | `/api/v1/procurement/suppliers/:id/status` | `changeSupplierStatus` |
| GET | `/api/v1/procurement/suppliers/paged` | `pagedSuppliers` |

## projects (41)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/projects/cashflow-forecasts` | `listCashflow` |
| POST | `/api/v1/projects/cashflow-forecasts` | `saveCashflow` |
| GET | `/api/v1/projects/cashflow-forecasts/summary/:projectId` | `cashflowSummary` |
| GET | `/api/v1/projects/cbs` | `listCbsNodes` |
| POST | `/api/v1/projects/cbs` | `createCbsNode` |
| PATCH | `/api/v1/projects/cbs/:id` | `updateCbsNode` |
| DELETE | `/api/v1/projects/cbs/:id` | `deleteCbsNode` |
| GET | `/api/v1/projects/cbs/summary/:projectId` | `getCbsSummary` |
| GET | `/api/v1/projects/closeouts` | `listCloseouts` |
| POST | `/api/v1/projects/closeouts` | `startCloseout` |
| POST | `/api/v1/projects/closeouts/:id/finalize` | `finalizeCloseout` |
| PATCH | `/api/v1/projects/closeouts/:id/items/:index` | `setCloseoutItem` |
| GET | `/api/v1/projects/closeouts/paged` | `pagedCloseouts` |
| GET | `/api/v1/projects/delays` | `listDelays` |
| POST | `/api/v1/projects/delays` | `createDelay` |
| PATCH | `/api/v1/projects/delays/:id/status` | `updateDelayStatus` |
| GET | `/api/v1/projects/delays/analysis/:projectId` | `getDelayAnalysis` |
| GET | `/api/v1/projects/eot-claims` | `listEotClaims` |
| POST | `/api/v1/projects/eot-claims` | `createEotClaim` |
| POST | `/api/v1/projects/eot-claims/:id/decide` | `decideEotClaim` |
| POST | `/api/v1/projects/eot-claims/:id/submit` | `submitEotClaim` |
| GET | `/api/v1/projects/projects` | `listProjects` |
| POST | `/api/v1/projects/projects` | `createProject` |
| GET | `/api/v1/projects/projects/:id` | `getProject` |
| PATCH | `/api/v1/projects/projects/:id` | `updateProject` |
| GET | `/api/v1/projects/projects/:id/evm` | `getProjectEvm` |
| GET | `/api/v1/projects/projects/paged` | `pagedProjects` |
| GET | `/api/v1/projects/schedules` | `listSchedules` |
| POST | `/api/v1/projects/schedules` | `saveSchedule` |
| POST | `/api/v1/projects/schedules/:projectId/baseline` | `setBaseline` |
| POST | `/api/v1/projects/schedules/plan` | `planSchedule` |
| GET | `/api/v1/projects/schedules/summary/:projectId` | `scheduleSummary` |
| GET | `/api/v1/projects/variations` | `listVariations` |
| POST | `/api/v1/projects/variations` | `createVariation` |
| PATCH | `/api/v1/projects/variations/:id/status` | `changeVariationStatus` |
| GET | `/api/v1/projects/variations/paged` | `pagedVariations` |
| GET | `/api/v1/projects/variations/summary/:projectId` | `variationSummary` |
| GET | `/api/v1/projects/wbs` | `listWbsNodes` |
| POST | `/api/v1/projects/wbs` | `createWbsNode` |
| GET | `/api/v1/projects/wbs/:id` | `getWbsNode` |
| PATCH | `/api/v1/projects/wbs/:id/progress` | `updateWbsProgress` |

## quality (33)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/quality/audits` | `listAudits` |
| POST | `/api/v1/quality/audits` | `scheduleAudit` |
| GET | `/api/v1/quality/audits/:id` | `getAudit` |
| PUT | `/api/v1/quality/audits/:id/checklist` | `updateAuditChecklist` |
| POST | `/api/v1/quality/audits/:id/checklist/:itemIndex/ncr` | `generateNcrFromFailedCheck` |
| GET | `/api/v1/quality/calibrations` | `listCalibrations` |
| POST | `/api/v1/quality/calibrations` | `recordCalibration` |
| GET | `/api/v1/quality/calibrations/:id` | `getCalibration` |
| GET | `/api/v1/quality/irs` | `listInspections` |
| POST | `/api/v1/quality/irs` | `requestInspection` |
| PUT | `/api/v1/quality/irs/:id/resolve` | `resolveInspection` |
| GET | `/api/v1/quality/irs/paged` | `pagedInspections` |
| GET | `/api/v1/quality/itps` | `listItps` |
| POST | `/api/v1/quality/itps` | `createItp` |
| PUT | `/api/v1/quality/itps/:id/activate` | `activateItp` |
| PUT | `/api/v1/quality/itps/:id/close` | `closeItp` |
| PUT | `/api/v1/quality/itps/:id/points/:index` | `recordItpPoint` |
| GET | `/api/v1/quality/itps/paged` | `pagedItps` |
| GET | `/api/v1/quality/material-approvals` | `listMars` |
| POST | `/api/v1/quality/material-approvals` | `createMar` |
| PUT | `/api/v1/quality/material-approvals/:id/review` | `reviewMar` |
| PUT | `/api/v1/quality/material-approvals/:id/revise` | `reviseMar` |
| PUT | `/api/v1/quality/material-approvals/:id/submit` | `submitMar` |
| GET | `/api/v1/quality/material-approvals/paged` | `pagedMars` |
| GET | `/api/v1/quality/ncrs` | `listNcrs` |
| POST | `/api/v1/quality/ncrs` | `raiseNcr` |
| PUT | `/api/v1/quality/ncrs/:id/status` | `updateNcrStatus` |
| GET | `/api/v1/quality/ncrs/paged` | `pagedNcrs` |
| GET | `/api/v1/quality/snags` | `listSnags` |
| POST | `/api/v1/quality/snags` | `logSnag` |
| PUT | `/api/v1/quality/snags/:id/close` | `closeSnag` |
| PUT | `/api/v1/quality/snags/:id/resolve` | `resolveSnag` |
| GET | `/api/v1/quality/snags/paged` | `pagedSnags` |

## search (1)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/search` | `run` |

## site (15)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/site/daily-reports` | `listDailyReports` |
| POST | `/api/v1/site/daily-reports` | `createDailyReport` |
| PUT | `/api/v1/site/daily-reports/:id/submit` | `submitDailyReport` |
| GET | `/api/v1/site/delay-logs` | `listDelayLogs` |
| POST | `/api/v1/site/delay-logs` | `createDelayLog` |
| PUT | `/api/v1/site/delay-logs/:id/resolve` | `resolveDelayLog` |
| GET | `/api/v1/site/instructions` | `listInstructions` |
| POST | `/api/v1/site/instructions` | `issueInstruction` |
| PUT | `/api/v1/site/instructions/:id/acknowledge` | `acknowledgeInstruction` |
| PUT | `/api/v1/site/instructions/:id/close` | `closeInstruction` |
| GET | `/api/v1/site/labour` | `listLabour` |
| POST | `/api/v1/site/labour` | `createLabour` |
| GET | `/api/v1/site/labour/by-trade/:projectId` | `labourByTrade` |
| GET | `/api/v1/site/material-consumption` | `listMaterialConsumption` |
| POST | `/api/v1/site/material-consumption` | `createMaterialConsumption` |

## subcontracts (20)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/subcontracts` | `listSubcontracts` |
| POST | `/api/v1/subcontracts` | `createSubcontract` |
| GET | `/api/v1/subcontracts/:id` | `getSubcontract` |
| PATCH | `/api/v1/subcontracts/:id/status` | `changeStatus` |
| GET | `/api/v1/subcontracts/back-charges` | `listBackCharges` |
| POST | `/api/v1/subcontracts/back-charges` | `createBackCharge` |
| GET | `/api/v1/subcontracts/back-charges/:id` | `getBackCharge` |
| PATCH | `/api/v1/subcontracts/back-charges/:id/recover` | `recoverBackCharge` |
| PATCH | `/api/v1/subcontracts/back-charges/:id/status` | `changeBackChargeStatus` |
| GET | `/api/v1/subcontracts/back-charges/summary` | `backChargeSummary` |
| GET | `/api/v1/subcontracts/claims` | `listClaims` |
| POST | `/api/v1/subcontracts/claims` | `createClaim` |
| GET | `/api/v1/subcontracts/claims/:id` | `getClaim` |
| PATCH | `/api/v1/subcontracts/claims/:id/certify` | `certifyClaim` |
| PATCH | `/api/v1/subcontracts/claims/:id/pay` | `payClaim` |
| GET | `/api/v1/subcontracts/paged` | `pagedSubcontracts` |
| GET | `/api/v1/subcontracts/variations` | `listVariations` |
| POST | `/api/v1/subcontracts/variations` | `createVariation` |
| PATCH | `/api/v1/subcontracts/variations/:id/approve` | `approveVariation` |
| PATCH | `/api/v1/subcontracts/variations/:id/reject` | `rejectVariation` |

## templates (5)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/templates` | `list` |
| POST | `/api/v1/templates` | `create` |
| GET | `/api/v1/templates/:id` | `get` |
| PUT | `/api/v1/templates/:id` | `update` |
| DELETE | `/api/v1/templates/:id` | `delete` |

## tendering (25)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/tendering/bid-scores` | `list` |
| POST | `/api/v1/tendering/bid-scores` | `create` |
| GET | `/api/v1/tendering/bid-scores/:id` | `get` |
| GET | `/api/v1/tendering/bid-scores/paged` | `paged` |
| GET | `/api/v1/tendering/estimates` | `list` |
| POST | `/api/v1/tendering/estimates` | `buildRate` |
| GET | `/api/v1/tendering/estimates/boq-item/:boqItemId` | `forBoqItem` |
| GET | `/api/v1/tendering/estimates/summary` | `summary` |
| GET | `/api/v1/tendering/outcomes` | `list` |
| POST | `/api/v1/tendering/outcomes` | `record` |
| GET | `/api/v1/tendering/outcomes/:id` | `get` |
| GET | `/api/v1/tendering/outcomes/analytics` | `analytics` |
| GET | `/api/v1/tendering/outcomes/paged` | `paged` |
| GET | `/api/v1/tendering/tenders` | `list` |
| POST | `/api/v1/tendering/tenders` | `create` |
| GET | `/api/v1/tendering/tenders/:id` | `get` |
| PATCH | `/api/v1/tendering/tenders/:id` | `update` |
| GET | `/api/v1/tendering/tenders/:id/boq` | `getBOQ` |
| POST | `/api/v1/tendering/tenders/:id/boq/import` | `importBOQ` |
| POST | `/api/v1/tendering/tenders/:id/boq/items` | `addBOQItem` |
| PUT | `/api/v1/tendering/tenders/:id/boq/items/:itemId` | `updateBOQItem` |
| DELETE | `/api/v1/tendering/tenders/:id/boq/items/:itemId` | `deleteBOQItem` |
| POST | `/api/v1/tendering/tenders/:id/boq/upload` | `UseInterceptors` |
| PATCH | `/api/v1/tendering/tenders/:id/status` | `changeStatus` |
| GET | `/api/v1/tendering/tenders/paged` | `paged` |

## views (3)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/views` | `list` |
| POST | `/api/v1/views` | `create` |
| DELETE | `/api/v1/views/:id` | `remove` |

## workflow (4)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/v1/workflows/:key/start` | `start` |
| GET | `/api/v1/workflows/instances` | `list` |
| GET | `/api/v1/workflows/instances/:id` | `get` |
| POST | `/api/v1/workflows/instances/:id/transition` | `transition` |
