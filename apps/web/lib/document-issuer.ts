import { fetchJson } from '@/lib/api';
import type { DocParty } from '@/components/document-sheet';

/** The issuing company's identity as the API resolves it (apps/api/src/common/document-identity.ts). */
export interface IssuerIdentity {
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

/** The company a record belongs to, when its payload says. */
export function companyOf(record: unknown): string | null {
  const id = (record as { companyId?: unknown } | null | undefined)?.companyId;
  return typeof id === 'string' && id ? id : null;
}

/**
 * WHO ISSUES THIS DOCUMENT, as the left-hand party of a printed sheet (F-01).
 *
 * Thirteen print pages typed the issuer in — "AURA OS Contracting LLC, Dubai, TRN 100000000000003" —
 * so every tax invoice, purchase order and payslip carried a name and a tax number nobody had
 * configured. The identity now comes from the company that owns the record: its own legal name,
 * address and TRN, or, for a tenant with one company, the organisation profile. When nothing is
 * configured the sheet says so; it never prints a placeholder that could pass for a real issuer.
 *
 * `department` is the issuing function under the company's name (Quality Assurance on an NCR) —
 * part of the document, not of the company's identity.
 */
export async function issuerParty(heading: string, companyId: string | null, department?: string): Promise<DocParty> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  const result = await fetchJson<IssuerIdentity>(`/api/documents/issuer-identity${query}`);
  if (!result.ok) return { heading, lines: ['Company identity unavailable'] };
  const identity = result.data;
  if (!identity.configured) return { heading, lines: ['Company identity not configured'] };
  return {
    heading,
    lines: [
      identity.legalName || identity.name,
      department ?? '',
      identity.address,
      identity.trn ? `TRN ${identity.trn}` : '',
      identity.phone,
      identity.email,
    ].filter(Boolean),
  };
}
