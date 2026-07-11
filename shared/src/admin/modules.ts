// Business-module registry (Admin Center Module Manager). The 17 bounded contexts an
// admin can enable/disable per tenant — kernel/platform surfaces (admin, workspace,
// auth, events…) are never gateable. The id doubles as the API route prefix, which is
// how the permission guard maps a request to its module.

export interface BusinessModule {
  id: string;
  label: string;
  glyph: string;
  desc: string;
}

export const BUSINESS_MODULES: BusinessModule[] = [
  { id: 'crm', label: 'CRM', glyph: '◎', desc: 'Accounts, leads, opportunities, quotations' },
  { id: 'tendering', label: 'Tendering', glyph: '◳', desc: 'Tenders, BoQ, estimates, win/loss' },
  { id: 'contracts', label: 'Contracts', glyph: '▦', desc: 'Contracts, payment certificates, obligations' },
  { id: 'projects', label: 'Projects', glyph: '▥', desc: 'Delivery, WBS/CBS, variations, EOT, schedule' },
  { id: 'procurement', label: 'Procurement', glyph: '▣', desc: 'Suppliers, PRs, RFQs, purchase orders' },
  { id: 'inventory', label: 'Inventory', glyph: '▢', desc: 'Stock, GRNs, transfers, valuation' },
  { id: 'finance', label: 'Finance', glyph: '◱', desc: 'GL, invoices, payments, VAT, statements' },
  { id: 'subcontracts', label: 'Subcontracts', glyph: '▧', desc: 'Subcontracts, claims, variations, back-charges' },
  { id: 'engineering', label: 'Engineering', glyph: '⚙', desc: 'Drawings, RFIs, submittals, design changes' },
  { id: 'doccontrol', label: 'Document Control', glyph: '▤', desc: 'Transmittals, correspondence, registers' },
  { id: 'site', label: 'Site Control', glyph: '⛏', desc: 'Daily reports, delays, instructions, labour' },
  { id: 'hse', label: 'HSE', glyph: '🛡', desc: 'Incidents, permits, CAPA, risk, training' },
  { id: 'quality', label: 'Quality', glyph: '✓', desc: 'NCRs, inspections, snags, ITPs, audits' },
  { id: 'hr', label: 'HR', glyph: '👥', desc: 'Employees, leave, payroll, WPS, timesheets' },
  { id: 'fleet', label: 'Fleet', glyph: '▨', desc: 'Vehicles, fuel, maintenance, fines, Salik' },
  { id: 'assets', label: 'Assets', glyph: '◧', desc: 'Asset register, maintenance, depreciation' },
  { id: 'amc', label: 'AMC & Services', glyph: '♻', desc: 'Service contracts, tickets, PPM, dispatch' },
];

export const GATEABLE_MODULE_IDS: ReadonlySet<string> = new Set(BUSINESS_MODULES.map((m) => m.id));

/** Settings key holding the csv of disabled module ids for a tenant. */
export const MODULES_DISABLED_KEY = 'modules.disabled';

export function parseDisabledModules(csv: string | null | undefined): Set<string> {
  return new Set(
    (csv ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => GATEABLE_MODULE_IDS.has(id)),
  );
}
