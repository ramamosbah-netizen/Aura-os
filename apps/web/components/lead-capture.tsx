'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ELV_SECTORS, ELV_SYSTEMS, PROJECT_STAGES, elvSystemLabel, type ElvSystem } from '@aura/shared';
import { UI_Z_INDEX } from '@/lib/ui-z-index';

// + New Lead — quick capture with non-blocking duplicate detection. The match is computed by the
// BACKEND (GET /api/crm/leads/duplicate-check), which runs the same `resolveIdentity` engine used at
// conversion — React only DISPLAYS the result: "Possible duplicate → Open existing / Create anyway".
// It never blocks; a similar company name alone is not proof.

interface DupMatch { id: string; name: string; confidence: string; reasons: string[] }
interface DupGroup { best: string; matches: DupMatch[] }
interface DupPreview { account: DupGroup; contact: DupGroup; lead: DupGroup }

interface Shown { id: string; label: string; type: 'Customer' | 'Contact' | 'Lead'; href: string; reason: string }
export interface CapturedLeadRow {
  id: string; name: string; companyName: string | null; email: string | null; phone: string | null;
  status: string; source: string | null; assignedTo: string | null; nextActivityDue: string | null;
  convertedOpportunityId: string | null; createdAt: string;
}

const digits = (s: string): string => s.replace(/\D/g, '');
const norm = (s: string): string => s.trim().toLowerCase();

