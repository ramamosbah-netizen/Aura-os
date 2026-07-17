'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

// Qualify & Convert — Lead → Opportunity, the Account-first way. This is where the
// system's identity resolution finally surfaces in the UI: the convert-preview
// dry-run shows which Account and Primary Contact this lead would LINK to (a
// possible duplicate) versus CREATE fresh, and the user decides before anything is
// written. The actual write is the transactional, idempotent, dedupe-protected
// POST /crm/leads/:id/convert (LeadConversionService) — one call makes the Account,
// the primary Contact, and the Opportunity, with lineage preserved.

type Confidence = 'EXACT' | 'PROBABLE' | 'POSSIBLE' | 'NONE';
interface Match { id: string; confidence: Exclude<Confidence, 'NONE'>; score: number; reasons: string[] }
interface Resolution { best: Confidence; matches: Match[] }
interface Preview {
  lead: { id: string; name: string; companyName: string | null; email: string | null; phone: string | null };
  alreadyConverted: boolean;
  account: Resolution;
  contact: Resolution;
}

interface LeadLite { id: string; name: string; companyName: string | null }
interface AccountLite { id: string; name: string }

const CONF_COLOR: Record<Exclude<Confidence, 'NONE'>, string> = {
  EXACT: 'var(--good)', PROBABLE: 'var(--warn, #d97706)', POSSIBLE: 'var(--muted)',
};

