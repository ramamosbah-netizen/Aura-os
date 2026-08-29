'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { UI_Z_INDEX } from '@/lib/ui-z-index';

// + New Lead — quick capture with non-blocking duplicate detection. The match is computed by the
// BACKEND (GET /api/crm/leads/duplicate-check), which runs the same `resolveIdentity` engine used at
// conversion — React only DISPLAYS the result: "Possible duplicate → Open existing / Create anyway".
// It never blocks; a similar company name alone is not proof.

interface DupMatch { id: string; name: string; confidence: string; reasons: string[] }
interface DupGroup { best: string; matches: DupMatch[] }
interface DupPreview { account: DupGroup; contact: DupGroup; lead: DupGroup }

interface Shown { id: string; label: string; type: 'Customer' | 'Contact' | 'Lead'; href: string; reason: string }

const digits = (s: string): string => s.replace(/\D/g, '');
const norm = (s: string): string => s.trim().toLowerCase();

export default function LeadCapture({ onSaved, buttonLabel = '+ New Lead' }: { onSaved: () => void; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ companyName: '', name: '', phone: '', email: '', requirement: '', source: 'website', assignedTo: '' });
  const [dup, setDup] = useState<DupPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Ask the backend for possible duplicates as the identifying fields are typed (debounced).
  useEffect(() => {
    const { name, companyName, email, phone } = form;
    const meaningful = digits(phone).length >= 6 || norm(email).length > 3 || norm(companyName).length >= 3 || norm(name).length >= 3;
    if (!open || !meaningful) { setDup(null); return; }
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (name) qs.set('name', name);
      if (companyName) qs.set('companyName', companyName);
      if (email) qs.set('email', email);
      if (phone) qs.set('phone', phone);
      void fetch(`/api/crm/leads/duplicate-check?${qs.toString()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: DupPreview | null) => setDup(d))
        .catch(() => setDup(null));
    }, 400);
    return () => clearTimeout(t);
  }, [open, form]);

  const matches = useMemo<Shown[]>(() => {
    if (!dup) return [];
    const out: Shown[] = [];
    const add = (g: DupGroup | undefined, type: Shown['type'], base: string): void => {
      (g?.matches ?? []).forEach((m) => out.push({ id: m.id, label: m.name || type, type, href: `${base}/${m.id}`, reason: m.reasons?.[0] ?? m.confidence.toLowerCase() }));
    };
    add(dup.account, 'Customer', '/crm/accounts');
    add(dup.contact, 'Contact', '/crm/contacts');
    add(dup.lead, 'Lead', '/crm/leads');
    const seen = new Set<string>();
    return out.filter((m) => { const k = `${m.type}:${m.id}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  }, [dup]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(): Promise<void> {
    if (!form.name.trim()) { setErr('A contact name is required.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch('/api/crm/leads', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), companyName: form.companyName.trim() || null, phone: form.phone.trim() || null,
          email: form.email.trim() || null, requirement: form.requirement.trim() || null, source: form.source,
          assignedTo: form.assignedTo.trim() || null,
        }),
      });
      if (!res.ok) { const e = (await res.json().catch(() => ({}))) as { message?: string; error?: string }; setErr(e.message ?? e.error ?? 'Could not save the lead.'); return; }
      setForm({ companyName: '', name: '', phone: '', email: '', requirement: '', source: 'website', assignedTo: '' });
      setDup(null);
      setOpen(false);
      onSaved();
    } catch { setErr('Could not reach the server — the lead was not saved.'); } finally { setSaving(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={st.newBtn}>{buttonLabel}</button>
      {open && (
        <div style={st.overlay} onClick={() => !saving && setOpen(false)}>
          <div style={st.drawer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New lead">
            <div style={st.drawerHead}>
              <div>
                <h3 style={st.drawerTitle}>New Lead</h3>
                <p style={st.drawerSub}>Quick capture — value, close date and quotation come later, after qualification.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={st.closeBtn} aria-label="Close">✕</button>
            </div>

            <div style={st.grid}>
              <Field label="Company / customer" span2><input value={form.companyName} onChange={set('companyName')} placeholder="e.g. ABC Properties" style={st.input} /></Field>
              <Field label="Contact person" span2 required><input value={form.name} onChange={set('name')} placeholder="e.g. Ahmed" style={st.input} /></Field>
              <Field label="Phone"><input value={form.phone} onChange={set('phone')} placeholder="+971 …" style={st.input} /></Field>
              <Field label="Email"><input value={form.email} onChange={set('email')} placeholder="name@company.com" style={st.input} /></Field>
              <Field label="Interest / requirement" span2><textarea value={form.requirement} onChange={set('requirement')} placeholder="e.g. CCTV + Access Control for a new villa" style={{ ...st.input, minHeight: 60, resize: 'vertical' }} /></Field>
              <Field label="Source"><select value={form.source} onChange={set('source')} style={st.input}>{['website', 'referral', 'campaign', 'cold_call', 'other'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
              <Field label="Owner"><input value={form.assignedTo} onChange={set('assignedTo')} placeholder="e.g. u-sales" style={st.input} /></Field>
            </div>

            {matches.length > 0 && (
              <div style={st.dupBox}>
                <div style={st.dupTitle}>⚠ Possible duplicate — check before creating</div>
                {matches.map((m) => (
                  <div key={`${m.type}:${m.id}`} style={st.dupRow}>
                    <span><b>{m.label}</b> <span style={st.dupType}>{m.type}</span> <span style={st.dupReason}>· {m.reason}</span></span>
                    <a href={m.href} style={st.dupLink}>Open existing →</a>
                  </div>
                ))}
                <p style={st.dupHint}>A similar name alone is not proof — you can still create this lead.</p>
              </div>
            )}

            {err && <div style={st.err}>{err}</div>}

            <div style={st.actions}>
              <button type="button" onClick={() => setOpen(false)} style={st.ghost} disabled={saving}>Cancel</button>
              <button type="button" onClick={() => void save()} style={st.save} disabled={saving}>
                {saving ? 'Saving…' : matches.length > 0 ? 'Create anyway' : 'Save lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, span2, required, children }: { label: string; span2?: boolean; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ ...st.field, ...(span2 ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={st.fieldLabel}>{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  );
}

const st: Record<string, CSSProperties> = {
  newBtn: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: UI_Z_INDEX.drawer, display: 'flex', justifyContent: 'flex-end' },
  drawer: { width: 'min(460px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--panel)', borderLeft: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  drawerHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  drawerTitle: { margin: 0, fontSize: 18 },
  drawerSub: { margin: '4px 0 0', color: 'var(--muted)', fontSize: 12, maxWidth: 340 },
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 11, color: 'var(--muted)', fontWeight: 600 },
  input: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  dupBox: { border: '1px solid #d99a42', borderRadius: 10, background: 'color-mix(in srgb, #d99a42 8%, var(--panel))', padding: 12 },
  dupTitle: { fontSize: 12.5, fontWeight: 800, color: '#d99a42', marginBottom: 8 },
  dupRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5, borderTop: '1px solid var(--border)' },
  dupType: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 6px' },
  dupReason: { color: 'var(--muted)' },
  dupLink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' },
  dupHint: { color: 'var(--muted)', fontSize: 11, margin: '8px 0 0' },
  err: { border: '1px solid var(--bad)', color: 'var(--bad)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 8 },
  ghost: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', padding: '8px 14px', fontSize: 13, cursor: 'pointer' },
  save: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
};
