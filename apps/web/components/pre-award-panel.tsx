'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

// Pre-award discovery (R4) — capture Requirements and build a structured Solution Scope on the
// opportunity, then generate a GOVERNED quotation from an approved scope (feeds R3). Mounted on Opp 360.

interface Requirement { id: string; title: string; detail: string | null; priority: string; status: string }
interface ScopeLine { id: string; discipline: string | null; description: string; unit: string; quantity: number; unitPrice: number; lineTotal: number }
interface SolutionScope { id: string; title: string; status: string; lines: ScopeLine[]; total: number; generatedQuotationId: string | null }
interface NewLine { discipline: string; description: string; unit: string; quantity: string; unitPrice: string }

const aed = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const blankLine = (): NewLine => ({ discipline: '', description: '', unit: 'no', quantity: '', unitPrice: '' });

export default function PreAwardPanel({ opportunityId }: { opportunityId: string }) {
  const [reqs, setReqs] = useState<Requirement[] | null>(null);
  const [scopes, setScopes] = useState<SolutionScope[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [rForm, setRForm] = useState({ title: '', priority: 'should' });
  const [scopeTitle, setScopeTitle] = useState('');
  const [draftLines, setDraftLines] = useState<NewLine[]>([blankLine()]);
  const [customer, setCustomer] = useState<Record<string, string>>({});

  const base = `/api/crm/opportunities/${opportunityId}`;
  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      fetch(`${base}/requirements`, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : [])),
      fetch(`${base}/scopes`, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : [])),
    ]);
    setReqs(Array.isArray(r) ? r : []);
    setScopes(Array.isArray(s) ? s : []);
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const post = async (path: string, body?: unknown): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST', headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.ok) await load();
      return res.ok;
    } finally { setBusy(false); }
  };

  const addRequirement = async () => {
    if (!rForm.title.trim()) return;
    if (await post('/requirements', rForm)) setRForm({ title: '', priority: 'should' });
  };

  const createScope = async () => {
    const lines = draftLines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l) => ({ discipline: l.discipline || undefined, description: l.description, unit: l.unit || 'no', quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0 }));
    if (!scopeTitle.trim() || lines.length === 0) return;
    if (await post('/scopes', { title: scopeTitle, lines })) { setScopeTitle(''); setDraftLines([blankLine()]); }
  };

  if (!reqs || !scopes) return <section style={st.panel}><p style={st.empty}>Loading pre-award discovery…</p></section>;

  return (
    <section style={st.panel}>
      <h2 style={st.h2}>Pre-Award Discovery</h2>

      {/* Requirements */}
      <div style={st.block}>
        <h3 style={st.h3}>Requirements</h3>
        {reqs.length > 0 && (
          <ul style={st.list}>
            {reqs.map((r) => (
              <li key={r.id} style={st.row}>
                <span style={st.prio(r.priority)}>{r.priority}</span>
                <span style={st.name}>{r.title}</span>
                {r.detail && <span style={st.meta}>{r.detail}</span>}
              </li>
            ))}
          </ul>
        )}
        <div style={st.form}>
          <input style={st.input} placeholder="What does the customer need?" value={rForm.title} onChange={(e) => setRForm({ ...rForm, title: e.target.value })} />
          <select style={st.sel} value={rForm.priority} onChange={(e) => setRForm({ ...rForm, priority: e.target.value })}>
            <option value="must">must</option><option value="should">should</option><option value="could">could</option>
          </select>
          <button style={st.btn} disabled={busy || !rForm.title.trim()} onClick={() => void addRequirement()}>Add</button>
        </div>
      </div>

      {/* Solution scopes */}
      <div style={st.block}>
        <h3 style={st.h3}>Solution Scopes</h3>
        {scopes.map((s) => (
          <div key={s.id} style={st.scopeCard}>
            <div style={st.scopeHead}>
              <span style={st.name}>{s.title}</span>
              <span style={{ ...st.statusTag, color: s.status === 'approved' ? '#16a34a' : 'var(--muted)' }}>{s.status}</span>
              <span style={st.total}>AED {aed(s.total)}</span>
            </div>
            {s.lines.length > 0 && (
              <ul style={st.lineList}>
                {s.lines.map((l) => (
                  <li key={l.id} style={st.lineRow}>
                    {l.discipline && <span style={st.disc}>{l.discipline}</span>}
                    <span>{l.description}</span>
                    <span style={st.meta}>{l.quantity} {l.unit} × {aed(l.unitPrice)} = <b>{aed(l.lineTotal)}</b></span>
                  </li>
                ))}
              </ul>
            )}
            <div style={st.scopeActions}>
              {s.status === 'draft' && <button style={st.btn} disabled={busy} onClick={() => void post(`/scopes/${s.id}/approve`)}>Approve ✓</button>}
              {s.status === 'approved' && !s.generatedQuotationId && (
                <>
                  <input style={st.inputSm} placeholder="Customer name" value={customer[s.id] ?? ''} onChange={(e) => setCustomer({ ...customer, [s.id]: e.target.value })} />
                  <button style={st.btnAccent} disabled={busy || !(customer[s.id] ?? '').trim()} onClick={() => void post(`/scopes/${s.id}/generate-quotation`, { customerName: customer[s.id] })}>→ Generate quotation</button>
                </>
              )}
              {s.generatedQuotationId && <a href="/crm/quotations" style={st.quoteLink}>📄 Quotation generated →</a>}
            </div>
          </div>
        ))}

        {/* New scope builder */}
        <div style={st.builder}>
          <input style={st.input} placeholder="New scope title (e.g. Tower ELV package)" value={scopeTitle} onChange={(e) => setScopeTitle(e.target.value)} />
          {draftLines.map((l, i) => (
            <div key={i} style={st.lineForm}>
              <input style={st.discIn} placeholder="Discipline" value={l.discipline} onChange={(e) => setDraftLines(draftLines.map((x, j) => (j === i ? { ...x, discipline: e.target.value } : x)))} />
              <input style={st.input} placeholder="Description" value={l.description} onChange={(e) => setDraftLines(draftLines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <input style={st.qtyIn} type="number" placeholder="Qty" value={l.quantity} onChange={(e) => setDraftLines(draftLines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
              <input style={st.qtyIn} placeholder="Unit" value={l.unit} onChange={(e) => setDraftLines(draftLines.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
              <input style={st.qtyIn} type="number" placeholder="Rate" value={l.unitPrice} onChange={(e) => setDraftLines(draftLines.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} />
            </div>
          ))}
          <div style={st.form}>
            <button style={st.btnGhost} onClick={() => setDraftLines([...draftLines, blankLine()])}>+ line</button>
            <button style={st.btnAccent} disabled={busy || !scopeTitle.trim()} onClick={() => void createScope()}>Create scope</button>
          </div>
        </div>
      </div>
    </section>
  );
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', padding: 18, marginTop: 18 } as CSSProperties,
  h2: { fontSize: 17, margin: '0 0 12px', letterSpacing: -0.3 } as CSSProperties,
  block: { paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' } as CSSProperties,
  h3: { fontSize: 14, margin: '0 0 8px', fontWeight: 600 } as CSSProperties,
  list: { listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 } as CSSProperties,
  name: { fontWeight: 600 } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  prio: (p: string): CSSProperties => ({ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)', color: p === 'must' ? '#dc2626' : p === 'should' ? '#d97706' : 'var(--muted)' }),
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 } as CSSProperties,
  input: { flex: '1 1 200px', minWidth: 140, padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  inputSm: { flex: '0 1 160px', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  sel: { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  btn: { fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--fg)', background: 'var(--fg)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  btnAccent: { fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer' } as CSSProperties,
  btnGhost: { fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' } as CSSProperties,
  scopeCard: { border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--panel-2)' } as CSSProperties,
  scopeHead: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } as CSSProperties,
  statusTag: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 700 } as CSSProperties,
  total: { marginLeft: 'auto', fontWeight: 700, fontSize: 13 } as CSSProperties,
  lineList: { listStyle: 'none', margin: '8px 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  lineRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 } as CSSProperties,
  disc: { fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--panel)', border: '1px solid var(--border)', textTransform: 'uppercase', color: 'var(--muted)' } as CSSProperties,
  scopeActions: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 } as CSSProperties,
  quoteLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600 } as CSSProperties,
  builder: { border: '1px dashed var(--border)', borderRadius: 8, padding: 10, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  lineForm: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  discIn: { flex: '0 1 110px', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12 } as CSSProperties,
  qtyIn: { flex: '0 1 70px', width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12 } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, margin: 0 } as CSSProperties,
};
