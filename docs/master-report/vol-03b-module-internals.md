# Volume 3B — Module Internals Reference

[← Volume 3](vol-03-module-catalog.md) · [← Master index](README.md)

Generated from `modules/*/src` on 2026-07-05 (regenerate:
`node docs/master-report/tools/gen-internals.mjs <repo-root>`). For each module: **services**
(public methods = the module's use-cases), **store ports** (persistence contract), and
**domain exports** (pure functions ~types in tildes~). This is the engineering map — Volume 3
is the business view of the same modules.


## amc

### Services

| Service | Public methods |
|---|---|
| `AmcService` | `createContract` · `listContracts` · `findContract` · `listTickets` · `listTicketsPaged` · `findTicket` · `listWorkOrders` · `listWorkOrdersPaged` · `terminateContract` · `createWorkOrder` · `assignWorkOrder` · `completeWorkOrder` · `raiseTicket` · `assignTicket` · `resolveTicket` · `slaStatusReport` · `sweepSlaBreaches` · `createPpmSchedule` · `listPpmSchedules` · `deactivatePpmSchedule` · `generateDueVisits` · `getDispatchBoard` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/ppm-schedule.ts` | `FREQUENCY_MONTHS` · `addMonths` · *PpmFrequency* |
| `domain/service-contract.ts` | *ContractStatus* |
| `domain/support-ticket.ts` | *TicketPriority* · *TicketStatus* · *SlaStatus* |
| `domain/work-order.ts` | *WorkOrderPriority* · *WorkOrderType* · *WorkOrderStatus* · *GeoCoordinate* |

## assets

### Services

| Service | Public methods |
|---|---|
| `AssetsService` | `createAsset` · `deleteAsset` · `restoreAsset` · `getAsset` · `listAssets` · `listAssetsPaged` · `getAssetQrTag` · `getAssetQrTags` · `disposeAsset` · `listDisposals` · `depreciation` · `scheduleMaintenance` · `completeMaintenance` · `listMaintenance` · `recordInspection` · `listInspections` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/asset-disposal.ts` | `makeAssetDisposal` · `ASSET_DISPOSAL_EVENT` · *DisposalMethod* · *AssetDisposal* · *NewAssetDisposal* |
| `domain/asset-inspection.ts` | `makeAssetInspection` · *AssetInspection* |
| `domain/asset-maintenance.ts` | `makeAssetMaintenance` · *AssetMaintenance* |
| `domain/asset-tag.ts` | `makeAssetTag` · *AssetTag* |
| `domain/asset.ts` | `makeAsset` · *Asset* |
| `domain/depreciation.ts` | `monthsBetween` · `computeDepreciation` · *DepreciationMethod* · *DepreciationPeriod* · *DepreciationSchedule* · *DepreciationInput* |

## contracts

### Services

| Service | Public methods |
|---|---|
| `ClauseService` | `create` · `revise` · `list` · `listPaged` |
| `ContractService` | `onModuleInit` · `create` · `update` · `changeStatus` · `list` · `listPaged` |
| `ObligationService` | `create` · `changeStatus` · `list` · `listPaged` · `dueSoon` |
| `PaymentCertificateService` | `create` · `changeStatus` · `list` · `listPaged` · `getContractSummary` |

### Store ports

| Port | Methods |
|---|---|
| `ClauseStore` | `save` · `get` · `list` · `listPaged` |
| `ContractStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |
| `ObligationStore` | `save` · `get` · `list` · `listPaged` |
| `PaymentCertificateStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/contract-clause.ts` | `makeContractClause` · `reviseClause` · `CLAUSE_EVENT` · *ClauseCategory* · *ContractClause* · *NewContractClause* |
| `domain/contract-obligation.ts` | `makeContractObligation` · `setObligationStatus` · `isOverdue` · `OBLIGATION_EVENT` · *ObligationType* · *ObligationStatus* · *ObligationParty* · *ContractObligation* · *NewContractObligation* |
| `domain/contract.ts` | `makeContract` · `CONTRACT_EVENT` · *ContractStatus* · *Contract* · *NewContract* |
| `domain/payment-certificate.ts` | `computeCertificate` · `makePaymentCertificate` · `certificateSummary` · `priorCertifiedNet` · `CERTIFICATE_EVENT` · *CertificateStatus* · *PaymentCertificate* · *CertificateInputs* · *CertificateMath* · *NewPaymentCertificate* · *CertificateSummary* |

## crm

### Services

| Service | Public methods |
|---|---|
| `AccountService` | `onModuleInit` · `create` · `update` · `list` · `listPaged` |
| `ActivityService` | `create` · `complete` · `list` · `listPaged` |
| `ContactService` | `create` · `list` · `listPaged` |
| `LeadService` | `create` · `update` · `list` · `listPaged` |
| `OpportunityService` | `create` · `update` · `forecastWinProbability` · `list` · `listPaged` |
| `QuotationService` | `create` · `changeStatus` · `list` · `listPaged` |

### Store ports

| Port | Methods |
|---|---|
| `AccountStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |
| `ActivityStore` | `save` · `get` · `list` · `listPaged` |
| `ContactStore` | `save` · `get` · `list` · `listPaged` |
| `LeadStore` | `create` · `createWithClient` · `update` · `get` · `list` · `listPaged` |
| `OpportunityStore` | `create` · `createWithClient` · `update` · `get` · `list` · `listPaged` |
| `QuotationStore` | `save` · `get` · `list` · `listPaged` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/account.ts` | `makeAccount` · `CRM_EVENT` · *AccountStatus* · *Account* · *NewAccount* |
| `domain/activity.ts` | `makeActivity` · `completeActivity` · `CRM_ACTIVITY_EVENT` · *ActivityType* · *ActivityStatus* · *ActivityRelatedType* · *Activity* · *NewActivity* |
| `domain/contact.ts` | `makeContact` · `CRM_CONTACT_EVENT` · *ContactStatus* · *Contact* · *NewContact* |
| `domain/quotation.ts` | `buildQuotationLine` · `computeQuotationTotals` · `makeQuotation` · `sendQuotation` · `acceptQuotation` · `rejectQuotation` · `expireQuotation` · `QUOTATION_EVENT` · *QuotationStatus* · *QuotationLine* · *NewQuotationLine* · *Quotation* · *NewQuotation* · *QuotationTotals* |

## doccontrol

### Services

| Service | Public methods |
|---|---|
| `DocControlService` | `createTransmittal` · `acknowledgeTransmittal` · `listTransmittals` · `addTransmittalItems` · `listTransmittalItems` · `registerEntryHistory` · `createCorrespondence` · `closeCorrespondence` · `listCorrespondence` · `createSubmittal` · `submitSubmittal` · `returnSubmittal` · `listSubmittals` · `createRegisterEntry` · `reviseRegisterEntry` · `listRegister` · `listRegisterByProject` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/correspondence.ts` | `makeCorrespondence` · *Correspondence* · *NewCorrespondence* |
| `domain/drawing-register.ts` | `makeDrawingRegisterEntry` · `reviseRegisterEntry` · *RegisterDocType* · *RegisterStatus* · *RegisterDiscipline* · *DrawingRegisterEntry* · *NewDrawingRegisterEntry* |
| `domain/submittal.ts` | `makeSubmittal` · `submitForReview` · `returnWithCode` · `requiresResubmission` · `reviseSubmittal` · `SUBMITTAL_EVENT` · *SubmittalStatus* · *ReviewCode* · *SubmittalDiscipline* · *Submittal* · *NewSubmittal* |
| `domain/transmittal-item.ts` | `TRANSMITTAL_PURPOSES` · `makeTransmittalItem` · *TransmittalPurpose* · *TransmittalItem* · *NewTransmittalItem* · *RevisionHistoryRow* |
| `domain/transmittal.ts` | `makeTransmittal` · *Transmittal* · *NewTransmittal* |

## engineering

### Services

| Service | Public methods |
|---|---|
| `EngineeringService` | `createDrawing` · `reviseDrawing` · `approveDrawing` · `getDrawing` · `listDrawings` · `listDrawingsPaged` · `createRfi` · `answerRfi` · `getRfi` · `listRfis` · `listRfisPaged` · `createSubmittal` · `updateSubmittalStatus` · `getSubmittal` · `listSubmittals` · `listSubmittalsPaged` · `createTechnicalQuery` · `respondTechnicalQuery` · `getTechnicalQuery` · `listTechnicalQueries` · `listTechnicalQueriesPaged` · `registerBimModel` · `newBimModelVersion` · `getBimModel` · `listBimModels` · `listBimModelsPaged` |

### Store ports

| Port | Methods |
|---|---|
| `BimModelStore` | `save` · `get` · `list` · `listPaged` |
| `DrawingStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `getByCode` · `getLatestByCode` · `list` · `listPaged` |
| `RfiStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `getByCode` · `list` · `listPaged` |
| `SubmittalStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `getByCode` · `list` · `listPaged` |
| `TechnicalQueryStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/bim-model.ts` | `makeBimModel` · `bumpModelVersion` · `BIM_MODEL_EVENT` · *ModelFormat* · *ModelStatus* · *ModelDiscipline* · *BimModel* · *NewBimModel* |
| `domain/drawing.ts` | `makeDrawing` · `ENGINEERING_EVENT` · *DrawingStatus* · *Drawing* · *NewDrawing* |
| `domain/rfi.ts` | `makeRfi` · *RfiStatus* · *Rfi* · *NewRfi* |
| `domain/submittal.ts` | `makeSubmittal` · *SubmittalType* · *SubmittalStatus* · *Submittal* · *NewSubmittal* |
| `domain/technical-query.ts` | `makeTechnicalQuery` · `respondToQuery` · *TqStatus* · *TqPriority* · *TqDiscipline* · *TechnicalQuery* · *NewTechnicalQuery* |

## finance

### Services

| Service | Public methods |
|---|---|
| `AccountService` | `create` · `getByCode` · `list` |
| `BankGuaranteeService` | `create` · `changeStatus` · `list` · `listPaged` · `expiringSoon` |
| `BankReconciliationService` | `importStatement` · `listTransactions` · `listTransactionsPaged` · `autoMatch` · `reconcileManually` · `unreconcile` |
| `BudgetService` | `create` · `list` · `listPaged` · `remove` · `restore` · `vsActual` |
| `CostCenterService` | `create` · `list` · `report` |
| `CustomerInvoiceService` | `postFxRevaluation` · `create` · `issue` · `recordReceipt` · `cancel` · `list` · `softDelete` · `restore` · `listPaged` · `fxRevaluation` · `aging` |
| `InvoiceService` | `onModuleInit` · `create` · `checkThreeWayMatch` · `update` · `changeStatus` · `list` · `listPaged` · `aging` · `fxRevaluation` · `postFxRevaluation` |
| `JournalService` | `post` · `list` · `listPaged` |
| `PaymentService` | `onModuleInit` · `record` · `list` · `listPaged` |
| `PeriodCloseService` | `close` · `reopen` · `isClosed` · `list` |
| `PettyCashService` | `createFund` · `recordTransaction` · `getFund` · `getFundWithTransactions` · `listFunds` · `listFundsPaged` |
| `PostDatedChequeService` | `create` · `changeStatus` · `list` · `listPaged` · `maturingSoon` · `summary` |
| `ProfitCenterService` | `create` · `list` · `report` |
| `StatementsService` | `trialBalance` · `incomeStatement` · `balanceSheet` · `cashFlow` · `consolidated` |
| `TaxService` | `createTaxCode` · `updateTaxCode` · `getTaxCode` · `listTaxCodes` · `applyTax` · `autoApplyToInvoice` · `getInvoiceTaxLines` · `removeInvoiceTaxLines` · `getTaxSummary` · `previewReturn` · `generateReturn` · `setReturnStatus` · `getReturn` · `listReturns` |

### Store ports

| Port | Methods |
|---|---|
| `AccountStore` | `create` · `get` · `getByCode` · `list` |
| `BankGuaranteeStore` | `save` · `get` · `list` · `listPaged` |
| `BankTransactionStore` | `create` · `update` · `get` · `list` · `listPaged` |
| `BudgetStore` | `save` · `get` · `list` · `listPaged` · `setDeleted` |
| `CostCenterStore` | `save` · `get` · `list` |
| `CustomerInvoiceStore` | `save` · `get` · `list` · `listPaged` · `setDeleted` |
| `InvoiceStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |
| `JournalStore` | `create` · `get` · `list` · `listPaged` |
| `PaymentStore` | `create` · `get` · `list` · `listPaged` |
| `PeriodCloseStore` | `save` · `findByPeriod` · `list` · `remove` |
| `PettyCashStore` | `createFund` · `updateFund` · `getFund` · `listFunds` · `listFundsPaged` · `addTransaction` · `listTransactions` |
| `PostDatedChequeStore` | `save` · `get` · `list` · `listPaged` |
| `ProfitCenterStore` | `save` · `get` · `list` |
| `TaxCodeStore` | `create` · `update` · `get` · `getByCode` · `list` |
| `TaxLineStore` | `create` · `list` · `deleteByInvoice` |
| `TaxReturnStore` | `create` · `update` · `get` · `list` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/account.ts` | `makeAccount` · *AccountType* · *Account* · *NewAccount* |
| `domain/ap-aging.ts` | `buildApAging` · *SupplierAging* · *ApAgingReport* |
| `domain/ar-aging.ts` | `AGING_BUCKETS` · `bucketFor` · `buildArAging` · *AgingBucketKey* · *BucketTotals* · *CustomerAging* · *ArAgingReport* |
| `domain/bank-guarantee.ts` | `makeBankGuarantee` · `releaseGuarantee` · `claimGuarantee` · `expireGuarantee` · `daysToExpiry` · `isExpiringSoon` · `BANK_GUARANTEE_EVENT` · *GuaranteeType* · *GuaranteeStatus* · *BankGuarantee* · *NewBankGuarantee* |
| `domain/bank-transaction.ts` | `makeBankTransaction` · *BankTransactionStatus* · *BankTransaction* · *NewBankTransaction* |
| `domain/budget.ts` | `makeBudget` · `buildBudgetVsActual` · *BudgetLine* · *Budget* · *NewBudgetLine* · *NewBudget* · *BudgetVsActualRow* · *BudgetVsActual* |
| `domain/cost-center.ts` | `makeCostCenter` · `buildCostCenterReport` · `COST_CENTER_EVENT` · *CostCenter* · *NewCostCenter* · *CostCenterActual* · *CostCenterReport* |
| `domain/customer-invoice.ts` | `buildLine` · `computeTotals` · `makeCustomerInvoice` · `issueInvoice` · `recordReceipt` · `cancelInvoice` · `balanceOf` · `CUSTOMER_INVOICE_EVENT` · *CustomerInvoiceStatus* · *CustomerInvoiceLine* · *NewCustomerInvoiceLine* · *CustomerInvoice* · *NewCustomerInvoice* · *InvoiceTotals* |
| `domain/fx-revaluation.ts` | `computeFxRevaluation` · *RevalInvoice* · *RevalLine* · *FxRevaluation* |
| `domain/invoice.ts` | `makeInvoice` · `FINANCE_EVENT` · *InvoiceStatus* · *Invoice* · *NewInvoice* |
| `domain/journal.ts` | `makeJournal` · `buildEliminations` · `eliminationTotal` · *JournalLine* · *Journal* · *NewJournalLine* · *NewJournal* |
| `domain/payment.ts` | `makePayment` · *Payment* · *NewPayment* |
| `domain/period-close.ts` | `periodOf` · `isValidPeriod` · `makePeriodClose` · `PERIOD_CLOSE_EVENT` · *PeriodClose* · *NewPeriodClose* |
| `domain/petty-cash.ts` | `makePettyCashFund` · `applyPettyCashTx` · `makePettyCashTransaction` · `PETTY_CASH_EVENT` · *PettyCashStatus* · *PettyCashFund* · *NewPettyCashFund* · *PettyCashTxType* · *PettyCashCategory* · *PettyCashTransaction* · *NewPettyCashTransaction* |
| `domain/post-dated-cheque.ts` | `makePostDatedCheque` · `depositCheque` · `clearCheque` · `bounceCheque` · `representCheque` · `cancelCheque` · `applyChequeAction` · `daysToMaturity` · `isOpen` · `isMaturingSoon` · `summariseCheques` · `POST_DATED_CHEQUE_EVENT` · *ChequeDirection* · *ChequeStatus* · *PostDatedCheque* · *NewPostDatedCheque* · *ChequeAction* · *ChequeSummary* |
| `domain/profit-center.ts` | `makeProfitCenter` · `buildProfitCenterReport` · `PROFIT_CENTER_EVENT` · *ProfitCenter* · *NewProfitCenter* · *ProfitCenterActual* · *ProfitCenterReport* |
| `domain/revenue-recognition.ts` | `recognizeRevenue` · *RevenueRecognitionInput* · *RevenueRecognition* |
| `domain/statements.ts` | `accountBalances` · `isCashAccount` · `buildTrialBalance` · `buildIncomeStatement` · `buildBalanceSheet` · `buildCashFlow` · *StatementLine* · *TrialBalanceRow* · *TrialBalance* · *IncomeStatement* · *BalanceSheet* · *CashFlow* |
| `domain/tax.ts` | `makeTaxCode` · `makeTaxLine` · `calculateTaxSummary` · `calculateTaxReturn` · `makeTaxReturn` · *TaxType* · *TaxReturnStatus* · *TaxCode* · *NewTaxCode* · *TaxLine* · *NewTaxLine* · *TaxReturn* · *TaxSummary* · *NewTaxReturn* |

## fleet

### Services

| Service | Public methods |
|---|---|
| `FleetService` | `createVehicle` · `deleteVehicle` · `restoreVehicle` · `getVehicle` · `listVehicles` · `listVehiclesPaged` · `logFuel` · `listFuelLogs` · `scheduleMaintenance` · `completeMaintenance` · `listMaintenance` · `recordFine` · `assignFineToDriver` · `disputeFine` · `payFine` · `listFines` · `recordSalik` · `allocateSalik` · `disputeSalik` · `listSalik` · `salikSummary` · `recordTelemetry` · `getTelemetryForVehicle` · `checkRegistrationsAndTriggerRenewals` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/fuel-log.ts` | `makeFuelLog` · *FuelLog* · *NewFuelLog* |
| `domain/maintenance.ts` | `makeMaintenanceRecord` · *MaintenanceRecord* · *NewMaintenanceRecord* |
| `domain/salik-charge.ts` | `makeSalikCharge` · `allocateSalik` · `disputeSalik` · `summariseSalik` · `SALIK_EVENT` · *SalikStatus* · *SalikCharge* · *NewSalikCharge* · *SalikSummary* |
| `domain/telemetry.ts` | `makeVehicleTelemetry` · `FLEET_TELEMETRY_EVENT` · *VehicleTelemetry* · *NewVehicleTelemetry* |
| `domain/traffic-fine.ts` | `makeTrafficFine` · `assignFine` · `disputeFine` · `payFine` · *FineStatus* · *TrafficFine* · *NewTrafficFine* |
| `domain/vehicle.ts` | `makeVehicle` · *Vehicle* · *NewVehicle* |

## hr

### Services

| Service | Public methods |
|---|---|
| `HrService` | `createEmployee` · `deleteEmployee` · `restoreEmployee` · `getEmployee` · `listEmployees` · `requestLeave` · `resolveLeave` · `listLeaves` · `leaveBalance` · `runPayroll` · `markPayrollPaid` · `listPayrollRuns` · `getPayrollRun` · `createTimesheetEntry` · `submitTimesheetEntry` · `approveTimesheetEntry` · `rejectTimesheetEntry` · `listTimesheets` · `listTimesheetsByEmployee` · `generateWps` · `recordAttendance` · `checkOutAttendance` · `listAttendance` · `attendanceSummary` · `createExpenseClaim` · `submitExpenseClaim` · `approveExpenseClaim` · `rejectExpenseClaim` · `reimburseExpenseClaim` · `listExpenseClaims` · `createStaffAdvance` · `approveStaffAdvance` · `rejectStaffAdvance` · `disburseStaffAdvance` · `repayStaffAdvance` · `listStaffAdvances` · `documentExpiry` · `createAppraisal` · `submitAppraisal` · `acknowledgeAppraisal` · `listAppraisals` · `orgChart` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/appraisal.ts` | `computeOverallScore` · `makePerformanceAppraisal` · `submitAppraisal` · `acknowledgeAppraisal` · `buildOrgChart` · *AppraisalStatus* · *AppraisalCriterion* · *PerformanceAppraisal* · *NewPerformanceAppraisal* · *OrgChartNode* |
| `domain/attendance.ts` | `computeWorkedHours` · `makeAttendanceRecord` · `checkOutAttendance` · `summariseAttendance` · `ATTENDANCE_EVENT` · *AttendanceStatus* · *AttendanceRecord* · *NewAttendanceRecord* · *AttendanceSummary* |
| `domain/document-expiry.ts` | `daysUntil` · `buildDocumentExpiryReport` · *DocumentType* · *ExpiryStatus* · *ExpiringDocument* · *DocumentExpiryReport* |
| `domain/employee.ts` | `makeEmployee` · *Employee* · *NewEmployee* |
| `domain/eosb.ts` | `calculateEosb` · *TerminationType* · *EosbInput* · *EosbResult* |
| `domain/expense-claim.ts` | `makeExpenseClaim` · `submitClaim` · `approveClaim` · `rejectClaim` · `reimburseClaim` · *ExpenseClaimStatus* · *ExpenseCategory* · *ExpenseClaim* · *NewExpenseClaim* |
| `domain/leave-balance.ts` | `leaveDays` · `computeLeaveBalance` · *LeaveInput* · *LeaveBalance* |
| `domain/leave.ts` | `makeLeave` · *Leave* · *NewLeave* |
| `domain/payroll-run.ts` | `makePayrollRun` · *PayrollRun* · *NewPayrollRun* |
| `domain/staff-advance.ts` | `makeStaffAdvance` · `approveAdvance` · `rejectAdvance` · `disburseAdvance` · `recordRepayment` · `balanceOf` · `installmentAmount` · `STAFF_ADVANCE_EVENT` · *StaffAdvanceStatus* · *StaffAdvance* · *NewStaffAdvance* |
| `domain/timesheet.ts` | `makeTimesheetEntry` · `submitTimesheet` · `approveTimesheet` · `rejectTimesheet` · `summarizeWeek` · *TimesheetStatus* · *TimesheetEntry* · *NewTimesheetEntry* · *WeeklySummary* |
| `domain/wps.ts` | `validateWpsLine` · `generateSif` · *WpsEmployer* · *WpsEmployeeLine* · *SifResult* |

## hse

### Services

| Service | Public methods |
|---|---|
| `HseService` | `reportIncident` · `closeIncident` · `listIncidents` · `listIncidentsPaged` · `requestPermit` · `approvePermit` · `listPermits` · `listPermitsPaged` · `recordToolboxTalk` · `listToolboxTalks` · `raiseCapa` · `completeCapa` · `listCapas` · `createRiskAssessment` · `approveRiskAssessment` · `getRiskAssessment` · `listRiskAssessments` · `recordSafetyTraining` · `listSafetyTraining` · `getSafetyTrainingForWorker` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/capa-action.ts` | `makeCapaAction` · *CapaAction* · *NewCapaAction* |
| `domain/hse-incident.ts` | `makeHseIncident` · *HseIncident* · *NewHseIncident* |
| `domain/permit-to-work.ts` | `makePermitToWork` · *PermitToWork* · *NewPermitToWork* |
| `domain/risk-assessment.ts` | `riskBand` · `makeRiskAssessment` · `approveRiskAssessment` · *RiskBand* · *RiskAssessmentStatus* · *RiskLine* · *RiskAssessment* · *NewRiskAssessment* |
| `domain/safety-training.ts` | `makeSafetyTrainingRecord` · `SAFETY_TRAINING_EVENT` · *SafetyTrainingRecord* · *NewSafetyTrainingRecord* |
| `domain/toolbox-talk.ts` | `makeToolboxTalk` · `TOOLBOX_TALK_EVENT` · *ToolboxTalk* · *NewToolboxTalk* |

## inventory

### Services

| Service | Public methods |
|---|---|
| `GoodsReceiptService` | `onModuleInit` · `create` · `list` · `listPaged` |
| `StockService` | `createItem` · `recordMovement` · `getItem` · `getItemByBarcode` · `setItemUom` · `getItemWithMovements` · `listItems` · `listItemsPaged` · `fifoValuation` · `valuation` · `setReorderPolicy` · `reorderReport` |
| `TransferService` | `execute` · `list` · `listPaged` |

### Store ports

| Port | Methods |
|---|---|
| `GoodsReceiptStore` | `create` · `createWithClient` · `get` · `list` · `listPaged` |
| `StockStore` | `createItem` · `updateItem` · `getItem` · `getItemByCode` · `getItemByBarcode` · `listItems` · `listItemsPaged` · `addMovement` · `listMovements` |
| `TransferStore` | `save` · `get` · `list` · `listPaged` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/fifo.ts` | `fifoIssueCost` · `fifoReceiptState` · `computeFifo` · *FifoLayer* · *FifoMove* · *FifoValuation* · *FifoIssue* |
| `domain/goods-receipt.ts` | `makeGoodsReceipt` · `INVENTORY_EVENT` · *GoodsReceiptStatus* · *GoodsReceipt* · *NewGoodsReceipt* |
| `domain/stock-transfer.ts` | `makeStockTransfer` · `TRANSFER_EVENT` · *TransferStatus* · *StockTransfer* · *NewStockTransfer* |
| `domain/stock.ts` | `normaliseAltUnits` · `makeStockItem` · `uomFactor` · `toBaseQty` · `applyMovement` · `computeWac` · `makeStockMovement` · `summariseValuation` · `isBelowReorder` · `suggestedReorderQty` · `summariseReorder` · `STOCK_EVENT` · *UomConversion* · *StockItem* · *NewStockItem* · *CostingMethod* · *StockDirection* · *StockMovement* · *NewStockMovement* · *ValuationLine* · *ValuationSummary* · *ReorderLine* · *ReorderReport* |

## procurement

### Services

| Service | Public methods |
|---|---|
| `FrameworkAgreementService` | `create` · `activate` · `terminate` · `callOff` · `list` · `listPaged` |
| `PurchaseOrderService` | `checkMaterialApprovalGate` · `onModuleInit` · `create` · `submitForApproval` · `approve` · `update` · `changeStatus` · `list` · `listPaged` |
| `PurchaseRequestService` | `create` · `changeStatus` · `list` · `listPaged` |
| `RfqService` | `create` · `send` · `addQuote` · `award` · `getWithQuotes` · `list` · `listPaged` |
| `SupplierService` | `create` · `changeStatus` · `list` · `listPaged` |

### Store ports

| Port | Methods |
|---|---|
| `FrameworkAgreementStore` | `save` · `get` · `list` · `listPaged` |
| `PurchaseOrderStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |
| `PurchaseRequestStore` | `create` · `update` · `get` · `list` · `listPaged` |
| `RfqStore` | `create` · `update` · `get` · `list` · `listPaged` · `addQuote` · `updateQuote` · `getQuote` · `listQuotes` |
| `SupplierStore` | `create` · `update` · `get` · `getByCode` · `list` · `listPaged` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/approval-matrix.ts` | `DEFAULT_PO_APPROVAL_TIERS` · `requiredApproval` · *ApprovalTier* · *RequiredApproval* |
| `domain/framework-agreement.ts` | `makeFrameworkAgreement` · `activateAgreement` · `terminateAgreement` · `remainingValue` · `isWithinValidity` · `recordCallOff` · `FRAMEWORK_EVENT` · *FrameworkAgreementStatus* · *FrameworkRateItem* · *FrameworkAgreement* · *NewFrameworkAgreement* |
| `domain/purchase-order.ts` | `makePurchaseOrder` · `PROCUREMENT_EVENT` · *PurchaseOrderStatus* · *PurchaseOrder* · *NewPurchaseOrder* |
| `domain/purchase-request.ts` | `makePurchaseRequest` · `PR_EVENT` · *PurchaseRequestStatus* · *PurchaseRequest* · *NewPurchaseRequest* |
| `domain/rfq.ts` | `makeRfq` · `makeRfqQuote` · `lowestQuote` · `RFQ_EVENT` · *RfqStatus* · *Rfq* · *NewRfq* · *RfqQuoteStatus* · *RfqQuote* · *NewRfqQuote* |
| `domain/supplier.ts` | `makeSupplier` · `approveSupplier` · `suspendSupplier` · `isApproved` · `SUPPLIER_EVENT` · *SupplierStatus* · *SupplierCategory* · *Supplier* · *NewSupplier* |

## projects

### Services

| Service | Public methods |
|---|---|
| `CashflowForecastService` | `save` · `summary` · `list` |
| `CbsService` | `create` · `update` · `recordCommittedCost` · `recordActualCost` · `list` · `getSummary` · `delete` · `syncFromBoq` |
| `CloseoutService` | `start` · `setItem` · `finalize` · `list` · `listPaged` |
| `DelayEotService` | `createDelay` · `updateDelayStatus` · `listDelays` · `getDelay` · `createEotClaim` · `submitEotClaim` · `decideEotClaim` · `listEotClaims` · `getEotClaim` · `getDelayAnalysis` |
| `ProjectService` | `onModuleInit` · `create` · `update` · `list` · `listPaged` |
| `ScheduleService` | `save` · `setBaseline` · `summary` · `list` · `plan` |
| `VariationService` | `create` · `changeStatus` · `list` · `listPaged` · `getProjectSummary` |
| `WbsService` | `checkItpReleaseGate` · `create` · `updateProgress` · `recordActualSpend` · `list` · `getEvmMetrics` |

### Store ports

| Port | Methods |
|---|---|
| `CashflowForecastStore` | `create` · `update` · `get` · `getByProject` · `list` |
| `CbsStore` | `create` · `update` · `get` · `list` · `delete` |
| `CloseoutStore` | `create` · `update` · `get` · `getByProject` · `list` · `listPaged` |
| `DelayStore` | `create` · `update` · `get` · `list` |
| `EotStore` | `create` · `update` · `get` · `list` |
| `ProjectStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |
| `ScheduleStore` | `create` · `update` · `get` · `getByProject` · `list` |
| `VariationStore` | `create` · `update` · `get` · `list` · `listPaged` |
| `WbsStore` | `create` · `update` · `get` · `list` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/cashflow-forecast.ts` | `buildPeriod` · `makeCashflowForecast` · `setForecastPeriods` · `summariseCashflow` · `CASHFLOW_EVENT` · *CashflowPeriod* · *ProjectCashflowForecast* · *NewCashflowForecast* · *NewCashflowPeriod* · *CashflowProjectionRow* · *CashflowSummary* |
| `domain/cbs.ts` | `makeCbsNode` · `calculateCbsSummary` · *CbsCategory* · *CbsNode* · *NewCbsNode* · *CbsSummary* |
| `domain/closeout.ts` | `DEFAULT_CLOSEOUT_ITEMS` · `makeProjectCloseout` · `setCloseoutItem` · `allCloseoutItemsDone` · `finalizeCloseout` · `CLOSEOUT_EVENT` · *CloseoutStatus* · *CloseoutItem* · *ProjectCloseout* · *NewProjectCloseout* |
| `domain/delay-eot.ts` | `makeDelayEvent` · `makeEotClaim` · `calculateDelayAnalysis` · *DelayCause* · *DelayStatus* · *EotStatus* · *DelayEvent* · *NewDelayEvent* · *EotClaim* · *NewEotClaim* · *DelayAnalysisSummary* |
| `domain/project.ts` | `makeProject` · `PROJECT_EVENT` · *ProjectStatus* · *Project* · *NewProject* |
| `domain/schedule-planning.ts` | `reschedule` · `planSchedule` · *PlanTaskInput* · *PlannedTask* · *SchedulePlan* |
| `domain/schedule.ts` | `buildTask` · `makeProjectSchedule` · `setScheduleTasks` · `setBaseline` · `summariseSchedule` · `SCHEDULE_EVENT` · *ScheduleTask* · *ProjectSchedule* · *NewScheduleTask* · *NewProjectSchedule* · *ScheduleSummary* |
| `domain/variation.ts` | `makeVariationOrder` · `variationImpact` · `VARIATION_EVENT` · *VariationType* · *VariationStatus* · *VariationOrder* · *NewVariationOrder* · *VariationImpact* |
| `domain/wbs.ts` | `makeWbsNode` · `calculateEvm` · *WbsNodeStatus* · *WbsNode* · *NewWbsNode* · *EvmMetrics* |

## quality

### Services

| Service | Public methods |
|---|---|
| `QualityService` | `raiseNcr` · `updateNcrStatus` · `listNcrs` · `listNcrsPaged` · `requestInspection` · `resolveInspection` · `listInspections` · `listInspectionsPaged` · `logSnag` · `resolveSnag` · `listSnags` · `listSnagsPaged` · `createItp` · `activateItp` · `recordItpPoint` · `closeItp` · `listItps` · `listItpsPaged` · `createMaterialApproval` · `submitMaterialApproval` · `reviewMaterialApproval` · `reviseMaterialApproval` · `listMaterialApprovals` · `listMaterialApprovalsPaged` · `checkMaterialApprovalGate` · `checkItpReleaseGate` · `recordCalibration` · `getCalibration` · `listCalibrations` · `scheduleAudit` · `getAudit` · `listAudits` · `updateAuditChecklist` · `generateNcrFromFailedCheck` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/audit-schedule.ts` | `makeAuditSchedule` · `QUALITY_AUDIT_EVENT` · *ChecklistItem* · *AuditSchedule* · *NewAuditSchedule* |
| `domain/calibration.ts` | `calibrationStatus` · `makeCalibration` · *CalibrationStatus* · *Calibration* · *NewCalibration* |
| `domain/inspection-request.ts` | `makeInspectionRequest` · *InspectionRequest* · *NewInspectionRequest* |
| `domain/itp.ts` | `buildPoint` · `makeItp` · `activateItp` · `recordPointResult` · `allPointsResolved` · `closeItp` · `ITP_EVENT` · *ItpStatus* · *InspectionPointType* · *PointResult* · *ItpPoint* · *NewItpPoint* · *Itp* · *NewItp* |
| `domain/material-approval.ts` | `makeMaterialApproval` · `submitMaterialApproval` · `reviewMaterialApproval` · `reviseMaterialApproval` · `MAR_EVENT` · *MarStatus* · *MarDecision* · *MaterialApproval* · *NewMaterialApproval* |
| `domain/ncr.ts` | `makeNcr` · *Ncr* · *NewNcr* |
| `domain/snag.ts` | `makeSnag` · *Snag* · *NewSnag* |

## site

### Services

| Service | Public methods |
|---|---|
| `SiteService` | `createDailyReport` · `submitDailyReport` · `listDailyReports` · `listDailyReportsPaged` · `createDelayLog` · `resolveDelayLog` · `listDelayLogs` · `issueSiteInstruction` · `acknowledgeSiteInstruction` · `closeSiteInstruction` · `listSiteInstructions` · `createMaterialConsumption` · `listMaterialConsumption` · `createLabourAllocation` · `listLabourAllocations` · `labourByTrade` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/daily-report.ts` | `makeDailyReport` · *DailyReport* · *NewDailyReport* |
| `domain/delay-log.ts` | `makeDelayLog` · *DelayLog* · *NewDelayLog* |
| `domain/labour-allocation.ts` | `makeLabourAllocation` · `summariseByTrade` · *LabourAllocation* · *NewLabourAllocation* · *TradeManHours* |
| `domain/material-consumption.ts` | `makeMaterialConsumption` · *MaterialConsumption* · *NewMaterialConsumption* |
| `domain/site-instruction.ts` | `makeSiteInstruction` · `acknowledgeInstruction` · `closeInstruction` · `SITE_INSTRUCTION_EVENT` · *SiteInstructionStatus* · *SiteInstruction* · *NewSiteInstruction* |

## subcontracts

### Services

| Service | Public methods |
|---|---|
| `SubcontractsService` | `createSubcontract` · `changeSubcontractStatus` · `getSubcontract` · `listSubcontracts` · `listSubcontractsPaged` · `createClaim` · `certifyClaim` · `payClaim` · `getClaim` · `listClaims` · `createVariation` · `approveVariation` · `rejectVariation` · `listVariations` · `createBackCharge` · `changeBackChargeStatus` · `recoverBackCharge` · `getBackCharge` · `listBackCharges` |

### Store ports

| Port | Methods |
|---|---|
| `SubcontractStore` | `createSubcontract` · `updateSubcontract` · `getSubcontract` · `listSubcontracts` · `listSubcontractsPaged` · `createClaim` · `updateClaim` · `getClaim` · `listClaims` · `createVariation` · `updateVariation` · `getVariation` · `listVariations` · `createBackCharge` · `updateBackCharge` · `getBackCharge` · `listBackCharges` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/back-charge.ts` | `makeBackCharge` · `applyRecovery` · `summariseBackCharges` · `BACK_CHARGE_EVENT` · *BackChargeStatus* · *BackChargeCategory* · *BackCharge* · *NewBackCharge* · *BackChargeSummary* |
| `domain/claim.ts` | `makeClaim` · `CLAIM_EVENT` · *ClaimStatus* · *Claim* · *NewClaim* |
| `domain/subcontract.ts` | `makeSubcontract` · `SUBCONTRACT_EVENT` · *SubcontractStatus* · *Subcontract* · *NewSubcontract* |
| `domain/variation.ts` | `makeSubcontractVariation` · `signedAmount` · `approveVariation` · `rejectVariation` · `VARIATION_EVENT` · *VariationType* · *VariationStatus* · *SubcontractVariation* · *NewSubcontractVariation* |

## tendering

### Services

| Service | Public methods |
|---|---|
| `BidScoreService` | `create` · `list` · `listPaged` |
| `EstimateService` | `buildRate` · `getForBoqItem` · `listByTender` · `tenderEstimate` |
| `TenderService` | `onModuleInit` · `create` · `update` · `changeStatus` · `list` · `listPaged` · `getOrCreateBOQ` · `addBOQItem` · `updateBOQItem` · `deleteBOQItem` · `importBOQItems` |
| `WinLossService` | `record` · `list` · `listPaged` · `analytics` |

### Store ports

| Port | Methods |
|---|---|
| `BidScoreStore` | `save` · `get` · `list` · `listPaged` |
| `BOQStore` | `saveBOQ` · `findBOQ` · `getBOQByTender` · `saveBOQItem` · `deleteBOQItem` · `getBOQItems` · `getBOQItem` |
| `EstimateStore` | `save` · `get` · `getByBoqItem` · `listByTender` · `delete` |
| `TenderStore` | `create` · `createWithClient` · `update` · `updateWithClient` · `get` · `list` · `listPaged` |
| `TenderOutcomeStore` | `save` · `get` · `list` · `listPaged` |

### Domain (pure)

| File | Exports |
|---|---|
| `domain/bid-score.ts` | `computeBidScore` · `recommendationFor` · `makeBidScore` · `BID_SCORE_EVENT` · *BidRecommendation* · *BidCriterion* · *BidScore* · *NewBidScore* |
| `domain/boq.ts` | `makeBOQ` · `makeBOQItem` · *BOQ* · *BOQItem* · *NewBOQ* · *NewBOQItem* |
| `domain/estimate.ts` | `COST_TYPES` · `computeBuildUp` · `makeRateBuildUp` · `summariseEstimate` · `TENDER_ESTIMATE_EVENT` · *CostType* · *CostComponent* · *RateBuildUp* · *NewRateBuildUp* · *TenderEstimate* |
| `domain/tender.ts` | `makeTender` · `TENDER_EVENT` · *TenderStatus* · *Tender* · *NewTender* |
| `domain/win-loss.ts` | `makeTenderOutcome` · `buildWinLossAnalytics` · `TENDER_OUTCOME_EVENT` · *TenderOutcomeResult* · *CompetitorBid* · *TenderOutcome* · *NewTenderOutcome* · *CompetitorStats* · *WinLossAnalytics* |
