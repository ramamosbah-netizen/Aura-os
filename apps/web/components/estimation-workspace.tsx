'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';

// Estimation Workspace (Slice 6B) — a STRUCTURED cost estimator, opened in its own tab from the
// Commercial panel after the scope is approved. It answers ONE question: what will it cost us?
//
// The boundary from 6A is load-bearing here: there is deliberately NO profit, margin, markup, discount,
// selling price or quotation field anywhere in this screen. Those are the Pricing Workspace (Slice 7).
// The estimator enters resources per line; the ENGINE computes every figure; estimatedCost is derived
// server-side from the saved build-ups, never a number typed on top.

interface ManpowerBlock { count: number; hours: number; rate: number }
interface ResourceBreakdown {
  supplyUnitPrice: number; wastagePercent: number; accessories: number;
  technician: ManpowerBlock; engineer: ManpowerBlock; projectManager: ManpowerBlock;
  transport: number; equipmentRent: number; subcontract: number; otherDirect: number;
}
interface BasisLine { lineId: string; description: string; unit: string; quantity: number | null; sourceLineId: string }
interface BuildUp {
  basisLineId: string; resources: ResourceBreakdown | null;
  indirectPercent: number; overheadPercent: number; riskPercent: number;
  directCost: number; indirectAmount: number; overheadAmount: number; riskAmount: number; sellingRate: number;
}
interface EstimateHead { id: string; revisionNo: number; status: string; totals: { totalDirectCost?: number; estimatedCost?: number; lineCount?: number }; approvedAt: string | null; frozenAt: string | null }
export interface WorkspaceView { packageId: string; estimate: EstimateHead; buildUps: BuildUp[]; basisLines: BasisLine[]; editable: boolean }

const aed = (n: number | undefined): string => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mb = (): ManpowerBlock => ({ count: 0, hours: 0, rate: 0 });
const emptyResources = (): ResourceBreakdown => ({ supplyUnitPrice: 0, wastagePercent: 0, accessories: 0, technician: mb(), engineer: mb(), projectManager: mb(), transport: 0, equipmentRent: 0, subcontract: 0, otherDirect: 0 });

/** A per-line editable row: the resource sheet + the cost-side loadings, all as strings for the inputs. */
interface LineForm {
  resources: ResourceBreakdown;
  indirectPercent: string; overheadPercent: string; riskPercent: string;
}

function toForm(bu: BuildUp | undefined): LineForm {
  return {
    resources: bu?.resources ? { ...emptyResources(), ...bu.resources, technician: { ...mb(), ...bu.resources.technician }, engineer: { ...mb(), ...bu.resources.engineer }, projectManager: { ...mb(), ...bu.resources.projectManager } } : emptyResources(),
    indirectPercent: String(bu?.indirectPercent ?? 0), overheadPercent: String(bu?.overheadPercent ?? 0), riskPercent: String(bu?.riskPercent ?? 0),
  };
}

