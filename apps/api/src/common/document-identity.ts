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
  // A document no company issued, in a tenant with exactly one company, IS that company's: today no
  // session carries a company (COMPANY-CTX-01), so every record arrives without one, and a company
  // that recorded its own identity must still be the one its paper names.
  const company = companyId
    ? all.find((entry) => entry.id === companyId) ?? null
    : all.length === 1 ? all[0] : null;
  const setting = async (key: string): Promise<string> => (await settings.get(tenantId, key).catch(() => null))?.trim() ?? '';
  const [profileName, profileLegal, profileTrn, profileAddress, profilePhone, profileEmail, profileWebsite, profileCurrency] = await Promise.all([
    setting('company.name'), setting('company.legalName'), setting('company.trn'), setting('company.address'),
    setting('company.phone'), setting('company.email'), setting('company.website'), setting('finance.defaultCurrency'),
  ]);

  /*
   * WHOSE PROFILE IS THE ORGANISATION PROFILE? The tenant's `company.*` settings describe the
   * company of a tenant that has one — or the issuer of a document no company issued. With two or
   * more companies they describe none of them in particular, so they may not fill a blank on one
   * company's paper: that would print another company's legal name or address under this one's
   * name and TRN (F-01). Each company's own record speaks first, always.
   */
  const profileSpeaks = all.length <= 1 || !companyId;
  const own = (value: string | undefined): string => value?.trim() ?? '';
  const pick = (mine: string | undefined, profile: string): string => own(mine) || (profileSpeaks ? profile : '');

  const name = own(company?.name) || (profileSpeaks ? profileLegal || profileName : '');
  return {
    companyId,
    name: name || 'Company identity not configured',
    configured: Boolean(name),
    legalName: pick(company?.legalName, profileLegal) || name,
    trn: pick(company?.trn, profileTrn),
    address: pick(company?.address, profileAddress),
    phone: pick(company?.phone, profilePhone),
    email: pick(company?.email, profileEmail),
    website: pick(company?.website, profileWebsite),
    currency: own(company?.baseCurrency) || (profileSpeaks ? profileCurrency : '') || 'AED',
  };
}
