import type { CompaniesService, SettingsService } from '@aura/core';

export interface DocumentIdentity {
  companyId: string | null;
  name: string;
  configured: boolean;
  legalName: string;
  trn: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  currency: string;
}

/**
 * WHO IS ISSUING THIS DOCUMENT — resolved from the issuing company and the tenant's settings.
 *
 * This lived inside the quotation controller as `GET crm/quotations/:id/document-identity`, and
 * every customer document borrowed it through a quotation. That was harmless while every customer
 * document had one. The technical proposal no longer does: it rests on the approved study and may
 * be issued BEFORE the commercial offer it accompanies is approved — and the PDF route, still
 * fetching identity through `commercialReference.quotationId`, dereferenced a null and failed.
 *
 * Nothing about a company's legal name, TRN or address depends on which offer is being printed, so
 * the resolution now takes the company directly and both callers share it.
 */
export async function resolveDocumentIdentity(
  companies: CompaniesService,
  settings: SettingsService,
  tenantId: string,
  companyId: string | null,
): Promise<DocumentIdentity> {
  const all = await companies.list(tenantId);
  const company = companyId ? all.find((entry) => entry.id === companyId) ?? null : null;
  const setting = async (key: string): Promise<string> => (await settings.get(tenantId, key).catch(() => null))?.trim() ?? '';
  const [profileName, legalName, profileTrn, address, phone, email, website, currency] = await Promise.all([
    setting('company.name'), setting('company.legalName'), setting('company.trn'), setting('company.address'),
    setting('company.phone'), setting('company.email'), setting('company.website'), setting('finance.defaultCurrency'),
  ]);
  const name = company?.name || legalName || profileName;
  return {
    companyId,
    name: name || 'Company identity not configured',
    configured: Boolean(name),
    legalName: legalName || name || '',
    trn: company?.trn || profileTrn,
    address,
    phone,
    email,
    website,
    currency: company?.baseCurrency || currency || 'AED',
  };
}
