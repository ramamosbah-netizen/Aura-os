// Per-module business-settings catalog (Admin Center — NEW-ERP parity). Each entry is
// a tenant setting rendered by the generic /admin/module-settings screen and stored in
// aura_tenant_settings under `<module>.<name>`. Modules consume them through
// SettingsService at runtime; `consumed` marks keys a code path already reads today —
// the rest are available to modules as they adopt the seam (documented honesty).

export interface ModuleSettingSpec {
  key: string;
  label: string;
  kind: 'number' | 'text' | 'toggle' | 'select' | 'csv';
  hint?: string;
  options?: string[];
  defaultValue?: string;
  /** a code path reads this key at runtime today */
  consumed?: boolean;
}

export interface ModuleSettingsGroup {
  module: string;
  label: string;
  settings: ModuleSettingSpec[];
}

export const MODULE_SETTINGS_CATALOG: ModuleSettingsGroup[] = [
  {
    module: 'finance',
    label: 'Finance',
    settings: [
      { key: 'finance.vatRate', label: 'VAT rate (%)', kind: 'number', defaultValue: '5', hint: 'UAE standard rate — default for new tax codes' },
      { key: 'finance.paymentTermsDays', label: 'Default payment terms (days)', kind: 'number', defaultValue: '30' },
      { key: 'finance.fiscalYearStart', label: 'Fiscal year start (MM-DD)', kind: 'text', defaultValue: '01-01' },
      { key: 'finance.defaultCurrency', label: 'Base currency', kind: 'select', options: ['AED', 'USD', 'EUR', 'SAR', 'QAR'], defaultValue: 'AED' },
    ],
  },
  {
    module: 'procurement',
    label: 'Procurement',
    settings: [
      { key: 'procurement.directPurchaseThreshold', label: 'Direct-purchase threshold', kind: 'number', defaultValue: '5000', hint: 'Below this value a PO may skip the RFQ cycle' },
      { key: 'procurement.quoteThreshold', label: 'Min quotes above threshold', kind: 'number', defaultValue: '3' },
      { key: 'procurement.rfqValidityDays', label: 'RFQ validity (days)', kind: 'number', defaultValue: '14' },
    ],
  },
  {
    module: 'inventory',
    label: 'Inventory',
    settings: [
      { key: 'inventory.lowStockThreshold', label: 'Default low-stock threshold', kind: 'number', defaultValue: '10' },
      { key: 'inventory.valuationMethod', label: 'Valuation display', kind: 'select', options: ['WAC', 'FIFO'], defaultValue: 'WAC' },
    ],
  },
  {
    module: 'projects',
    label: 'Projects',
    settings: [
      { key: 'projects.defaultStages', label: 'Default execution stages', kind: 'csv', defaultValue: 'Mobilization,Execution,Testing & Commissioning,Handover', hint: 'Comma-separated pipeline stages' },
      { key: 'projects.voThresholdPercent', label: 'Variation alert threshold (%)', kind: 'number', defaultValue: '10' },
    ],
  },
  {
    module: 'subcontracts',
    label: 'Subcontracts',
    settings: [
      { key: 'subcontracts.defaultRetentionPercent', label: 'Default retention (%)', kind: 'number', defaultValue: '10', consumed: true, hint: 'Applied when a new subcontract omits retention' },
    ],
  },
  {
    module: 'hr',
    label: 'HR',
    settings: [
      { key: 'hr.annualLeaveDays', label: 'Annual leave (days/year)', kind: 'number', defaultValue: '30' },
      { key: 'hr.probationMonths', label: 'Probation period (months)', kind: 'number', defaultValue: '6' },
      { key: 'hr.workWeekHours', label: 'Work week (hours)', kind: 'number', defaultValue: '48' },
    ],
  },
  {
    module: 'crm',
    label: 'CRM',
    settings: [
      { key: 'crm.winProbabilityDefault', label: 'Default win probability (%)', kind: 'number', defaultValue: '30' },
      { key: 'crm.quoteValidityDays', label: 'Quotation validity (days)', kind: 'number', defaultValue: '30' },
    ],
  },
  {
    module: 'amc',
    label: 'AMC & Services',
    settings: [
      { key: 'amc.defaultSlaHours', label: 'Default SLA response (hours)', kind: 'number', defaultValue: '24' },
    ],
  },
  {
    module: 'fleet',
    label: 'Fleet',
    settings: [
      { key: 'fleet.registrationWarningDays', label: 'Registration expiry warning (days)', kind: 'number', defaultValue: '30' },
    ],
  },
  {
    module: 'assets',
    label: 'Assets',
    settings: [
      { key: 'assets.defaultUsefulLifeMonths', label: 'Default useful life (months)', kind: 'number', defaultValue: '60' },
    ],
  },
];
