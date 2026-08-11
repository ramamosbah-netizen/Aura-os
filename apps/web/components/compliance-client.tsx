'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Badge, Button, Card, Field, Input, KpiTile, Select, Table, Td, Th } from './ui/kit';
import NextBestActionBanner from './ui/next-best-action-banner';

/**
 * Compliance register (G-20 / ADR-0018).
 *
 * ONE screen for every authority. SIRA and DCD are rows in the authority list, and the register
 * filters by authority — building a SIRA screen and a DCD screen would have been two lists that
 * disagree, which is the mistake the whole core exists to avoid.
 *
 * Ships empty on purpose: with no authorities registered the page says so and offers the one
 * action that helps, rather than showing a blank table.
 */

interface Authority {
  id: string;
  code: string;
  name: string;
  jurisdiction: string;
  active: boolean;
}

interface ComplianceCase {
  id: string;
  authorityCode: string;
  obligationCode: string;
  scope: 'PROJECT' | 'COMPANY' | 'PERSON';
  subjectType: string;
  subjectId: string;
  projectId: string | null;
  system: string | null;
  coverage: string;
  reference: string | null;
  status: string;
  createdAt: string;
}

interface Submission { id: string; attempt: number; submittedAt: string; reference: string | null; fee: number | null; currency: string | null }
interface Decision { id: string; outcome: string; decisionDate: string; decisionBy: string | null; reason: string | null; conditions: string | null }
interface Certificate { id: string; number: string; issuedAt: string; expiresAt: string | null; supersededByCertificateId: string | null }
interface Inspection { id: string; scheduledAt: string | null; conductedAt: string | null; outcome: string | null; reinspectionRequired: boolean }
interface Renewal { certificate: Certificate; status: 'expired' | 'expiring' | 'valid'; daysToExpiry: number | null }

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  certified: 'good',
  approved: 'good',
  rejected: 'bad',
  expired: 'bad',
  withdrawn: 'neutral',
  draft: 'neutral',
  submitted: 'warn',
  under_review: 'warn',
  inspection: 'warn',
};

