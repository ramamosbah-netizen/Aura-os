'use client';

import { type CSSProperties, useCallback, useState } from 'react';
import { AdminCard } from './admin-chrome';
import { ErrorBanner, Pill } from './admin-ui';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

/**
 * Settings → Company Policies → Quotation Approval (EST-17).
 *
 * The screen edits a DRAFT version and nothing else: the active version is read-only, a retired one
 * is history. Validation and the preview are the API's — this page never decides whether a policy is
 * sound, it shows what the server says. Activation and retirement each ask for a reason, and the
 * change log shows who changed what, when and why, with the values before and after.
 *
 * Nothing here grants a role or a permission. A step naming a role nobody can approve with is
 * reported by validation; an administrator fixes that in Roles & Access, not here.
 */

export interface PolicyStep {
  id: string; label: string; role: string; quorum: number; order: number;
  appliesAbove: number | null; pendingDecision?: string | null;
}
export interface QuotationApprovalPolicyBody {
  currency: string;
  amountBasis: 'net' | 'gross';
  steps: PolicyStep[];
  minimumMarginPercent: number | null;
  marginEscalationRole: string | null;
  maximumDiscountPercent: number | null;
  discountEscalationRole: string | null;
  sla: { hours: number; escalateToRole: string } | null;
  manualQuotations: 'allowed' | 'management_required' | 'forbidden';
  managementRole: string | null;
  segregationOfDuties: { preparerMayNotApprove: boolean; oneStepPerApprover: boolean };
}
export interface PolicyVersion {
  id: string; version: number; status: 'draft' | 'active' | 'retired'; body: QuotationApprovalPolicyBody;
  createdBy: string; createdAt: string; updatedAt: string;
  activatedBy: string | null; activatedAt: string | null; retiredAt: string | null;
}
export interface PolicyChange {
  id: string; version: number; action: string; actorId: string; reason: string; previous: unknown; next: unknown; at: string;
}
export interface PolicyOverview {
  active: PolicyVersion | null;
  versions: PolicyVersion[];
  changes: PolicyChange[];
  ownerDefault: QuotationApprovalPolicyBody;
  roles: Array<{ id: string; name?: string; holders: number; approvers: number }>;
}
interface Issue { severity: 'error' | 'warning'; code: string; message: string }
interface PlannedStep { id: string; label: string; role: string; quorum: number; order: number; because: string }

const BASE = '/api/admin/company-policies/quotation-approval';
const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE }) : '—');
const num = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const ACTION_LABEL: Record<string, string> = { draft_created: 'Draft started', draft_updated: 'Draft changed', activated: 'Activated', retired: 'Retired' };
const MANUAL_LABEL: Record<QuotationApprovalPolicyBody['manualQuotations'], string> = {
  allowed: 'Allowed', management_required: 'Allowed with management approval', forbidden: 'Forbidden for new deals',
};

/** Every leaf that differs between two policy bodies, as `path: before → after`. */
function differences(before: unknown, after: unknown, path = ''): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((k) => differences(before[k], after[k], path ? `${path}.${k}` : k));
  }
  const show = (v: unknown) => (v === undefined ? '—' : JSON.stringify(v));
  return [`${path || '(policy)'}: ${show(before)} → ${show(after)}`];
}

