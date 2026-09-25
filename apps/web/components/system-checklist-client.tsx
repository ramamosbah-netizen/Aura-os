'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ELV_SYSTEMS, elvSystemLabel, type ElvSystem } from '@aura/shared';
import { useHydrated } from '@/lib/use-hydrated';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

/**
 * THE APPROVED SYSTEM CHECKLIST — Quality's side (TC-08 / TC-09).
 *
 * Two jobs, in the order the contract puts them:
 *   1. The tenant's System Template Library — one versioned template per canonical ELV system,
 *      written and published by Quality. It starts EMPTY: nothing here proposes a single point for
 *      any system, and a system with no template is shown as not ready.
 *   2. Each project's checklist — a published template adopted into the project as a revision,
 *      adapted, submitted, and approved by a QA/QC person OTHER than the one who prepared it. An
 *      approved revision is frozen; a change is the next revision, which applies to commissioning
 *      records bound after it.
 *
 * Every refusal is the API's — this screen shows its words and decides nothing itself.
 */

export interface ChecklistPoint {
  code?: string;
  activity: string;
  method?: string | null;
  acceptanceCriteria: string;
  mandatory?: boolean;
  pointType: string;
}
export interface TemplateCoverage { system: string; publishedVersion: number | null; templateId: string | null }
export interface ItpTemplate {
  id: string; system: string; version: number; title: string; status: 'draft' | 'published' | 'retired';
  points: ChecklistPoint[]; createdBy: string | null; publishedBy: string | null; publishedAt: string | null;
}
export interface SystemItp {
  id: string; projectId: string; reference: string; title: string; status: string; kind?: string;
  system: string | null; revision: number | null; points: ChecklistPoint[];
  createdBy: string | null; submittedBy: string | null; approvedBy: string | null; approvedAt: string | null;
  supersededBy: string | null; returnedReason: string | null; sourceTemplateVersion: number | null;
}
export interface ProjectOption { id: string; title: string }

interface DraftPoint { code: string; activity: string; method: string; acceptanceCriteria: string; mandatory: boolean }

const TEMPLATE_SYSTEMS = ELV_SYSTEMS.filter((s): s is ElvSystem => s !== 'other');
const emptyPoint = (): DraftPoint => ({ code: '', activity: '', method: '', acceptanceCriteria: '', mandatory: true });
const toDraft = (p: ChecklistPoint): DraftPoint => ({
  code: p.code ?? '', activity: p.activity, method: p.method ?? '', acceptanceCriteria: p.acceptanceCriteria, mandatory: p.mandatory !== false,
});
const toPayload = (points: DraftPoint[]) => points
  .filter((p) => p.code.trim() || p.activity.trim() || p.acceptanceCriteria.trim())
  .map((p) => ({ code: p.code.trim(), activity: p.activity.trim(), method: p.method.trim() || undefined, acceptanceCriteria: p.acceptanceCriteria.trim(), mandatory: p.mandatory }));
const shortDate = (iso: string | null) => (iso
  ? new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' })
  : '');

async function send(url: string, method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(data.message || data.error || `Refused (${res.status})`);
  return data;
}

export default function SystemChecklistClient({
  coverage, templates, projects, selectedProject, checklists,
}: {
  coverage: TemplateCoverage[] | null;
  templates: ItpTemplate[] | null;
  projects: ProjectOption[];
  selectedProject: string;
  checklists: SystemItp[] | null;
}) {
  return (
    <>
      <TemplateLibrary coverage={coverage} templates={templates} />
      <ProjectChecklists coverage={coverage} projects={projects} selectedProject={selectedProject} checklists={checklists} />
    </>
  );
}

// ── 1. The tenant System Template Library ─────────────────────────────────────────────────────