export default function LeadCapture({ onSaved, buttonLabel = '+ New Lead' }: { onSaved: (lead: CapturedLeadRow) => void; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyName: '', name: '', phone: '', email: '', requirement: '', source: 'website',
    projectName: '', projectLocation: '', systems: [] as ElvSystem[], sector: '', projectStage: '',
    expectedTimeline: '', estimatedValue: '', consultant: '', mainContractor: '',
  });
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

  const set = (k: Exclude<keyof typeof form, 'systems'>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleSystem = (system: ElvSystem): void => setForm((f) => ({
    ...f,
    systems: f.systems.includes(system) ? f.systems.filter((s) => s !== system) : [...f.systems, system],
  }));

  async function save(): Promise<void> {
    if (!form.name.trim()) { setErr('A contact name is required.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch('/api/crm/leads', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), companyName: form.companyName.trim() || null, phone: form.phone.trim() || null,
          email: form.email.trim() || null, requirement: form.requirement.trim() || null, source: form.source,
          projectName: form.projectName.trim() || null, projectLocation: form.projectLocation.trim() || null,
          systems: form.systems.length ? form.systems : null, sector: form.sector || null,
          projectStage: form.projectStage || null, expectedTimeline: form.expectedTimeline.trim() || null,
          estimatedValue: form.estimatedValue.trim() ? Number(form.estimatedValue) : null,
          consultant: form.consultant.trim() || null, mainContractor: form.mainContractor.trim() || null,
        }),
      });
      const saved = (await res.json().catch(() => ({}))) as CapturedLeadRow & { message?: string; error?: string };
      if (!res.ok) { setErr(saved.message ?? saved.error ?? 'Could not save the lead.'); return; }
      setForm({
        companyName: '', name: '', phone: '', email: '', requirement: '', source: 'website',
        projectName: '', projectLocation: '', systems: [], sector: '', projectStage: '',
        expectedTimeline: '', estimatedValue: '', consultant: '', mainContractor: '',
      });
      setDup(null);
      setOpen(false);
      onSaved(saved);
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
                <p style={st.drawerSub}>Record the enquiry once. It is assigned to you and the same job context follows it into qualification and Pre-Sales.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={st.closeBtn} aria-label="Close">✕</button>
            </div>

            <div style={st.grid}>
              <div style={st.sectionTitle}>Customer</div>
              <Field label="Company / customer" span2><input value={form.companyName} onChange={set('companyName')} placeholder="e.g. ABC Properties" style={st.input} /></Field>
              <Field label="Contact person" span2 required><input value={form.name} onChange={set('name')} placeholder="e.g. Ahmed" style={st.input} /></Field>
              <Field label="Phone"><input value={form.phone} onChange={set('phone')} placeholder="+971 …" style={st.input} /></Field>
              <Field label="Email"><input value={form.email} onChange={set('email')} placeholder="name@company.com" style={st.input} /></Field>
              <Field label="Interest / requirement" span2><textarea value={form.requirement} onChange={set('requirement')} placeholder="e.g. CCTV + Access Control for a new villa" style={{ ...st.input, minHeight: 60, resize: 'vertical' }} /></Field>
              <Field label="Source"><select value={form.source} onChange={set('source')} style={st.input}>{['website', 'referral', 'campaign', 'cold_call', 'other'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
              <div style={st.sectionTitle}>Job context</div>
              <Field label="Project / site name"><input value={form.projectName} onChange={set('projectName')} placeholder="e.g. Marina Tower" style={st.input} /></Field>
              <Field label="Location"><input value={form.projectLocation} onChange={set('projectLocation')} placeholder="Dubai / plot / building" style={st.input} /></Field>
              <Field label="Systems in scope" span2>
                <div style={st.systemGrid}>
                  {ELV_SYSTEMS.map((system) => (
                    <label key={system} style={{ ...st.systemChip, ...(form.systems.includes(system) ? st.systemChipOn : {}) }}>
                      <input type="checkbox" checked={form.systems.includes(system)} onChange={() => toggleSystem(system)} />
                      {elvSystemLabel(system)}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Sector"><select value={form.sector} onChange={set('sector')} style={st.input}><option value="">Select sector</option>{ELV_SECTORS.map((v) => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></Field>
              <Field label="Project stage"><select value={form.projectStage} onChange={set('projectStage')} style={st.input}><option value="">Select stage</option>{PROJECT_STAGES.map((v) => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></Field>
              <Field label="Expected timeline"><input value={form.expectedTimeline} onChange={set('expectedTimeline')} placeholder="e.g. Offer due in 10 days" style={st.input} /></Field>
              <Field label="Estimated value (AED)"><input type="number" min="0" value={form.estimatedValue} onChange={set('estimatedValue')} placeholder="Optional" style={st.input} /></Field>
              <Field label="Consultant"><input value={form.consultant} onChange={set('consultant')} placeholder="If known" style={st.input} /></Field>
              <Field label="Main contractor"><input value={form.mainContractor} onChange={set('mainContractor')} placeholder="If known" style={st.input} /></Field>
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
  newBtn: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--accent-ink)', padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: UI_Z_INDEX.drawer, display: 'flex', justifyContent: 'flex-end' },
  drawer: { width: 'min(640px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--panel)', borderLeft: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  drawerHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  drawerTitle: { margin: 0, fontSize: 18 },
  drawerSub: { margin: '4px 0 0', color: 'var(--muted)', fontSize: 12, maxWidth: 340 },
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  sectionTitle: { gridColumn: '1 / -1', color: 'var(--text)', fontSize: 13, fontWeight: 800, paddingTop: 4, borderBottom: '1px solid var(--border)', paddingBottom: 6 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 11, color: 'var(--muted)', fontWeight: 600 },
  input: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  systemGrid: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  systemChip: { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border)', borderRadius: 999, padding: '5px 8px', fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' },
  systemChipOn: { borderColor: 'var(--accent)', color: 'var(--text)', background: 'color-mix(in srgb, var(--accent) 12%, var(--panel))' },
  dupBox: { border: '1px solid var(--warn)', borderRadius: 10, background: 'color-mix(in srgb, var(--warn) 8%, var(--panel))', padding: 12 },
  dupTitle: { fontSize: 12.5, fontWeight: 800, color: 'var(--warn)', marginBottom: 8 },
  dupRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5, borderTop: '1px solid var(--border)' },
  dupType: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 6px' },
  dupReason: { color: 'var(--muted)' },
  dupLink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' },
  dupHint: { color: 'var(--muted)', fontSize: 11, margin: '8px 0 0' },
  err: { border: '1px solid var(--bad)', color: 'var(--bad)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 8 },
  ghost: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', padding: '8px 14px', fontSize: 13, cursor: 'pointer' },
  save: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--accent-ink)', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
};
