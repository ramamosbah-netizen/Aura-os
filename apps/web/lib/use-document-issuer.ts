'use client';

import { useEffect, useState } from 'react';

/** The issuer letterhead for a client-rendered print page (F-01): name line, then the details line. */
export interface IssuerLetterhead { name: string; details: string }

/**
 * The issuing company's identity, for print pages that render in the browser. Same source as the
 * server pages' `issuerParty` — the company that owns the record, or the organisation profile of a
 * tenant with one company — and the same honesty: nothing configured says so.
 */
export function useDocumentIssuer(companyId: string | null): IssuerLetterhead | null {
  const [letterhead, setLetterhead] = useState<IssuerLetterhead | null>(null);
  useEffect(() => {
    let live = true;
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    fetch(`/api/documents/issuer-identity${query}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return { name: 'Company identity unavailable', details: '' };
        const identity = (await res.json()) as { configured: boolean; name: string; legalName: string; address: string; trn: string; phone: string; email: string };
        if (!identity.configured) return { name: 'Company identity not configured', details: '' };
        return {
          name: identity.legalName || identity.name,
          details: [identity.address, identity.trn ? `TRN ${identity.trn}` : '', identity.phone, identity.email].filter(Boolean).join(' · '),
        };
      })
      .catch(() => ({ name: 'Company identity unavailable', details: '' }))
      .then((value) => { if (live) setLetterhead(value); });
    return () => { live = false; };
  }, [companyId]);
  return letterhead;
}