function TemplateLibrary({ coverage, templates }: { coverage: TemplateCoverage[] | null; templates: ItpTemplate[] | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [system, setSystem] = useState<string>('');
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState<DraftPoint[]>([emptyPoint()]);

  const run = async (key: string, act: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { await act(); after?.(); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const drafts = (templates ?? []).filter((t) => t.status === 'draft');
  const ready = (coverage ?? []).filter((c) => c.publishedVersion !== null).length;

  return (
    <section style={st.section} data-testid="template-library">
      <h2 style={st.h2}>System template library</h2>
      <p style={st.note}>
        One template per canonical ELV system, versioned. The library starts empty — Quality writes every point.
        {coverage ? ` ${ready} of ${coverage.length} systems have a published template.` : ''}
      </p>
      {error && <p style={st.error} role="alert" data-testid="template-error">{error}</p>}
      {coverage === null ? (
        <p style={st.unavailable} role="alert">The template library could not be read.</p>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead><tr>{['System', 'Published', 'In preparation', ''].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {coverage.map((c) => {
                const draft = drafts.find((d) => d.system === c.system);
                return (
                  <tr key={c.system} data-testid={`tpl-row-${c.system}`}>
                    <td style={st.td}>{elvSystemLabel(c.system as ElvSystem)}</td>
                    <td style={c.publishedVersion === null ? st.tdWarn : st.td} data-testid={`tpl-published-${c.system}`}>
                      {c.publishedVersion === null ? 'No template — not ready' : `v${c.publishedVersion}`}
                    </td>
                    <td style={st.tdMuted}>{draft ? `v${draft.version} draft · ${draft.points.length} point${draft.points.length === 1 ? '' : 's'}` : '—'}</td>
                    <td style={st.tdActions}>
                      {draft && (
                        <button style={st.primary} disabled={!hydrated || busy !== null} data-testid={`tpl-publish-${c.system}`}
                          onClick={() => run(`pub-${draft.id}`, () => send(`/api/quality/itp-templates/${draft.id}/publish`, 'POST'))}>
                          Publish v{draft.version}
                        </button>
                      )}
                      {!draft && c.templateId && (
                        <button style={st.ghost} disabled={!hydrated || busy !== null} data-testid={`tpl-retire-${c.system}`}
                          onClick={() => run(`ret-${c.templateId}`, () => send(`/api/quality/itp-templates/${c.templateId}/retire`, 'POST'))}>
                          Retire v{c.publishedVersion}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!open ? (
        <button style={st.addBtn} disabled={!hydrated} onClick={() => setOpen(true)} data-testid="tpl-new">+ New template version</button>
      ) : (
        <div style={st.form} data-testid="tpl-form">
          <div style={st.row}>
            <label style={st.label}>System
              <select style={st.input} value={system} onChange={(e) => setSystem(e.target.value)} data-testid="tpl-system">
                <option value="">Select a system…</option>
                {TEMPLATE_SYSTEMS.map((s) => <option key={s} value={s}>{elvSystemLabel(s)}</option>)}
              </select>
            </label>
            <label style={{ ...st.label, flex: 1 }}>Title
              <input style={st.input} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="tpl-title" />
            </label>
          </div>
          <PointEditor points={points} setPoints={setPoints} prefix="tpl" />
          <div style={st.row}>
            <button style={st.primary} disabled={!hydrated || busy !== null || !system || !title.trim()} data-testid="tpl-save"
              onClick={() => run('create', () => send('/api/quality/itp-templates', 'POST', { system, title, points: toPayload(points) }), () => {
                setOpen(false); setSystem(''); setTitle(''); setPoints([emptyPoint()]);
              })}>
              {busy === 'create' ? 'Saving…' : 'Save as draft'}
            </button>
            <button style={st.ghost} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
            <span style={st.hint}>A draft is not a checklist anyone can use. Publishing freezes it; a change is the next version.</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ── 2. The project's checklist, revision by revision ─────────────────────────────────────────

function ProjectChecklists({
  coverage, projects, selectedProject, checklists,
}: { coverage: TemplateCoverage[] | null; projects: ProjectOption[]; selectedProject: string; checklists: SystemItp[] | null }) {
  const router = useRouter();
  const hydrated = useHydrated();

  const systems = [...new Set([
    ...(checklists ?? []).map((c) => c.system ?? ''),
    ...(coverage ?? []).filter((c) => c.publishedVersion !== null).map((c) => c.system),
  ])].filter(Boolean).sort();

  return (
    <section style={st.section} data-testid="project-checklists">
      <h2 style={st.h2}>Project checklists</h2>
      <p style={st.note}>
        A published template adopted into the project, adapted, and approved by a QA/QC person other than the one who prepared it.
        Testing &amp; Commissioning executes the approved revision; a system with no approved revision cannot be commissioned.
      </p>
      <label style={st.label}>Project
        <select style={{ ...st.input, maxWidth: 420 }} value={selectedProject} data-testid="chk-project"
          onChange={(e) => router.push(e.target.value ? `/quality/system-checklists?project=${encodeURIComponent(e.target.value)}` : '/quality/system-checklists')}>
          <option value="">Select a project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>
      {!selectedProject ? null : checklists === null ? (
        <p style={st.unavailable} role="alert">This project’s checklists could not be read.</p>
      ) : systems.length === 0 ? (
        <p style={st.muted}>No system has a published template yet, so there is nothing to adopt into this project.</p>
      ) : (
        <div style={st.systems}>
          {systems.map((system) => (
            <SystemRevisions
              key={system}
              system={system}
              projectId={selectedProject}
              revisions={(checklists ?? []).filter((c) => c.system === system).sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))}
              template={(coverage ?? []).find((c) => c.system === system) ?? null}
              hydrated={hydrated}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SystemRevisions({
  system, projectId, revisions, template, hydrated,
}: { system: string; projectId: string; revisions: SystemItp[]; template: TemplateCoverage | null; hydrated: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState<DraftPoint[] | null>(null);
  const [showPoints, setShowPoints] = useState<string | null>(null);

  const approved = revisions.find((r) => r.status === 'approved') ?? null;
  const open = revisions.find((r) => r.status === 'draft' || r.status === 'submitted') ?? null;
  const history = revisions.filter((r) => r.status === 'superseded');

  const run = async (key: string, act: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { await act(); after?.(); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div style={st.card} data-testid={`chk-row-${system}`}>
      <div style={st.cardHead}>
        <b>{elvSystemLabel(system as ElvSystem)}</b>
        {approved ? (
          <span style={st.good} data-testid={`chk-approved-${system}`}>
            {approved.reference} · revision {approved.revision} approved{approved.approvedBy ? ` by ${approved.approvedBy}` : ''}{approved.approvedAt ? ` · ${shortDate(approved.approvedAt)}` : ''}
          </span>
        ) : (
          <span style={st.warn} data-testid={`chk-approved-${system}`}>No approved checklist — not ready for commissioning</span>
        )}
      </div>
      {error && <p style={st.error} role="alert" data-testid={`chk-error-${system}`}>{error}</p>}

      {approved && (
        <PointsToggle itp={approved} open={showPoints === approved.id} onToggle={() => setShowPoints(showPoints === approved.id ? null : approved.id)} />
      )}

      {open ? (
        <div style={st.openRev} data-testid={`chk-open-${system}`}>
          <div style={st.row}>
            <span style={st.badge}>Revision {open.revision} · {open.status}</span>
            <span style={st.hint}>Prepared by {open.createdBy ?? 'unknown'}{open.sourceTemplateVersion ? ` from template v${open.sourceTemplateVersion}` : ''}</span>
          </div>
          {open.returnedReason && open.status === 'draft' && (
            <p style={st.returned} data-testid={`chk-returned-${system}`}>Returned: {open.returnedReason}</p>
          )}
          {open.status === 'draft' && (
            editing ? (
              <>
                <PointEditor points={editing} setPoints={(u) => setEditing(typeof u === 'function' ? u(editing) : u)} prefix={`chk-${system}`} />
                <div style={st.row}>
                  <button style={st.primary} disabled={!hydrated || busy !== null} data-testid={`chk-save-${system}`}
                    onClick={() => run('save', () => send(`/api/quality/itps/${open.id}/checklist`, 'PUT', { points: toPayload(editing) }), () => setEditing(null))}>
                    Save revision {open.revision}
                  </button>
                  <button style={st.ghost} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <PointsToggle itp={open} open={showPoints === open.id} onToggle={() => setShowPoints(showPoints === open.id ? null : open.id)} />
                <div style={st.row}>
                  <button style={st.ghost} disabled={!hydrated || busy !== null} data-testid={`chk-edit-${system}`} onClick={() => setEditing(open.points.map(toDraft))}>
                    Adapt points
                  </button>
                  <button style={st.primary} disabled={!hydrated || busy !== null} data-testid={`chk-submit-${system}`}
                    onClick={() => run('submit', () => send(`/api/quality/itps/${open.id}/submit`, 'POST', {}))}>
                    Submit for approval
                  </button>
                </div>
              </>
            )
          )}
          {open.status === 'submitted' && (
            <>
              <PointsToggle itp={open} open={showPoints === open.id} onToggle={() => setShowPoints(showPoints === open.id ? null : open.id)} />
              <div style={st.row}>
                <button style={st.primary} disabled={!hydrated || busy !== null} data-testid={`chk-approve-${system}`}
                  onClick={() => run('approve', () => send(`/api/quality/itps/${open.id}/approve`, 'POST', {}))}>
                  Approve revision {open.revision}
                </button>
                <input style={{ ...st.input, flex: 1 }} placeholder="Reason for returning it" value={reason}
                  onChange={(e) => setReason(e.target.value)} data-testid={`chk-return-reason-${system}`} aria-label="Reason for returning the revision" />
                <button style={st.ghost} disabled={!hydrated || busy !== null || !reason.trim()} data-testid={`chk-return-${system}`}
                  onClick={() => run('return', () => send(`/api/quality/itps/${open.id}/return`, 'POST', { reason }), () => setReason(''))}>
                  Return
                </button>
              </div>
              <span style={st.hint}>Approved or returned by a QA/QC person other than {open.createdBy ?? 'its author'}.</span>
            </>
          )}
        </div>
      ) : (
        <div style={st.row}>
          {approved ? (
            <button style={st.ghost} disabled={!hydrated || busy !== null} data-testid={`chk-revise-${system}`}
              onClick={() => run('revise', () => send(`/api/quality/itps/${approved.id}/revise`, 'POST', {}))}>
              Start revision {(approved.revision ?? 0) + 1}
            </button>
          ) : template?.templateId ? (
            <button style={st.primary} disabled={!hydrated || busy !== null} data-testid={`chk-prepare-${system}`}
              onClick={() => run('prepare', () => send('/api/quality/itps/system', 'POST', { projectId, templateId: template.templateId }))}>
              Adopt template v{template.publishedVersion} into this project
            </button>
          ) : (
            <span style={st.hint}>No published template for this system.</span>
          )}
        </div>
      )}

      {history.length > 0 && (
        <p style={st.hint} data-testid={`chk-history-${system}`}>
          Superseded: {history.map((h) => `revision ${h.revision}`).join(', ')} — commissioning records bound to them stay on them.
        </p>
      )}
    </div>
  );
}

function PointsToggle({ itp, open, onToggle }: { itp: SystemItp; open: boolean; onToggle: () => void }) {
  return (
    <>
      <button style={st.link} onClick={onToggle} data-testid={`chk-points-toggle-${itp.system}-${itp.revision}`}>
        {open ? 'Hide' : 'Show'} the {itp.points.length} point{itp.points.length === 1 ? '' : 's'} of revision {itp.revision}
      </button>
      {open && (
        <div style={st.tableWrap}>
          <table style={st.table} data-testid={`chk-points-${itp.system}-${itp.revision}`}>
            <thead><tr>{['Code', 'Activity', 'Method', 'Acceptance criterion', 'PASS needs it'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {itp.points.map((p) => (
                <tr key={p.code ?? p.activity}>
                  <td style={st.tdCode}>{p.code}</td>
                  <td style={st.td}>{p.activity}</td>
                  <td style={st.tdMuted}>{p.method ?? '—'}</td>
                  <td style={st.td}>{p.acceptanceCriteria}</td>
                  <td style={st.tdMuted}>{p.mandatory === false ? 'Optional' : 'Mandatory'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PointEditor({
  points, setPoints, prefix,
}: { points: DraftPoint[]; setPoints: (u: DraftPoint[] | ((p: DraftPoint[]) => DraftPoint[])) => void; prefix: string }) {
  const set = (i: number, k: keyof DraftPoint, v: string | boolean) =>
    setPoints((p) => p.map((pt, idx) => (idx === i ? { ...pt, [k]: v } : pt)));
  return (
    <div style={st.points}>
      {points.map((p, i) => (
        <div key={i} style={st.pointRow}>
          <input style={{ ...st.input, width: 90, minWidth: 90 }} placeholder="Code" value={p.code} onChange={(e) => set(i, 'code', e.target.value)} data-testid={`${prefix}-point-code-${i}`} aria-label="Point code" />
          <input style={{ ...st.input, flex: 2 }} placeholder="Activity — what is proven" value={p.activity} onChange={(e) => set(i, 'activity', e.target.value)} data-testid={`${prefix}-point-activity-${i}`} aria-label="Activity" />
          <input style={{ ...st.input, flex: 1 }} placeholder="Method (optional)" value={p.method} onChange={(e) => set(i, 'method', e.target.value)} data-testid={`${prefix}-point-method-${i}`} aria-label="Method" />
          <input style={{ ...st.input, flex: 2 }} placeholder="Acceptance criterion" value={p.acceptanceCriteria} onChange={(e) => set(i, 'acceptanceCriteria', e.target.value)} data-testid={`${prefix}-point-criterion-${i}`} aria-label="Acceptance criterion" />
          <label style={st.check}>
            <input type="checkbox" checked={p.mandatory} onChange={(e) => set(i, 'mandatory', e.target.checked)} data-testid={`${prefix}-point-mandatory-${i}`} />
            Mandatory
          </label>
          {points.length > 1 && <button style={st.ghost} onClick={() => setPoints((all) => all.filter((_, idx) => idx !== i))} aria-label="Remove point">✕</button>}
        </div>
      ))}
      <button style={st.addBtn} onClick={() => setPoints((all) => [...all, emptyPoint()])} data-testid={`${prefix}-add-point`}>+ Point</button>
    </div>
  );
}

const st = {
  section: { marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  h2: { fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: 0 } as CSSProperties,
  note: { margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, maxWidth: 780 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: 0 } as CSSProperties,
  unavailable: { color: 'var(--bad)', fontSize: 13, margin: 0 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, margin: 0 } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 } as CSSProperties,
  td: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdWarn: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--warn)' } as CSSProperties,
  tdMuted: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  tdCode: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdActions: { padding: '5px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', textAlign: 'right' } as CSSProperties,
  form: { display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 140 } as CSSProperties,
  points: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  pointRow: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  check: { display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  primary: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  ghost: { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  addBtn: { alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--border-strong, #cbd5e1)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  link: { alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  systems: { display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  card: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  cardHead: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' } as CSSProperties,
  good: { color: 'var(--good)', fontSize: 13, fontWeight: 600 } as CSSProperties,
  warn: { color: 'var(--warn)', fontSize: 13, fontWeight: 600 } as CSSProperties,
  badge: { padding: '3px 10px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)', fontWeight: 700, fontSize: 12 } as CSSProperties,
  openRev: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2, rgba(127,127,127,0.06))' } as CSSProperties,
  returned: { margin: 0, color: 'var(--warn)', fontSize: 13 } as CSSProperties,
};