async function call<T>(path: string, method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method, cache: 'no-store',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string; error?: string }).message ?? (data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function QuotationApprovalPolicyClient({ initial }: { initial: PolicyOverview }) {
  const [overview, setOverview] = useState(initial);
  const draftVersion = overview.versions.find((v) => v.status === 'draft') ?? null;
  const [body, setBody] = useState<QuotationApprovalPolicyBody | null>(draftVersion?.body ?? null);
  const [reason, setReason] = useState('');
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [offer, setOffer] = useState({ net: '', gross: '', margin: '', manual: false });
  const [plan, setPlan] = useState<{ amount: number; steps: PlannedStep[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<PolicyOverview> => {
    const next = await call<PolicyOverview>('', 'GET');
    setOverview(next);
    const draft = next.versions.find((v) => v.status === 'draft') ?? null;
    setBody(draft?.body ?? null);
    return next;
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); } catch (e) { setErr(`${label}: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const needReason = (): string | null => {
    if (reason.trim().length >= 3) return reason.trim();
    setErr('Give a reason for this change — it is recorded with the change.');
    return null;
  };

  const startDraft = (from: 'active' | 'owner-default') => {
    const why = needReason(); if (!why) return;
    void run('Starting a draft', async () => {
      const v = await call<PolicyVersion>('/drafts', 'POST', { reason: why, from });
      await reload(); setReason(''); setIssues(null); setPlan(null);
      setMsg(`Draft version ${v.version} started.`);
    });
  };
  const saveDraft = () => {
    if (!draftVersion || !body) return;
    const why = needReason(); if (!why) return;
    void run('Saving the draft', async () => {
      await call(`/drafts/${draftVersion.version}`, 'PUT', { body, reason: why });
      await reload(); setReason('');
      setMsg(`Draft version ${draftVersion.version} saved.`);
    });
  };
  const validate = () => {
    if (!body) return;
    void run('Validating', async () => {
      const r = await call<{ issues: Issue[] }>('/validate', 'POST', { body });
      setIssues(r.issues);
    });
  };
  const preview = () => {
    if (!body) return;
    const net = num(offer.net) ?? 0;
    void run('Previewing', async () => {
      const r = await call<{ issues: Issue[]; plan: { amount: number; steps: PlannedStep[] } }>('/preview', 'POST', {
        body, offer: { net, gross: num(offer.gross) ?? net, marginPercent: num(offer.margin), discountPercent: null, manual: offer.manual },
      });
      setIssues(r.issues); setPlan(r.plan);
    });
  };
  const activate = () => {
    if (!draftVersion) return;
    const why = needReason(); if (!why) return;
    void run('Activating', async () => {
      await call(`/drafts/${draftVersion.version}/activate`, 'POST', { reason: why });
      await reload(); setReason(''); setIssues(null); setPlan(null);
      setMsg(`Version ${draftVersion.version} is active. Offers submitted for review from now on follow it; approvals already started keep their own version.`);
    });
  };
  const retire = () => {
    const why = needReason(); if (!why) return;
    void run('Retiring', async () => {
      await call('/retire', 'POST', { reason: why });
      await reload(); setReason('');
      setMsg('The active version is retired. Offers submitted from now on need a single approval, as before the policy.');
    });
  };

  const setStep = (i: number, patch: Partial<PolicyStep>) => body && setBody({ ...body, steps: body.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const roleName = (id: string | null) => (id ? overview.roles.find((r) => r.id === id)?.name ?? id : '—');
  const roleOptions = (value: string | null, allowNone = false) => (
    <>
      {allowNone && <option value="">— none —</option>}
      {value && !overview.roles.some((r) => r.id === value) && <option value={value}>{value} (not a role)</option>}
      {overview.roles.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.id}</option>)}
    </>
  );
  const errors = issues?.filter((i) => i.severity === 'error') ?? [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {err && <ErrorBanner>{err}</ErrorBanner>}
      {msg && <div role="status" style={st.ok}>{msg}</div>}

      <AdminCard
        title="Active policy"
        desc="What offers submitted for review follow today. An approval keeps the version it started under."
        right={overview.active ? <Pill tone="good">Version {overview.active.version}</Pill> : <Pill tone="muted">None</Pill>}
      >
        {overview.active ? (
          <div data-testid="active-policy" style={{ display: 'grid', gap: 8 }}>
            <PolicySummary body={overview.active.body} roleName={roleName} />
            <div style={st.hint}>Activated by {overview.active.activatedBy ?? '—'} on {when(overview.active.activatedAt)}.</div>
          </div>
        ) : (
          <p data-testid="active-policy" style={st.hint}>No policy is active. An offer is approved once, by anyone holding the quotation approval permission and authority, and never by its own preparer.</p>
        )}
      </AdminCard>

      <AdminCard title="Reason for the change" desc="Required to start, save, activate or retire a version. It is kept in the change log.">
        <input className="input" aria-label="Reason for the change" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change is being made" style={{ width: '100%' }} />
        <div style={st.row}>
          {!draftVersion && overview.active && <button className="btn" disabled={busy} onClick={() => startDraft('active')}>Start a draft from the active version</button>}
          {!draftVersion && <button className="btn" disabled={busy} onClick={() => startDraft('owner-default')}>Start a draft from the owner&apos;s defaults</button>}
          {overview.active && <button className="btn btn-ghost" disabled={busy} onClick={retire}>Retire version {overview.active.version}</button>}
        </div>
      </AdminCard>

      {draftVersion && body && (
        <AdminCard
          title={`Draft version ${draftVersion.version}`}
          desc="Edit, save, validate and preview. Activation is refused while validation reports an error."
          right={<button className="admin-rowbtn" disabled={busy} onClick={() => { setBody(overview.ownerDefault); setIssues(null); setPlan(null); }}>Load the owner&apos;s defaults</button>}
        >
          <div data-testid="policy-draft" style={{ display: 'grid', gap: 14 }}>
            <div style={st.grid}>
              <label style={st.field}><span style={st.label}>Currency</span>
                <input className="input" aria-label="Currency" value={body.currency} onChange={(e) => setBody({ ...body, currency: e.target.value.toUpperCase() })} />
              </label>
              <label style={st.field}><span style={st.label}>Thresholds are judged</span>
                <select className="select" aria-label="Amount basis" value={body.amountBasis} onChange={(e) => setBody({ ...body, amountBasis: e.target.value as 'net' | 'gross' })}>
                  <option value="net">Before VAT (net)</option>
                  <option value="gross">After VAT (gross)</option>
                </select>
              </label>
              <label style={st.field}><span style={st.label}>Manual quotations</span>
                <select className="select" aria-label="Manual quotations" value={body.manualQuotations} onChange={(e) => setBody({ ...body, manualQuotations: e.target.value as QuotationApprovalPolicyBody['manualQuotations'] })}>
                  {Object.entries(MANUAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label style={st.field}><span style={st.label}>Management role</span>
                <select className="select" aria-label="Management role" value={body.managementRole ?? ''} onChange={(e) => setBody({ ...body, managementRole: e.target.value || null })}>{roleOptions(body.managementRole, true)}</select>
              </label>
            </div>

            <div>
              <b style={st.sub}>Approval sequence</b>
              <div style={st.scroll}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead><tr><th>Order</th><th>Step</th><th>Role</th><th>Quorum</th><th>Applies above</th><th>Who can approve</th><th /></tr></thead>
                  <tbody>
                    {body.steps.map((s, i) => {
                      const role = overview.roles.find((r) => r.id === s.role);
                      return (
                        <tr key={i} data-testid={`policy-step-${s.id}`}>
                          <td><input className="input" style={st.small} type="number" min={1} aria-label={`Order of ${s.label}`} value={s.order} onChange={(e) => setStep(i, { order: Number(e.target.value) })} /></td>
                          <td><input className="input" aria-label={`Label of step ${i + 1}`} value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} /></td>
                          <td><select className="select" aria-label={`Role of ${s.label}`} value={s.role} onChange={(e) => setStep(i, { role: e.target.value })}>{roleOptions(s.role)}</select></td>
                          <td><input className="input" style={st.small} type="number" min={1} aria-label={`Quorum of ${s.label}`} value={s.quorum} onChange={(e) => setStep(i, { quorum: Number(e.target.value) })} /></td>
                          <td>
                            {s.pendingDecision ? (
                              <div style={{ display: 'grid', gap: 4 }}>
                                <Pill tone="warn">Awaiting the owner</Pill>
                                <span style={st.hint}>{s.pendingDecision}</span>
                              </div>
                            ) : null}
                            <input className="input" style={st.amount} inputMode="decimal" aria-label={`Applies above for ${s.label}`} placeholder="every offer"
                              value={s.appliesAbove ?? ''} onChange={(e) => setStep(i, { appliesAbove: num(e.target.value), pendingDecision: null })} />
                          </td>
                          <td>{role ? <span style={{ color: role.approvers > 0 ? 'var(--good)' : 'var(--bad)' }}>{role.approvers} of {role.holders} holders</span> : <span style={{ color: 'var(--bad)' }}>not a role</span>}</td>
                          <td><button className="admin-rowbtn admin-rowbtn-danger" aria-label={`Remove ${s.label}`} onClick={() => setBody({ ...body, steps: body.steps.filter((_, j) => j !== i) })}>Remove</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button className="admin-rowbtn" style={{ marginTop: 8 }} onClick={() => {
                const order = Math.max(0, ...body.steps.map((s) => s.order)) + 1;
                setBody({ ...body, steps: [...body.steps, { id: `step-${order}-${body.steps.length + 1}`, label: `Step ${order}`, role: overview.roles[0]?.id ?? '', quorum: 1, order, appliesAbove: null }] });
              }}>Add a step</button>
              <p style={st.hint}>Steps with the same order may be approved in any order; a later order waits for the earlier ones. A blank amount means every offer. The &ldquo;who can approve&rdquo; column counts active holders of the role who also hold the quotation read and approve permissions.</p>
            </div>

            <div style={st.grid}>
              <label style={st.field}><span style={st.label}>Minimum margin %</span>
                <input className="input" inputMode="decimal" aria-label="Minimum margin percent" placeholder="no trigger" value={body.minimumMarginPercent ?? ''} onChange={(e) => setBody({ ...body, minimumMarginPercent: num(e.target.value) })} />
              </label>
              <label style={st.field}><span style={st.label}>Margin escalates to</span>
                <select className="select" aria-label="Margin escalation role" value={body.marginEscalationRole ?? ''} onChange={(e) => setBody({ ...body, marginEscalationRole: e.target.value || null })}>{roleOptions(body.marginEscalationRole, true)}</select>
              </label>
              <label style={st.field}><span style={st.label}>Maximum discount %</span>
                <input className="input" inputMode="decimal" aria-label="Maximum discount percent" placeholder="no trigger" value={body.maximumDiscountPercent ?? ''} onChange={(e) => setBody({ ...body, maximumDiscountPercent: num(e.target.value) })} />
              </label>
              <label style={st.field}><span style={st.label}>Discount escalates to</span>
                <select className="select" aria-label="Discount escalation role" value={body.discountEscalationRole ?? ''} onChange={(e) => setBody({ ...body, discountEscalationRole: e.target.value || null })}>{roleOptions(body.discountEscalationRole, true)}</select>
              </label>
              <label style={st.field}><span style={st.label}>SLA (hours per step)</span>
                <input className="input" inputMode="decimal" aria-label="SLA hours" placeholder="no SLA" value={body.sla?.hours ?? ''}
                  onChange={(e) => { const hours = num(e.target.value); setBody({ ...body, sla: hours === null ? null : { hours, escalateToRole: body.sla?.escalateToRole ?? body.managementRole ?? '' } }); }} />
              </label>
              <label style={st.field}><span style={st.label}>SLA escalates to</span>
                <select className="select" aria-label="SLA escalation role" disabled={!body.sla} value={body.sla?.escalateToRole ?? ''} onChange={(e) => body.sla && setBody({ ...body, sla: { ...body.sla, escalateToRole: e.target.value } })}>{roleOptions(body.sla?.escalateToRole ?? null, true)}</select>
              </label>
            </div>

            <div style={st.row}>
              <label style={st.check}><input type="checkbox" checked={body.segregationOfDuties.preparerMayNotApprove}
                onChange={(e) => setBody({ ...body, segregationOfDuties: { ...body.segregationOfDuties, preparerMayNotApprove: e.target.checked } })} /> The preparer may not approve their own offer</label>
              <label style={st.check}><input type="checkbox" checked={body.segregationOfDuties.oneStepPerApprover}
                onChange={(e) => setBody({ ...body, segregationOfDuties: { ...body.segregationOfDuties, oneStepPerApprover: e.target.checked } })} /> One person approves at most one step</label>
            </div>

            <div style={st.row}>
              <button className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>
              <button className="btn" disabled={busy} onClick={validate}>Validate</button>
              <button className="btn btn-primary" disabled={busy} onClick={activate}>Activate version {draftVersion.version}</button>
            </div>

            {issues && (
              <div data-testid="policy-issues" style={st.issues}>
                {issues.length === 0 ? <span style={{ color: 'var(--good)' }}>No issues — this version can be activated.</span> : issues.map((i, k) => (
                  <div key={k} style={{ color: i.severity === 'error' ? 'var(--bad)' : 'var(--warn)' }}>
                    <b>{i.severity === 'error' ? 'Error' : 'Warning'}</b> <code>{i.code}</code> — {i.message}
                  </div>
                ))}
                {errors.length > 0 && <div style={st.hint}>{errors.length} error{errors.length === 1 ? '' : 's'}: activation is refused until they are resolved.</div>}
              </div>
            )}

            <div>
              <b style={st.sub}>Preview an offer</b>
              <div style={st.grid}>
                <label style={st.field}><span style={st.label}>Net amount ({body.currency})</span>
                  <input className="input" inputMode="decimal" aria-label="Preview net amount" value={offer.net} onChange={(e) => setOffer({ ...offer, net: e.target.value })} />
                </label>
                <label style={st.field}><span style={st.label}>Gross amount (blank: same as net)</span>
                  <input className="input" inputMode="decimal" aria-label="Preview gross amount" value={offer.gross} onChange={(e) => setOffer({ ...offer, gross: e.target.value })} />
                </label>
                <label style={st.field}><span style={st.label}>Margin % (blank: unknown)</span>
                  <input className="input" inputMode="decimal" aria-label="Preview margin percent" value={offer.margin} onChange={(e) => setOffer({ ...offer, margin: e.target.value })} />
                </label>
                <label style={st.check}><input type="checkbox" checked={offer.manual} onChange={(e) => setOffer({ ...offer, manual: e.target.checked })} /> Quoted manually</label>
              </div>
              <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={preview}>Preview the approval route</button>
              {plan && (
                <ol data-testid="policy-preview" style={st.plan}>
                  {plan.steps.length === 0 ? <li>No step applies: the offer is approved once, as without a policy.</li> : plan.steps.map((s) => (
                    <li key={s.id}><b>{s.label}</b> — {roleName(s.role)} ({s.quorum} approval{s.quorum === 1 ? '' : 's'}, position {s.order}) · {s.because}</li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </AdminCard>
      )}

      <AdminCard title="Versions" desc="Every version this company has had. A version is edited only while it is a draft.">
        <div style={st.scroll}>
          <table className="data-table" data-testid="policy-versions" style={{ width: '100%' }}>
            <thead><tr><th>Version</th><th>Status</th><th>Started</th><th>Activated</th><th>Retired</th></tr></thead>
            <tbody>
              {overview.versions.length === 0 ? <tr><td colSpan={5} style={st.hint}>No versions yet.</td></tr> : [...overview.versions].sort((a, b) => b.version - a.version).map((v) => (
                <tr key={v.id}>
                  <td>v{v.version}</td>
                  <td><Pill tone={v.status === 'active' ? 'good' : v.status === 'draft' ? 'info' : 'muted'}>{v.status}</Pill></td>
                  <td>{v.createdBy} · {when(v.createdAt)}</td>
                  <td>{v.activatedBy ? `${v.activatedBy} · ${when(v.activatedAt)}` : '—'}</td>
                  <td>{when(v.retiredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      <AdminCard title="Change log" desc="Who changed the policy, when, why, and the values before and after. It cannot be edited.">
        <div data-testid="policy-changes" style={{ display: 'grid', gap: 8 }}>
          {overview.changes.length === 0 ? <span style={st.hint}>No changes yet.</span> : [...overview.changes].reverse().map((c) => {
            const diff = differences(c.previous, c.next);
            return (
              <details key={c.id} style={st.change}>
                <summary><b>{ACTION_LABEL[c.action] ?? c.action}</b> · v{c.version} · {c.actorId} · {when(c.at)} — {c.reason}</summary>
                <ul style={st.diff}>{diff.length === 0 ? <li>No values changed.</li> : diff.map((d) => <li key={d}><code>{d}</code></li>)}</ul>
              </details>
            );
          })}
        </div>
      </AdminCard>
    </div>
  );
}

function PolicySummary({ body, roleName }: { body: QuotationApprovalPolicyBody; roleName: (id: string | null) => string }) {
  const steps = [...body.steps].sort((a, b) => a.order - b.order);
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
      <span>Thresholds in {body.currency}, judged {body.amountBasis === 'net' ? 'before VAT (net)' : 'after VAT (gross)'}.</span>
      <ol style={{ margin: '4px 0', paddingLeft: 20 }}>
        {steps.map((s) => (
          <li key={s.id}>{s.label} — {roleName(s.role)}{s.quorum > 1 ? ` (${s.quorum} approvals)` : ''}{s.appliesAbove !== null ? ` · above ${body.currency} ${s.appliesAbove.toLocaleString(DISPLAY_LOCALE)}` : ' · every offer'}</li>
        ))}
      </ol>
      <span>Manual quotations: {MANUAL_LABEL[body.manualQuotations]}.</span>
      {body.minimumMarginPercent !== null && <span>Below {body.minimumMarginPercent}% margin: {roleName(body.marginEscalationRole ?? body.managementRole)} approves as well.</span>}
      <span>{body.segregationOfDuties.preparerMayNotApprove ? 'The preparer may not approve their own offer.' : 'The preparer may approve their own offer.'} {body.segregationOfDuties.oneStepPerApprover ? 'One person approves at most one step.' : ''}</span>
    </div>
  );
}

const st = {
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', fontSize: 13 } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 } as CSSProperties,
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 } as CSSProperties,
  field: { display: 'grid', gap: 4 } as CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' } as CSSProperties,
  sub: { display: 'block', fontSize: 13, marginBottom: 6 } as CSSProperties,
  check: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 } as CSSProperties,
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  small: { width: 70 } as CSSProperties,
  amount: { width: 140 } as CSSProperties,
  issues: { display: 'grid', gap: 6, fontSize: 13, padding: 12, border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  plan: { margin: '10px 0 0', paddingLeft: 20, fontSize: 13, display: 'grid', gap: 4 } as CSSProperties,
  change: { border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13 } as CSSProperties,
  diff: { margin: '8px 0 0', paddingLeft: 18, fontSize: 12, display: 'grid', gap: 2 } as CSSProperties,
};