export default function ComplianceClient({
  initialAuthorities,
  initialCases,
  initialRenewals,
}: {
  initialAuthorities: Authority[];
  initialCases: ComplianceCase[];
  initialRenewals: Renewal[];
}) {
  const [authorities, setAuthorities] = useState(initialAuthorities);
  const [cases, setCases] = useState(initialCases);
  const [renewals, setRenewals] = useState(initialRenewals);
  const [filter, setFilter] = useState({ authorityCode: '', status: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [auth, setAuth] = useState({ code: '', name: '', jurisdiction: 'AE-DU' });
  const [draft, setDraft] = useState({ authorityCode: '', obligationCode: '', scope: 'PROJECT', subjectId: '', system: 'cctv' });

  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ submissions: Submission[]; decisions: Decision[]; certificates: Certificate[]; inspections: Inspection[] } | null>(null);

  const reloadCases = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filter.authorityCode) qs.set('authorityCode', filter.authorityCode);
    if (filter.status) qs.set('status', filter.status);
    const res = await fetch(`/api/compliance/cases?${qs}`, { cache: 'no-store' });
    if (res.ok) setCases(await res.json());
  }, [filter]);

  useEffect(() => {
    void reloadCases();
  }, [reloadCases]);

  const registerAuthority = async () => {
    setError('');
    if (!auth.code.trim() || !auth.name.trim()) return setError('Code and name are required');
    setBusy(true);
    try {
      const res = await fetch('/api/compliance/authorities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(auth),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      setAuthorities([...authorities, await res.json()].sort((a, b) => a.code.localeCompare(b.code)));
      setAuth({ code: '', name: '', jurisdiction: 'AE-DU' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to register authority');
    } finally {
      setBusy(false);
    }
  };

  const openCase = async () => {
    setError('');
    if (!draft.authorityCode || !draft.obligationCode.trim() || !draft.subjectId.trim()) {
      return setError('Authority, obligation and subject are required');
    }
    setBusy(true);
    try {
      const body = {
        ...draft,
        projectId: draft.scope === 'PROJECT' ? draft.subjectId : undefined,
        system: draft.scope === 'PROJECT' ? draft.system : undefined,
      };
      const res = await fetch('/api/compliance/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      setDraft({ ...draft, obligationCode: '', subjectId: '' });
      await reloadCases();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open case');
    } finally {
      setBusy(false);
    }
  };

  const loadDetail = async (id: string) => {
    if (openCaseId === id) return setOpenCaseId(null);
    setOpenCaseId(id);
    setDetail(null);
    const get = async (child: string) => {
      const r = await fetch(`/api/compliance/cases/${id}/${child}`, { cache: 'no-store' });
      return r.ok ? r.json() : [];
    };
    const [submissions, decisions, certificates, inspections] = await Promise.all([
      get('submissions'), get('decisions'), get('certificates'), get('inspections'),
    ]);
    setDetail({ submissions, decisions, certificates, inspections });
  };

  const refreshRenewals = async () => {
    const r = await fetch('/api/compliance/renewals?withinDays=90', { cache: 'no-store' });
    if (r.ok) setRenewals(await r.json());
  };

  const expired = renewals.filter((r) => r.status === 'expired').length;
  const openCases = cases.filter((c) => !['certified', 'withdrawn'].includes(c.status)).length;

  // ── Empty state: no authorities means nothing else on this page can be used ──────────────────
  if (authorities.length === 0) {
    return (
      <div style={st.wrap}>
        <NextBestActionBanner
          status="No authorities registered"
          recommendedAction="Register the authority you file with"
          explanation={
            'The Compliance Core ships with no authorities and no rules — nothing regulatory is included ' +
            'until it has been checked against the authority’s own published requirements. Register SIRA or ' +
            'Dubai Civil Defence below to start tracking cases against them.'
          }
        />
        <Card>
          <h2 style={st.h2}>Register an authority</h2>
          <AuthorityForm auth={auth} setAuth={setAuth} onSubmit={registerAuthority} busy={busy} />
          {error && <p style={st.err}>{error}</p>}
        </Card>
      </div>
    );
  }

  return (
    <div style={st.wrap}>
      <div style={st.kpis}>
        <KpiTile label="Open cases" value={openCases} tone={openCases > 0 ? 'warn' : 'good'} />
        <KpiTile label="Authorities" value={authorities.length} />
        <KpiTile label="Expiring ≤90d" value={renewals.length - expired} tone={renewals.length - expired > 0 ? 'warn' : 'good'} />
        <KpiTile label="Expired" value={expired} tone={expired > 0 ? 'bad' : 'good'} />
      </div>

      {expired > 0 && (
        <NextBestActionBanner
          status={`${expired} certificate${expired === 1 ? '' : 's'} expired`}
          recommendedAction="Renew the lapsed approvals"
          explanation="A system operating on an expired authority certificate is operating without approval. Renewals issue a new certificate — the previous one keeps its own dates so the history stays intact."
        />
      )}

      {renewals.length > 0 && (
        <Card>
          <div style={st.cardHead}>
            <h2 style={st.h2}>Renewals</h2>
            <Button size="sm" tone="neutral" onClick={refreshRenewals}>Refresh</Button>
          </div>
          <Table>
            <thead><tr><Th>Certificate</Th><Th>Expires</Th><Th>Days</Th><Th>Status</Th></tr></thead>
            <tbody>
              {renewals.map((r) => (
                <tr key={r.certificate.id}>
                  <Td>{r.certificate.number}</Td>
                  <Td>{r.certificate.expiresAt ?? '—'}</Td>
                  <Td>{r.daysToExpiry ?? '—'}</Td>
                  <Td><Badge tone={r.status === 'expired' ? 'bad' : 'warn'}>{r.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <div style={st.cardHead}>
          <h2 style={st.h2}>Compliance register</h2>
          <div style={st.filters}>
            <Select value={filter.authorityCode} onChange={(e) => setFilter({ ...filter, authorityCode: e.target.value })}>
              <option value="">All authorities</option>
              {authorities.map((a) => <option key={a.id} value={a.code}>{a.code}</option>)}
            </Select>
            <Select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">Any status</option>
              {['draft', 'submitted', 'under_review', 'inspection', 'approved', 'certified', 'rejected', 'expired'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </Select>
          </div>
        </div>

        {cases.length === 0 ? (
          <p style={st.muted}>No cases yet. Open one below to start tracking an approval.</p>
        ) : (
          <Table>
            <thead>
              <tr><Th>Authority</Th><Th>Obligation</Th><Th>Scope</Th><Th>System</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <React.Fragment key={c.id}>
                  <tr>
                    <Td><strong>{c.authorityCode}</strong></Td>
                    <Td>{c.obligationCode}</Td>
                    <Td>{c.scope.toLowerCase()}</Td>
                    <Td>{c.system ?? '—'}</Td>
                    <Td><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status.replace('_', ' ')}</Badge></Td>
                    <Td>
                      <Button size="sm" tone="neutral" onClick={() => loadDetail(c.id)}>
                        {openCaseId === c.id ? 'Hide' : 'History'}
                      </Button>
                    </Td>
                  </tr>
                  {openCaseId === c.id && (
                    <tr>
                      <Td colSpan={6}>
                        <CaseHistory detail={detail} />
                      </Td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 style={st.h2}>Open a case</h2>
        <div style={st.form}>
          <Field label="Authority">
            <Select value={draft.authorityCode} onChange={(e) => setDraft({ ...draft, authorityCode: e.target.value })}>
              <option value="">Select…</option>
              {authorities.filter((a) => a.active).map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </Select>
          </Field>
          <Field label="Obligation">
            <Input value={draft.obligationCode} onChange={(e) => setDraft({ ...draft, obligationCode: e.target.value })} placeholder="SYSTEM_CERTIFICATION" />
          </Field>
          <Field label="Scope">
            <Select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
              <option value="PROJECT">Project</option>
              <option value="COMPANY">Company</option>
              <option value="PERSON">Person</option>
            </Select>
          </Field>
          <Field label={draft.scope === 'PROJECT' ? 'Project id' : draft.scope === 'COMPANY' ? 'Company id' : 'Person id'}>
            <Input value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })} placeholder="uuid" />
          </Field>
          {draft.scope === 'PROJECT' && (
            <Field label="System">
              <Select value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })}>
                {['cctv', 'access_control', 'fire_alarm', 'public_address', 'intrusion_alarm', 'network', 'bms'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div style={st.actions}>
          <Button onClick={openCase} disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Open case'}</Button>
          {error && <span style={st.err}>{error}</span>}
        </div>
        <p style={st.hint}>
          Obligation codes are free text until the authority&rsquo;s published requirements are loaded — the core
          deliberately ships no regulatory rules, so nothing here claims to know what SIRA or DCD ask for.
        </p>
      </Card>

      <Card>
        <h2 style={st.h2}>Authorities</h2>
        <Table>
          <thead><tr><Th>Code</Th><Th>Name</Th><Th>Jurisdiction</Th><Th>Active</Th></tr></thead>
          <tbody>
            {authorities.map((a) => (
              <tr key={a.id}>
                <Td><strong>{a.code}</strong></Td>
                <Td>{a.name}</Td>
                <Td>{a.jurisdiction}</Td>
                <Td><Badge tone={a.active ? 'good' : 'neutral'}>{a.active ? 'active' : 'inactive'}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div style={{ marginTop: 14 }}>
          <AuthorityForm auth={auth} setAuth={setAuth} onSubmit={registerAuthority} busy={busy} />
        </div>
      </Card>
    </div>
  );
}

function AuthorityForm({
  auth, setAuth, onSubmit, busy,
}: {
  auth: { code: string; name: string; jurisdiction: string };
  setAuth: (a: { code: string; name: string; jurisdiction: string }) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <>
      <div style={st.form}>
        <Field label="Code"><Input value={auth.code} onChange={(e) => setAuth({ ...auth, code: e.target.value })} placeholder="SIRA" /></Field>
        <Field label="Name" style={{ minWidth: 260 }}>
          <Input value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} placeholder="Security Industry Regulatory Agency" />
        </Field>
        <Field label="Jurisdiction"><Input value={auth.jurisdiction} onChange={(e) => setAuth({ ...auth, jurisdiction: e.target.value })} placeholder="AE-DU" /></Field>
      </div>
      <div style={st.actions}>
        <Button onClick={onSubmit} disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Register authority'}</Button>
      </div>
    </>
  );
}

/**
 * The case history. Shows submissions, inspections, decisions and certificates as the append-only
 * series they are — a rejection stays visible after the approval, and a superseded certificate
 * keeps its own dates. That is the point of the model, so the UI must not collapse it to "current".
 */
function CaseHistory({ detail }: { detail: { submissions: Submission[]; decisions: Decision[]; certificates: Certificate[]; inspections: Inspection[] } | null }) {
  if (!detail) return <p style={st.muted}>Loading history…</p>;
  const { submissions, decisions, certificates, inspections } = detail;

  return (
    <div style={st.history}>
      <section>
        <h4 style={st.h4}>Submissions</h4>
        {submissions.length === 0 ? <p style={st.muted}>None yet.</p> : submissions.map((s) => (
          <p key={s.id} style={st.line}>
            <strong>#{s.attempt}</strong> {s.submittedAt}
            {s.reference && ` · ${s.reference}`}
            {s.fee !== null && ` · ${s.currency ?? ''} ${s.fee}`}
          </p>
        ))}
      </section>

      <section>
        <h4 style={st.h4}>Inspections</h4>
        {inspections.length === 0 ? <p style={st.muted}>None — not every obligation requires one.</p> : inspections.map((i) => (
          <p key={i.id} style={st.line}>
            {i.conductedAt ?? i.scheduledAt ?? 'unscheduled'}
            {i.outcome && <> · <Badge tone={i.outcome === 'pass' ? 'good' : i.outcome === 'fail' ? 'bad' : 'warn'}>{i.outcome}</Badge></>}
            {i.reinspectionRequired && ' · re-inspection required'}
          </p>
        ))}
      </section>

      <section>
        <h4 style={st.h4}>Decisions</h4>
        {decisions.length === 0 ? <p style={st.muted}>None yet.</p> : decisions.map((d) => (
          <p key={d.id} style={st.line}>
            <Badge tone={d.outcome === 'rejected' ? 'bad' : 'good'}>{d.outcome.replace(/_/g, ' ')}</Badge>{' '}
            {d.decisionDate}{d.decisionBy && ` · ${d.decisionBy}`}
            {d.reason && <span style={st.reason}> — {d.reason}</span>}
            {d.conditions && <span style={st.reason}> — {d.conditions}</span>}
          </p>
        ))}
      </section>

      <section>
        <h4 style={st.h4}>Certificates</h4>
        {certificates.length === 0 ? <p style={st.muted}>None yet.</p> : certificates.map((c) => (
          <p key={c.id} style={st.line}>
            <strong>{c.number}</strong> issued {c.issuedAt}
            {c.expiresAt ? ` · expires ${c.expiresAt}` : ' · no expiry'}
            {c.supersededByCertificateId ? ' · superseded' : ' · current'}
          </p>
        ))}
      </section>
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 } as CSSProperties,
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 } as CSSProperties,
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' } as CSSProperties,
  filters: { display: 'flex', gap: 8 } as CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, margin: 0 } as CSSProperties,
  h4: { fontSize: 12.5, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' } as CSSProperties,
  actions: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 } as CSSProperties,
  history: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, padding: '10px 2px' } as CSSProperties,
  line: { fontSize: 12.5, margin: '0 0 5px', lineHeight: 1.5 } as CSSProperties,
  reason: { color: 'var(--muted)' } as CSSProperties,
  muted: { fontSize: 12.5, color: 'var(--muted)', margin: 0 } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.55 } as CSSProperties,
  err: { fontSize: 12.5, color: 'var(--bad)' } as CSSProperties,
};