export default function EstimationWorkspace({ opportunityId, initial }: { opportunityId: string; initial: WorkspaceView }) {
  const [view, setView] = useState<WorkspaceView>(initial);
  const [forms, setForms] = useState<Record<string, LineForm>>(() => {
    const byLine = new Map(initial.buildUps.map((b) => [b.basisLineId, b]));
    return Object.fromEntries(initial.basisLines.map((l) => [l.lineId, toForm(byLine.get(l.lineId))]));
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const base = `/api/crm/opportunities/${opportunityId}/pre-award-package`;
  const e = view.estimate;
  const editable = view.editable;

  const reload = useCallback(async () => {
    const res = await fetch(`${base}/estimate/${e.id}`, { cache: 'no-store' });
    if (res.ok) {
      const v: WorkspaceView = await res.json();
      setView(v);
      const byLine = new Map(v.buildUps.map((b) => [b.basisLineId, b]));
      setForms(Object.fromEntries(v.basisLines.map((l) => [l.lineId, toForm(byLine.get(l.lineId))])));
    }
  }, [base, e.id]);

  const buByLine = useMemo(() => new Map(view.buildUps.map((b) => [b.basisLineId, b])), [view.buildUps]);

  const setNum = (lineId: string, path: string, value: string) => {
    setForms((prev) => {
      const f = { ...prev[lineId] };
      const r = { ...f.resources, technician: { ...f.resources.technician }, engineer: { ...f.resources.engineer }, projectManager: { ...f.resources.projectManager } };
      const n = Number(value) || 0;
      if (path === 'indirectPercent' || path === 'overheadPercent' || path === 'riskPercent') { (f as unknown as Record<string, string>)[path] = value; return { ...prev, [lineId]: f }; }
      const [grp, sub] = path.split('.');
      if (sub) (r as unknown as Record<string, ManpowerBlock>)[grp][sub as keyof ManpowerBlock] = n;
      else (r as unknown as Record<string, number>)[grp] = n;
      f.resources = r;
      return { ...prev, [lineId]: f };
    });
  };

  const save = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const buildUps = view.basisLines.map((l) => {
        const f = forms[l.lineId];
        return { basisLineId: l.lineId, resources: f.resources, indirectPercent: Number(f.indirectPercent) || 0, overheadPercent: Number(f.overheadPercent) || 0, riskPercent: Number(f.riskPercent) || 0 };
      });
      const res = await fetch(`${base}/estimate/${e.id}/build-ups`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ buildUps }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(typeof j?.message === 'string' ? j.message : `Save failed (${res.status})`); return; }
      await reload();
    } finally { setBusy(false); }
  }, [base, e.id, forms, view.basisLines, reload]);

  const cmd = useCallback(async (path: string) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}${path}`, { method: 'POST' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(typeof j?.message === 'string' ? j.message : `Request failed (${res.status})`); return; }
      await reload();
    } finally { setBusy(false); }
  }, [base, reload]);

  const totals = e.totals;

  return (
    <div style={st.wrap}>
      <header style={st.head}>
        <div>
          <div style={st.crumb}>Estimation Workspace · package {view.packageId.slice(0, 8)}</div>
          <h1 style={st.h1}>Estimate E-{String(e.revisionNo).padStart(3, '0')}</h1>
        </div>
        <div style={st.headRight}>
          <StatusTag status={e.status} />
          <span style={st.costChip}>Estimated cost <b>AED {aed(totals.estimatedCost)}</b></span>
        </div>
      </header>

      <p style={st.note}>Cost only — what it costs us to deliver. Margin, discount and the selling price are decided in Pricing, not here.</p>
      {err && <p style={st.err}>{err}</p>}
      {!editable && <p style={st.frozenBanner}>This estimate is <b>{e.status}</b> and read-only. To change it, create a new revision.</p>}

      {view.basisLines.map((l) => {
        const f = forms[l.lineId]; const bu = buByLine.get(l.lineId);
        if (!f) return null;
        return (
          <section key={l.lineId} style={st.lineCard}>
            <div style={st.lineHead}>
              <span style={st.lineDesc}>{l.description}</span>
              <span style={st.lineQty}>Qty {l.quantity ?? '—'} {l.unit}</span>
              <span style={st.lineCost}>line cost/unit AED {aed(bu ? bu.directCost + bu.indirectAmount + bu.overheadAmount + bu.riskAmount : 0)}</span>
            </div>

            <div style={st.groups}>
              <Group title="Materials">
                <Field label="Supply unit price" v={f.resources.supplyUnitPrice} on={(x) => setNum(l.lineId, 'supplyUnitPrice', x)} ro={!editable} />
                <Field label="Wastage %" v={f.resources.wastagePercent} on={(x) => setNum(l.lineId, 'wastagePercent', x)} ro={!editable} />
                <Field label="Accessories (line)" v={f.resources.accessories} on={(x) => setNum(l.lineId, 'accessories', x)} ro={!editable} />
              </Group>
              <Group title="Labour (line totals)">
                <Manpower label="Technician" b={f.resources.technician} on={(k, x) => setNum(l.lineId, `technician.${k}`, x)} ro={!editable} />
                <Manpower label="Engineer" b={f.resources.engineer} on={(k, x) => setNum(l.lineId, `engineer.${k}`, x)} ro={!editable} />
                <Manpower label="Project mgr" b={f.resources.projectManager} on={(k, x) => setNum(l.lineId, `projectManager.${k}`, x)} ro={!editable} />
              </Group>
              <Group title="Plant / Equipment">
                <Field label="Transport (line)" v={f.resources.transport} on={(x) => setNum(l.lineId, 'transport', x)} ro={!editable} />
                <Field label="Equipment rent (line)" v={f.resources.equipmentRent} on={(x) => setNum(l.lineId, 'equipmentRent', x)} ro={!editable} />
              </Group>
              <Group title="Subcontract / Other">
                <Field label="Subcontract (line)" v={f.resources.subcontract} on={(x) => setNum(l.lineId, 'subcontract', x)} ro={!editable} />
                <Field label="Other direct (line)" v={f.resources.otherDirect} on={(x) => setNum(l.lineId, 'otherDirect', x)} ro={!editable} />
              </Group>
              <Group title="Cost loadings %">
                <Field label="Indirect / prelims %" v={Number(f.indirectPercent)} on={(x) => setNum(l.lineId, 'indirectPercent', x)} ro={!editable} />
                <Field label="Delivery overhead %" v={Number(f.overheadPercent)} on={(x) => setNum(l.lineId, 'overheadPercent', x)} ro={!editable} />
                <Field label="Risk / contingency %" v={Number(f.riskPercent)} on={(x) => setNum(l.lineId, 'riskPercent', x)} ro={!editable} />
              </Group>
            </div>

            {bu && (
              <div style={st.lineBreak}>
                <Span k="Direct" v={bu.directCost} /><Span k="+ Indirect" v={bu.indirectAmount} /><Span k="+ Overhead" v={bu.overheadAmount} /><Span k="+ Risk" v={bu.riskAmount} />
                <Span k="= Est. cost/unit" v={bu.directCost + bu.indirectAmount + bu.overheadAmount + bu.riskAmount} strong />
              </div>
            )}
          </section>
        );
      })}

      <section style={st.summary}>
        <h2 style={st.h2}>Cost summary</h2>
        <div style={st.sumRow}><span>Direct cost</span><b>AED {aed(totals.totalDirectCost)}</b></div>
        <div style={st.sumRow}><span>+ Indirect / Overhead / Risk (in build-ups)</span><b>AED {aed((totals.estimatedCost ?? 0) - (totals.totalDirectCost ?? 0))}</b></div>
        <div style={st.sumTotal}><span>= ESTIMATED COST</span><b>AED {aed(totals.estimatedCost)}</b></div>
        <p style={st.derivedNote}>Derived from the resource build-ups above — not an entered figure.</p>
      </section>

      <footer style={st.footer}>
        {editable && <button style={st.btnAccent} disabled={busy} onClick={() => void save()}>Save draft</button>}
        {editable && e.status === 'draft' && <button style={st.btn} disabled={busy} onClick={() => void cmd(`/estimate/${e.id}/freeze`)}>Freeze estimate</button>}
        {e.status === 'frozen' && <button style={st.btn} disabled={busy} onClick={() => void cmd(`/estimate/${e.id}/approve`)}>Approve estimate ✓</button>}
        {e.status === 'approved' && (
          <a style={st.btnAccent} href={`/crm/opportunities/${opportunityId}`}>← Back to Commercial — then Open Pricing (Slice 7)</a>
        )}
      </footer>
      {e.status === 'approved' && <p style={st.note}>Estimate approved. The commercial decision (margin / markup / discount → selling price) happens in the Pricing Workspace, which reads this approved cost.</p>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={st.group}><div style={st.groupTitle}>{title}</div>{children}</div>;
}
function Field({ label, v, on, ro }: { label: string; v: number; on: (x: string) => void; ro: boolean }) {
  return <label style={st.field}><span style={st.fieldLabel}>{label}</span><input style={st.input} type="number" defaultValue={v} disabled={ro} onChange={(ev) => on(ev.target.value)} /></label>;
}
function Manpower({ label, b, on, ro }: { label: string; b: ManpowerBlock; on: (k: keyof ManpowerBlock, x: string) => void; ro: boolean }) {
  return (
    <div style={st.manpower}>
      <span style={st.fieldLabel}>{label}</span>
      <input style={st.inputS} type="number" defaultValue={b.count} disabled={ro} placeholder="count" onChange={(e) => on('count', e.target.value)} />
      <input style={st.inputS} type="number" defaultValue={b.hours} disabled={ro} placeholder="hours" onChange={(e) => on('hours', e.target.value)} />
      <input style={st.inputS} type="number" defaultValue={b.rate} disabled={ro} placeholder="rate" onChange={(e) => on('rate', e.target.value)} />
    </div>
  );
}
function Span({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return <span style={strong ? st.spanStrong : st.span}>{k} <b>AED {aed(v)}</b></span>;
}
function StatusTag({ status }: { status: string }) {
  const tone = status === 'approved' ? 'var(--good)' : status === 'frozen' ? 'var(--warn)' : 'var(--muted)';
  return <span style={{ ...st.status, color: tone, borderColor: tone }}>{status}</span>;
}

const st = {
  wrap: { maxWidth: 1100, margin: '0 auto', padding: 24 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 } as CSSProperties,
  crumb: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  h1: { fontSize: 22, margin: '2px 0 0' } as CSSProperties,
  headRight: { display: 'flex', gap: 10, alignItems: 'center' } as CSSProperties,
  costChip: { fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' } as CSSProperties,
  note: { fontSize: 12.5, color: 'var(--muted)', margin: '10px 0' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '8px 0' } as CSSProperties,
  frozenBanner: { fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' } as CSSProperties,
  lineCard: { border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12, background: 'var(--panel)' } as CSSProperties,
  lineHead: { display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 } as CSSProperties,
  lineDesc: { fontWeight: 700, fontSize: 14, flex: 1 } as CSSProperties,
  lineQty: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  lineCost: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  groups: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 } as CSSProperties,
  group: { border: '1px solid var(--border)', borderRadius: 8, padding: 10 } as CSSProperties,
  groupTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 8 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 7 } as CSSProperties,
  fieldLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  input: { fontSize: 13, padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' } as CSSProperties,
  inputS: { width: 62, fontSize: 12.5, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' } as CSSProperties,
  manpower: { display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' } as CSSProperties,
  lineBreak: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 12.5 } as CSSProperties,
  span: { color: 'var(--muted)' } as CSSProperties,
  spanStrong: { color: 'var(--text)', fontWeight: 700 } as CSSProperties,
  summary: { border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginTop: 8, background: 'var(--panel-2)' } as CSSProperties,
  h2: { fontSize: 15, margin: '0 0 10px' } as CSSProperties,
  sumRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '4px 0', color: 'var(--muted)' } as CSSProperties,
  sumTotal: { display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, padding: '8px 0 2px', borderTop: '1px solid var(--border)', marginTop: 6 } as CSSProperties,
  derivedNote: { fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 0' } as CSSProperties,
  footer: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 } as CSSProperties,
  btn: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
  btnAccent: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--panel)', cursor: 'pointer', textDecoration: 'none' } as CSSProperties,
  status: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, border: '1px solid', borderRadius: 6, padding: '2px 8px' } as CSSProperties,
};
