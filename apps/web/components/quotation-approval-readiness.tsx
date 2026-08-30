'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import DecisionReadiness, { type EvidenceDoc, type StoredRequirement } from './decision-readiness';

/** Approval context belongs to the quotation record. It reads the shared DMS/evidence contracts;
 * it does not create a quotation-local checklist or document store. */
export default function QuotationApprovalReadiness({ quotationId }: { quotationId: string }) {
  const [docs, setDocs] = useState<EvidenceDoc[]>([]);
  const [requirements, setRequirements] = useState<StoredRequirement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [docsRes, reqRes] = await Promise.all([
        fetch(`/api/documents?aggregateType=crm.quotation&aggregateId=${encodeURIComponent(quotationId)}`, { cache: 'no-store' }),
        fetch(`/api/document-requirements?entityType=crm.quotation&entityId=${encodeURIComponent(quotationId)}`, { cache: 'no-store' }),
      ]);
      if (!docsRes.ok || !reqRes.ok) throw new Error('readiness service unavailable');
      const [docsJson, reqJson] = await Promise.all([docsRes.json(), reqRes.json()]);
      setDocs(Array.isArray(docsJson) ? docsJson : []);
      setRequirements(Array.isArray(reqJson?.requirements) ? reqJson.requirements : []);
    } catch {
      setError('Could not load approval readiness.');
    } finally {
      setLoaded(true);
    }
  }, [quotationId]);

  useEffect(() => { void load(); }, [load]);

  async function seed(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/document-requirements/seed', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityType: 'crm.quotation', entityId: quotationId }),
      });
      if (!res.ok) throw new Error('checklist could not be created');
      await load();
    } catch {
      setError('Could not create the evidence checklist.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p style={st.muted}>Loading approval readiness…</p>;
  return (
    <div>
      {error && <p style={st.error}>{error}</p>}
      <DecisionReadiness docs={docs} requirements={requirements} quotationId={quotationId} onSeed={() => void seed()} />
      <p style={st.note}>Approval is executed here on the quotation record. Evidence and sharing remain governed by Document Control.</p>
    </div>
  );
}

const st = {
  muted: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12.5, margin: '0 0 8px' } as CSSProperties,
  note: { color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.5, margin: '10px 0 0' } as CSSProperties,
};