export default function LeadConvertDrawer({ lead, accounts, onDone }: {
  lead: LeadLite;
  accounts: AccountLite[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});

  // choices
  const [accountMode, setAccountMode] = useState<'link' | 'create'>('create');
  const [contactMode, setContactMode] = useState<'link' | 'create'>('create');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [requiresTender, setRequiresTender] = useState('true');
  const [closeDate, setCloseDate] = useState('');

  const accountName = useCallback(
    (id: string) => accounts.find((a) => a.id === id)?.name ?? id,
    [accounts],
  );

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/crm/leads/${lead.id}/convert-preview`, { cache: 'no-store' }),
        fetch('/api/crm/contacts', { cache: 'no-store' }).catch(() => null),
      ]);
      if (!pRes.ok) { setErr('Could not load the conversion preview.'); return; }
      const p = (await pRes.json()) as Preview;
      setPreview(p);
      // Default to LINK only on a strong (EXACT) match; otherwise create fresh.
      setAccountMode(p.account.best === 'EXACT' ? 'link' : 'create');
      setContactMode(p.contact.best === 'EXACT' ? 'link' : 'create');
      setTitle(lead.companyName ? `${lead.companyName} — ${lead.name}` : lead.name);
      if (cRes?.ok) {
        const cs = (await cRes.json().catch(() => [])) as Array<{ id: string; name: string; accountName: string | null }>;
        setContactNames(Object.fromEntries(cs.map((c) => [c.id, c.accountName ? `${c.name} · ${c.accountName}` : c.name])));
      }
    } catch {
      setErr('CRM API unreachable.');
    } finally {
      setLoading(false);
    }
  }, [lead]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  const submit = async () => {
    if (busy || !preview) return;
    setBusy(true); setErr(null);
    const accMatch = preview.account.matches[0];
    const conMatch = preview.contact.matches[0];
    const body: Record<string, unknown> = {
      title: title.trim() || undefined,
      value: value ? Number(value) : undefined,
      requiresTender: requiresTender === 'true',
      closeDate: closeDate || undefined,
    };
    // Account: link to the match, or force-create a new one when a match exists but was declined.
    if (accountMode === 'link' && accMatch) body.accountId = accMatch.id;
    else if (accMatch) body.createNewAccount = true;
    // Contact: same shape.
    if (contactMode === 'link' && conMatch) body.contactId = conMatch.id;
    else if (conMatch) body.createNewContact = true;

    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Convert failed'); return; }
      setOpen(false);
      onDone();
    } catch {
      setErr('CRM API unreachable.');
    } finally {
      setBusy(false);
    }
  };

  const ChoiceCard = ({
    kind, res, mode, setMode, createLabel, nameOf,
  }: {
    kind: string; res: Resolution; mode: 'link' | 'create'; setMode: (m: 'link' | 'create') => void;
    createLabel: string; nameOf: (id: string) => string;
  }) => {
    const m = res.matches[0];
    return (
      <div style={st.section}>
        <div style={st.sectionTitle}>{kind}</div>
        {m ? (
          <label style={{ ...st.choice, ...(mode === 'link' ? st.choiceOn : {}) }}>
            <input type="radio" checked={mode === 'link'} onChange={() => setMode('link')} />
            <span style={{ flex: 1 }}>
              <b>Link to {nameOf(m.id)}</b>
              <span style={{ ...st.badge, color: CONF_COLOR[m.confidence], borderColor: CONF_COLOR[m.confidence] }}>{m.confidence} match</span>
              {m.reasons.length > 0 && <span style={st.reasons}> — {m.reasons.join(', ')}</span>}
            </span>
          </label>
        ) : (
          <p style={st.noMatch}>No possible duplicate found.</p>
        )}
        <label style={{ ...st.choice, ...(mode === 'create' ? st.choiceOn : {}) }}>
          <input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} />
          <span>{createLabel}</span>
        </label>
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        style={{ ...st.trigger }}
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Qualify &amp; Convert →
      </button>

      {open && (
        <>
          <div className="drawer-overlay" onClick={() => !busy && setOpen(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Qualify and convert lead">
            <div className="drawer-head">
              <div>
                <h2 className="drawer-title">Qualify &amp; Convert</h2>
                <p className="drawer-sub">
                  Link {lead.name} to an Account and Primary Contact, then open the Opportunity.
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => !busy && setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="drawer-body">
              {loading && <p style={{ color: 'var(--muted)' }}>Checking for existing Account / Contact…</p>}
              {err && <div className="drawer-error">{err}</div>}

              {preview?.alreadyConverted && (
                <div className="fe-warning">This lead is already converted — converting again is a no-op replay.</div>
              )}

              {preview && !loading && (
                <>
                  {/* 1 — Account */}
                  <ChoiceCard
                    kind="1 · Account"
                    res={preview.account}
                    mode={accountMode}
                    setMode={setAccountMode}
                    createLabel={`Create new account "${lead.companyName ?? lead.name}"`}
                    nameOf={accountName}
                  />

                  {/* 2 — Primary Contact */}
                  <ChoiceCard
                    kind="2 · Primary Contact"
                    res={preview.contact}
                    mode={contactMode}
                    setMode={setContactMode}
                    createLabel={`Create new contact "${lead.name}" (primary)`}
                    nameOf={(id) => contactNames[id] ?? id}
                  />

                  {/* 3 — Opportunity */}
                  <div style={st.section}>
                    <div style={st.sectionTitle}>3 · Opportunity</div>
                    <div style={st.grid}>
                      <label style={{ ...st.field, gridColumn: '1 / -1' }}>
                        <span style={st.lbl}>Title</span>
                        <input style={st.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title" />
                      </label>
                      <label style={st.field}>
                        <span style={st.lbl}>Value (AED)</span>
                        <input style={st.input} type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
                      </label>
                      <label style={st.field}>
                        <span style={st.lbl}>Expected close</span>
                        <input style={st.input} type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
                      </label>
                      <label style={{ ...st.field, gridColumn: '1 / -1' }}>
                        <span style={st.lbl}>Path after winning</span>
                        <select style={st.input} value={requiresTender} onChange={(e) => setRequiresTender(e.target.value)}>
                          <option value="true">Tender / estimation</option>
                          <option value="false">Direct sale (no tender)</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="drawer-foot">
              <button type="button" className="btn" onClick={() => !busy && setOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || loading || !preview}>
                {busy ? 'Converting…' : 'Convert to Opportunity'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const st: Record<string, CSSProperties> = {
  trigger: { border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--accent)', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 },
  choice: { display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, cursor: 'pointer', fontSize: 13 },
  choiceOn: { borderColor: 'var(--accent)', background: 'var(--panel-2)' },
  badge: { marginLeft: 8, fontSize: 10.5, fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: 0.4 },
  reasons: { color: 'var(--muted)', fontSize: 12 },
  noMatch: { color: 'var(--muted)', fontSize: 12.5, margin: '0 0 6px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  lbl: { fontSize: 11, color: 'var(--muted)' },
  input: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', padding: '7px 10px', fontSize: 13, outline: 'none' },
};
