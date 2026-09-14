'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DocumentFileLink from './document-file-link';

type StudyStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'superseded';
type Compliance = 'unassessed' | 'compliant' | 'partial' | 'deviation' | 'not_applicable';
interface DirectoryUser { username: string; displayName?: string; roleLabel?: string; active?: boolean }
interface DocRow { id: string; title: string; kind: string; currentVersion?: number; source?: 'sales-intake' | 'technical-study' }
interface CanonicalRequirement { id: string; title: string; detail: string | null; priority: string; status: string }
interface WorkspaceMe { username: string }
interface IntakeContext {
  leadId: string; customerContact: string; contactEmail: string | null; contactPhone: string | null;
  companyName: string | null; requirement: string | null;
  systems: Array<{ key: string; label: string }>; sector: string | null; projectName: string | null;
  projectLocation: string | null; consultant: string | null; mainContractor: string | null;
  estimatedValue: number | null; projectStage: string | null; expectedTimeline: string | null;
  nextActivityDue: string | null; salesOwnerId: string | null; source: string | null;
}
interface SystemRow { id: string; discipline: string; name: string; designBasis: string; interfaces: string[] }
interface RequirementRow { id: string; category: 'client' | 'authority' | 'technical' | 'site'; statement: string; acceptanceCriteria: string; sourceRef: string; sourceRequirementId: string | null; compliance: Compliance; response: string }
interface SurveyRow { id: string; area: string; observation: string; impact: string; evidenceDocumentIds: string[] }
interface ClarificationRow { id: string; question: string; requestedFrom: string; dueDate: string | null; status: 'open' | 'answered' | 'closed'; answer: string; reference: string }
interface DeviationRow { id: string; requirementRef: string; description: string; impact: string; proposedResolution: string; status: 'open' | 'accepted' | 'rejected' }
interface EvidenceRow { documentId: string; title: string; kind: string; revision: string }
interface Study {
  id: string; revisionNo: number; parentStudyId: string | null; title: string; inputRevision: string;
  status: StudyStatus; authorId: string; reviewerId: string; createdAt: string; updatedAt: string;
  submittedAt: string | null; reviewedBy: string | null; reviewedAt: string | null; reviewComment: string | null;
  scopeSummary: string; systems: SystemRow[]; requirements: RequirementRow[]; surveyFindings: SurveyRow[];
  clarifications: ClarificationRow[]; deviations: DeviationRow[]; assumptions: string[]; exclusions: string[];
  evidence: EvidenceRow[]; readiness: { ready: boolean; blockers: string[] };
}

const SYSTEMS = [
  'CCTV', 'Access Control', 'Intercom', 'Structured Cabling', 'Wi-Fi / Network', 'PA / BGM',
  'Fire Alarm', 'BMS', 'EMS / Metering', 'HVAC', 'Electrical Power', 'Lighting', 'Plumbing',
  'Drainage', 'Fire Fighting / Suppression', 'Other',
];
const blankSystem = (): SystemRow => ({ id: '', discipline: 'ELV', name: 'CCTV', designBasis: '', interfaces: [] });
const blankRequirement = (): RequirementRow => ({ id: '', category: 'client', statement: '', acceptanceCriteria: '', sourceRef: '', sourceRequirementId: null, compliance: 'unassessed', response: '' });
const blankSurvey = (): SurveyRow => ({ id: '', area: '', observation: '', impact: '', evidenceDocumentIds: [] });
const blankClarification = (): ClarificationRow => ({ id: '', question: '', requestedFrom: 'Client / Consultant', dueDate: null, status: 'open', answer: '', reference: '' });
const blankDeviation = (): DeviationRow => ({ id: '', requirementRef: '', description: '', impact: '', proposedResolution: '', status: 'open' });

interface Editor {
  title: string; inputRevision: string; reviewerId: string; scopeSummary: string;
  systems: SystemRow[]; requirements: RequirementRow[]; surveyFindings: SurveyRow[];
  clarifications: ClarificationRow[]; deviations: DeviationRow[]; assumptions: string; exclusions: string;
  evidence: EvidenceRow[];
}
const blankEditor = (): Editor => ({
  title: '', inputRevision: 'Client enquiry Rev 01', reviewerId: '', scopeSummary: '', systems: [blankSystem()],
  requirements: [blankRequirement()], surveyFindings: [], clarifications: [], deviations: [], assumptions: '',
  exclusions: '', evidence: [],
});
const requirementsFrom = (requirements: CanonicalRequirement[]): RequirementRow[] => {
  const active = requirements.filter((requirement) => requirement.status !== 'dropped');
  if (active.length === 0) return [blankRequirement()];
  return active.map((requirement) => ({
    id: '', category: 'client', statement: requirement.title,
    acceptanceCriteria: '', sourceRef: requirement.detail ?? `Opportunity requirement ${requirement.id}`,
    sourceRequirementId: requirement.id, compliance: 'unassessed', response: '',
  }));
};
const editorFrom = (study: Study): Editor => ({
  title: study.title, inputRevision: study.inputRevision, reviewerId: study.reviewerId,
  scopeSummary: study.scopeSummary, systems: study.systems, requirements: study.requirements,
  surveyFindings: study.surveyFindings, clarifications: study.clarifications, deviations: study.deviations,
  assumptions: study.assumptions.join('\n'), exclusions: study.exclusions.join('\n'), evidence: study.evidence,
});

const messageOf = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const value = (payload as { message?: unknown }).message;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
  }
  return fallback;
};

interface TechnicalStudyWorkspaceProps {
  opportunityId: string;
  route?: 'direct' | 'tender';
  tenderId?: string | null;
}

export default function TechnicalStudyWorkspace(props: TechnicalStudyWorkspaceProps) {
  if (props.route === 'tender') {
    if (props.tenderId) {
      return <DirectTechnicalStudyWorkspace opportunityId={props.opportunityId} tenderId={props.tenderId} />;
    }
    return <section style={st.panel} aria-labelledby="technical-study-heading">
      <p style={st.eyebrow}>PRE-SALES / ENGINEERING</p>
      <h2 id="technical-study-heading" style={st.h2}>Technical Study</h2>
      <p style={st.lead}>This opportunity follows the governed tender path. Drawings, specifications, RFIs, technical study and BOQ stay with the Tender record so the pre-award context is not split.</p>
      <div style={st.routeCard}>
        <b>Next action</b>
        <p style={st.muted}>Use <b>Start Tender</b> above. AURA will create the canonical Tender record, then all tender study work continues there.</p>
      </div>
    </section>;
  }
  return <DirectTechnicalStudyWorkspace opportunityId={props.opportunityId} />;
}

function DirectTechnicalStudyWorkspace({ opportunityId, tenderId }: { opportunityId: string; tenderId?: string }) {
  const [studies, setStudies] = useState<Study[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [intake, setIntake] = useState<IntakeContext | null>(null);
  const [actorId, setActorId] = useState('');
  const [editor, setEditor] = useState<Editor>(blankEditor);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [evidenceCategory, setEvidenceCategory] = useState('drawing');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const evidenceInput = useRef<HTMLInputElement>(null);
  const isTender = Boolean(tenderId);
  const recordLabel = isTender ? 'Tender' : 'Opportunity';
  const base = isTender
    ? `/api/tendering/tenders/${encodeURIComponent(tenderId!)}/studies`
    : `/api/crm/opportunities/${encodeURIComponent(opportunityId)}/pre-award-package/studies`;
  const evidenceEndpoint = isTender
    ? `/api/tendering/tenders/${encodeURIComponent(tenderId!)}/study-files`
    : `${base.replace(/\/studies$/, '')}/evidence`;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [studyRes, reviewerRes, documentRes, requirementRes, intakeRes, meRes] = await Promise.all([
        fetch(base, { cache: 'no-store' }),
        fetch(isTender ? `/api/tendering/tenders/${encodeURIComponent(tenderId!)}/study-reviewers` : `${base.replace(/\/studies$/, '')}/reviewers`, { cache: 'no-store' }),
        fetch(evidenceEndpoint, { cache: 'no-store' }),
        isTender ? Promise.resolve(null) : fetch(`/api/crm/opportunities/${encodeURIComponent(opportunityId)}/requirements`, { cache: 'no-store' }),
        isTender ? Promise.resolve(null) : fetch(`${base.replace(/\/studies$/, '')}/intake-context`, { cache: 'no-store' }),
        fetch('/api/workspace/me', { cache: 'no-store' }),
      ]);
      if (!studyRes.ok) {
        const payload = await studyRes.json().catch(() => ({}));
        setError(messageOf(payload, `Could not load the technical study (${studyRes.status})`));
        return;
      }
      const loaded = await studyRes.json().catch(() => []);
      const rows = Array.isArray(loaded) ? loaded as Study[] : [];
      setStudies(rows);
      const current = rows.filter((row) => row.status !== 'superseded').at(-1);
      const canonicalRequirements = requirementRes?.ok
        ? await requirementRes.json().catch(() => []) as CanonicalRequirement[]
        : [];
      const sourceIntake = intakeRes?.ok ? await intakeRes.json().catch(() => null) as IntakeContext | null : null;
      setIntake(sourceIntake);
      setEditor(current ? editorFrom(current) : {
        ...blankEditor(),
        scopeSummary: sourceIntake?.requirement ?? '',
        systems: sourceIntake?.systems?.length
          ? sourceIntake.systems.map((system) => ({ ...blankSystem(), name: system.label }))
          : [blankSystem()],
        requirements: requirementsFrom(Array.isArray(canonicalRequirements) ? canonicalRequirements : []),
      });
      const me = meRes.ok ? await meRes.json().catch(() => null) as WorkspaceMe | null : null;
      if (reviewerRes.ok) {
        const directory = await reviewerRes.json().catch(() => []);
        setUsers(Array.isArray(directory) ? (directory as Array<{ userId: string; displayName?: string }>).map((user) => ({ username: user.userId, displayName: user.displayName, roleLabel: 'Technical approver' })) : []);
      } else {
        setUsers([]);
      }
      if (documentRes.ok) {
        const docs = await documentRes.json().catch(() => []);
        setDocuments(Array.isArray(docs) ? docs as DocRow[] : []);
      }
      setActorId(me?.username ?? '');
    } catch { setError('The technical-study service is unreachable.'); }
    finally { setLoading(false); }
  }, [base, evidenceEndpoint, isTender, opportunityId, tenderId]);
  useEffect(() => { void load(); }, [load]);

  const current = useMemo(() => studies.filter((row) => row.status !== 'superseded').at(-1) ?? null, [studies]);
  const editable = !current || current.status === 'draft' || current.status === 'changes_requested' || current.status === 'approved';
  const startingRevision = current?.status === 'approved';

  const payload = useCallback(() => ({
    title: editor.title.trim(), inputRevision: editor.inputRevision.trim(), reviewerId: editor.reviewerId,
    scopeSummary: editor.scopeSummary.trim(),
    systems: editor.systems.filter((row) => row.name.trim()).map((row) => ({ ...row, interfaces: row.interfaces.filter(Boolean) })),
    requirements: editor.requirements.filter((row) => row.statement.trim()),
    surveyFindings: editor.surveyFindings.filter((row) => row.area.trim() && row.observation.trim()),
    clarifications: editor.clarifications.filter((row) => row.question.trim()),
    deviations: editor.deviations.filter((row) => row.description.trim()),
    assumptions: editor.assumptions.split('\n').map((row) => row.trim()).filter(Boolean),
    exclusions: editor.exclusions.split('\n').map((row) => row.trim()).filter(Boolean),
    evidence: editor.evidence,
  }), [editor]);

  const command = useCallback(async (url: string, method: 'POST' | 'PATCH', body?: unknown, success?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(url, {
        method, headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) { setError(messageOf(result, `Action refused (${res.status})`)); return; }
      if (success) setNotice(success);
      await load();
    } catch { setError('The technical-study service is unreachable.'); }
    finally { setBusy(false); }
  }, [load]);

  const save = async () => {
    const body = payload();
    if (!body.title || !body.inputRevision || !body.reviewerId) {
      setError('Enter a study title, the client/input revision and an independent technical reviewer.');
      return;
    }
    if (!current || startingRevision) {
      await command(base, 'POST', body, startingRevision ? 'A new study revision was opened.' : 'The technical study was created.');
    } else {
      await command(`${base}/${current.id}`, 'PATCH', { ...body, expectedUpdatedAt: current.updatedAt }, 'Draft saved from the current server version.');
    }
  };

  const toggleDocument = (doc: DocRow) => {
    const exists = editor.evidence.some((item) => item.documentId === doc.id);
    setEditor({
      ...editor,
      evidence: exists
        ? editor.evidence.filter((item) => item.documentId !== doc.id)
        : [...editor.evidence, { documentId: doc.id, title: doc.title, kind: doc.kind, revision: String(doc.currentVersion ?? '') }],
    });
  };

  const uploadEvidence = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setNotice(null);
    if (!evidenceFile || evidenceFile.size > 25 * 1024 * 1024) {
      setError('Choose one study file up to 25 MB.');
      return;
    }
    if (!evidenceTitle.trim()) {
      setError('Enter a clear title for the study evidence.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('category', evidenceCategory);
      form.set('title', evidenceTitle.trim());
      form.set('file', evidenceFile);
      const response = await fetch(evidenceEndpoint, { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(messageOf(result, `Upload refused (${response.status})`)); return; }
      const createdDocument = result && typeof result === 'object' && 'document' in result
        ? (result as { document: DocRow }).document
        : result as DocRow;
      setEvidenceTitle(''); setEvidenceFile(null); if (evidenceInput.current) evidenceInput.current.value = '';
      setNotice(`Study evidence uploaded and linked to this ${recordLabel}. Select it below to freeze it into the study revision.`);
      await load();
      if (createdDocument?.id) {
        setDocuments((current) => [createdDocument, ...current.filter((item) => item.id !== createdDocument.id)]);
      }
    } catch { setError('The study evidence service is unreachable.'); }
    finally { setBusy(false); }
  };

  const uploadEvidenceRevision = async (document: DocRow, file: File | null) => {
    if (!file || busy) return;
    if (file.size > 25 * 1024 * 1024) { setError('Choose one revision file up to 25 MB.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('note', `Revision uploaded from the Technical Study workspace for ${document.title}`);
      const response = await fetch(`${evidenceEndpoint}/${encodeURIComponent(document.id)}/versions`, { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(messageOf(result, `Revision upload refused (${response.status})`)); return; }
      setNotice(`Revision ${result.version} uploaded for ${document.title}. Re-select the file before saving if this study must use the new revision.`);
      await load();
      if (typeof result.version === 'number') {
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, currentVersion: result.version } : item));
      }
    } catch { setError('The study evidence service is unreachable.'); }
    finally { setBusy(false); }
  };

  if (loading) return <section style={st.panel}><p style={st.muted}>Loading the technical study…</p></section>;

  return (
    <section style={st.panel} aria-labelledby="technical-study-heading">
      <div style={st.header}>
        <div>
          <p style={st.eyebrow}>PRE-SALES / ENGINEERING</p>
          <h2 id="technical-study-heading" style={st.h2}>Technical Study</h2>
          <p style={st.lead}>Turn the exact client input into a reviewed ELV/MEP engineering basis before quantity take-off and estimating.</p>
        </div>
        {current && <Status status={current.status} revisionNo={current.revisionNo} />}
      </div>

      <div style={st.path}>
        <Step label="1 · Identify systems" done={!!current?.systems.length} />
        <Step label="2 · Assess requirements" done={!!current?.requirements.length && current.requirements.every((row) => row.compliance !== 'unassessed')} />
        <Step label="3 · Resolve RFIs / deviations" done={!!current && current.clarifications.every((row) => row.status !== 'open') && current.deviations.every((row) => row.status !== 'open')} />
        <Step label="4 · Technical review" done={current?.status === 'approved'} />
      </div>

      {error && <p role="alert" style={st.error}>{error}</p>}
      {notice && <p role="status" style={st.notice}>{notice}</p>}

      {intake && <div style={st.intakeBox} data-testid="sales-intake-context">
        <div><p style={st.eyebrow}>CANONICAL SALES INTAKE</p><b>{intake.projectName ?? dataLabel(intake.companyName) ?? 'Source enquiry'}</b><p style={st.muted}>{intake.requirement ?? 'No scope summary was captured.'}</p></div>
        <div style={st.intakeGrid}>
          <IntakeFact label="Customer" value={intake.companyName} />
          <IntakeFact label="Contact" value={intake.customerContact} />
          <IntakeFact label="Contact channel" value={[intake.contactEmail, intake.contactPhone].filter(Boolean).join(' · ')} />
          <IntakeFact label="Site" value={intake.projectLocation} />
          <IntakeFact label="Systems" value={intake.systems.map((system) => system.label).join(', ')} />
          <IntakeFact label="Consultant" value={intake.consultant} />
          <IntakeFact label="Main contractor" value={intake.mainContractor} />
          <IntakeFact label="Stage / timeline" value={[intake.projectStage, intake.expectedTimeline].filter(Boolean).join(' · ')} />
          <IntakeFact label="Sales owner / next due" value={[intake.salesOwnerId, intake.nextActivityDue].filter(Boolean).join(' · ')} />
          <IntakeFact label="Source enquiry" value={intake.leadId} />
        </div>
      </div>}
      {current?.reviewComment && <p style={current.status === 'changes_requested' ? st.error : st.notice}><b>Reviewer:</b> {current.reviewComment}</p>}

      {studies.length > 1 && (
        <details style={st.history}>
          <summary>Revision history ({studies.length})</summary>
          {studies.map((study) => <div key={study.id} style={st.historyRow}>Study S-{String(study.revisionNo).padStart(3, '0')} · {study.inputRevision} · {study.status} · author {study.authorId} · reviewer {study.reviewerId}</div>)}
        </details>
      )}

      {editable ? (
        <>
          {startingRevision && <p style={st.callout}>The approved revision remains frozen. Saving below creates S-{String((current?.revisionNo ?? 0) + 1).padStart(3, '0')} and links it to the approved revision.</p>}
          <Section title="Study identity" help="Use the client drawing/specification revision this work is based on. A later client issue becomes a new study revision.">
            <div style={st.grid3}>
              <Field label="Study title"><input style={st.input} value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="Warehouse CCTV and Access Control study" /></Field>
              <Field label="Input revision"><input style={st.input} value={editor.inputRevision} onChange={(e) => setEditor({ ...editor, inputRevision: e.target.value })} placeholder="Client drawings Rev 02 · 14 Sep 2026" /></Field>
              <Field label="Technical reviewer">
                <select style={st.input} value={editor.reviewerId} onChange={(e) => setEditor({ ...editor, reviewerId: e.target.value })}>
                  <option value="">Select independent reviewer…</option>
                  {users.filter((user) => user.username !== actorId).map((user) => <option key={user.username} value={user.username}>{user.displayName || user.username}{user.roleLabel ? ` · ${user.roleLabel}` : ''}</option>)}
                </select>
                {users.filter((user) => user.username !== actorId).length === 0 && <small style={st.muted}>No eligible technical approver is assigned. Ask an administrator to grant the Technical Manager role before submitting the study.</small>}
              </Field>
            </div>
            <Field label="Scope summary"><textarea style={st.textarea} value={editor.scopeSummary} onChange={(e) => setEditor({ ...editor, scopeSummary: e.target.value })} placeholder="What is included, locations, operating need, design boundary and handoff expected from Pre-Sales." /></Field>
          </Section>

          <Section title="Systems and interfaces" help="Identify each ELV/MEP system and the technical basis the estimator must understand.">
            {editor.systems.map((row, index) => (
              <div key={row.id || index} style={st.rowGrid}>
                <select aria-label={`System ${index + 1}`} style={st.input} value={row.name} onChange={(e) => setEditor({ ...editor, systems: editor.systems.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })}>{SYSTEMS.map((name) => <option key={name}>{name}</option>)}</select>
                <select aria-label={`Discipline ${index + 1}`} style={st.input} value={row.discipline} onChange={(e) => setEditor({ ...editor, systems: editor.systems.map((item, i) => i === index ? { ...item, discipline: e.target.value } : item) })}><option>ELV</option><option>MEP</option><option>ICT</option><option>Fire &amp; Life Safety</option></select>
                <input aria-label={`Design basis ${index + 1}`} style={st.input} value={row.designBasis} onChange={(e) => setEditor({ ...editor, systems: editor.systems.map((item, i) => i === index ? { ...item, designBasis: e.target.value } : item) })} placeholder="Design basis / capacity" />
                <input aria-label={`Interfaces ${index + 1}`} style={st.input} value={row.interfaces.join(', ')} onChange={(e) => setEditor({ ...editor, systems: editor.systems.map((item, i) => i === index ? { ...item, interfaces: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) } : item) })} placeholder="Interfaces: LAN, BMS, fire alarm" />
                <button style={st.remove} onClick={() => setEditor({ ...editor, systems: editor.systems.filter((_, i) => i !== index) })}>Remove</button>
              </div>
            ))}
            <button style={st.secondary} onClick={() => setEditor({ ...editor, systems: [...editor.systems, blankSystem()] })}>+ Add system</button>
          </Section>

          <Section title="Requirements and compliance" help="Record the client, authority, technical and site requirements. Compliance must be assessed before approval.">
            {editor.requirements.map((row, index) => (
              <div key={row.id || index} style={st.stackRow}>
                <div style={st.grid3}>
                  <select aria-label={`Requirement category ${index + 1}`} style={st.input} value={row.category} onChange={(e) => setEditor({ ...editor, requirements: editor.requirements.map((item, i) => i === index ? { ...item, category: e.target.value as RequirementRow['category'] } : item) })}><option value="client">Client</option><option value="authority">Government / authority</option><option value="technical">Technical</option><option value="site">Site</option></select>
                  <input aria-label={`Requirement source ${index + 1}`} style={st.input} value={row.sourceRef} readOnly={Boolean(row.sourceRequirementId)} onChange={(e) => setEditor({ ...editor, requirements: editor.requirements.map((item, i) => i === index ? { ...item, sourceRef: e.target.value } : item) })} placeholder="Source: specification clause / drawing" />
                  <select aria-label={`Compliance ${index + 1}`} style={st.input} value={row.compliance} onChange={(e) => setEditor({ ...editor, requirements: editor.requirements.map((item, i) => i === index ? { ...item, compliance: e.target.value as Compliance } : item) })}><option value="unassessed">Not assessed</option><option value="compliant">Compliant</option><option value="partial">Partially compliant</option><option value="deviation">Deviation</option><option value="not_applicable">Not applicable</option></select>
                </div>
                {row.sourceRequirementId && <p style={st.linked}>Linked from Sales intake · {row.sourceRequirementId.slice(0, 8)}</p>}
                <input aria-label={`Requirement statement ${index + 1}`} style={st.input} value={row.statement} readOnly={Boolean(row.sourceRequirementId)} onChange={(e) => setEditor({ ...editor, requirements: editor.requirements.map((item, i) => i === index ? { ...item, statement: e.target.value } : item) })} placeholder="Requirement statement" />
                <div style={st.grid2}>
                  <input aria-label={`Acceptance criteria ${index + 1}`} style={st.input} value={row.acceptanceCriteria} onChange={(e) => setEditor({ ...editor, requirements: editor.requirements.map((item, i) => i === index ? { ...item, acceptanceCriteria: e.target.value } : item) })} placeholder="Acceptance criteria" />
                  <input aria-label={`Technical response ${index + 1}`} style={st.input} value={row.response} onChange={(e) => setEditor({ ...editor, requirements: editor.requirements.map((item, i) => i === index ? { ...item, response: e.target.value } : item) })} placeholder="Technical response / proposed compliance" />
                </div>
                <button style={st.remove} onClick={() => setEditor({ ...editor, requirements: editor.requirements.filter((_, i) => i !== index) })}>Remove requirement</button>
              </div>
            ))}
            <button style={st.secondary} onClick={() => setEditor({ ...editor, requirements: [...editor.requirements, blankRequirement()] })}>+ Add requirement</button>
          </Section>

          <Section title="Site survey" help="Capture conditions that affect design, quantities, access, installation or authority approval.">
            {editor.surveyFindings.map((row, index) => (
              <div key={row.id || index} style={st.rowGrid}>
                <input style={st.input} value={row.area} onChange={(e) => setEditor({ ...editor, surveyFindings: editor.surveyFindings.map((item, i) => i === index ? { ...item, area: e.target.value } : item) })} placeholder="Area / location" />
                <input style={st.input} value={row.observation} onChange={(e) => setEditor({ ...editor, surveyFindings: editor.surveyFindings.map((item, i) => i === index ? { ...item, observation: e.target.value } : item) })} placeholder="Observed condition" />
                <input style={st.input} value={row.impact} onChange={(e) => setEditor({ ...editor, surveyFindings: editor.surveyFindings.map((item, i) => i === index ? { ...item, impact: e.target.value } : item) })} placeholder="Design / cost / programme impact" />
                <button style={st.remove} onClick={() => setEditor({ ...editor, surveyFindings: editor.surveyFindings.filter((_, i) => i !== index) })}>Remove</button>
              </div>
            ))}
            <button style={st.secondary} onClick={() => setEditor({ ...editor, surveyFindings: [...editor.surveyFindings, blankSurvey()] })}>+ Add survey finding</button>
          </Section>

          <Section title="Clarifications / RFIs" help="An open clarification may be submitted for review, but it blocks final technical approval until answered or closed.">
            {editor.clarifications.map((row, index) => (
              <div key={row.id || index} style={st.stackRow}>
                <div style={st.grid3}>
                  <input style={st.input} value={row.question} onChange={(e) => setEditor({ ...editor, clarifications: editor.clarifications.map((item, i) => i === index ? { ...item, question: e.target.value } : item) })} placeholder="Question / clarification" />
                  <input style={st.input} value={row.requestedFrom} onChange={(e) => setEditor({ ...editor, clarifications: editor.clarifications.map((item, i) => i === index ? { ...item, requestedFrom: e.target.value } : item) })} placeholder="Requested from" />
                  <select style={st.input} value={row.status} onChange={(e) => setEditor({ ...editor, clarifications: editor.clarifications.map((item, i) => i === index ? { ...item, status: e.target.value as ClarificationRow['status'] } : item) })}><option value="open">Open</option><option value="answered">Answered</option><option value="closed">Closed</option></select>
                </div>
                <div style={st.grid2}><input style={st.input} value={row.answer} onChange={(e) => setEditor({ ...editor, clarifications: editor.clarifications.map((item, i) => i === index ? { ...item, answer: e.target.value } : item) })} placeholder="Answer" /><input style={st.input} value={row.reference} onChange={(e) => setEditor({ ...editor, clarifications: editor.clarifications.map((item, i) => i === index ? { ...item, reference: e.target.value } : item) })} placeholder="Client / consultant reference" /></div>
                <button style={st.remove} onClick={() => setEditor({ ...editor, clarifications: editor.clarifications.filter((_, i) => i !== index) })}>Remove clarification</button>
              </div>
            ))}
            <button style={st.secondary} onClick={() => setEditor({ ...editor, clarifications: [...editor.clarifications, blankClarification()] })}>+ Add clarification / RFI</button>
          </Section>

          <Section title="Deviations and exclusions" help="Every technical deviation needs an explicit disposition before the study can be approved.">
            {editor.deviations.map((row, index) => (
              <div key={row.id || index} style={st.stackRow}>
                <div style={st.grid3}><input style={st.input} value={row.requirementRef} onChange={(e) => setEditor({ ...editor, deviations: editor.deviations.map((item, i) => i === index ? { ...item, requirementRef: e.target.value } : item) })} placeholder="Requirement reference" /><input style={st.input} value={row.description} onChange={(e) => setEditor({ ...editor, deviations: editor.deviations.map((item, i) => i === index ? { ...item, description: e.target.value } : item) })} placeholder="Deviation" /><select style={st.input} value={row.status} onChange={(e) => setEditor({ ...editor, deviations: editor.deviations.map((item, i) => i === index ? { ...item, status: e.target.value as DeviationRow['status'] } : item) })}><option value="open">Open</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></div>
                <div style={st.grid2}><input style={st.input} value={row.impact} onChange={(e) => setEditor({ ...editor, deviations: editor.deviations.map((item, i) => i === index ? { ...item, impact: e.target.value } : item) })} placeholder="Technical / cost / schedule impact" /><input style={st.input} value={row.proposedResolution} onChange={(e) => setEditor({ ...editor, deviations: editor.deviations.map((item, i) => i === index ? { ...item, proposedResolution: e.target.value } : item) })} placeholder="Proposed resolution" /></div>
                <button style={st.remove} onClick={() => setEditor({ ...editor, deviations: editor.deviations.filter((_, i) => i !== index) })}>Remove deviation</button>
              </div>
            ))}
            <button style={st.secondary} onClick={() => setEditor({ ...editor, deviations: [...editor.deviations, blankDeviation()] })}>+ Add deviation</button>
            <div style={st.grid2}>
              <Field label="Assumptions — one per line"><textarea style={st.textarea} value={editor.assumptions} onChange={(e) => setEditor({ ...editor, assumptions: e.target.value })} /></Field>
              <Field label="Exclusions — one per line"><textarea style={st.textarea} value={editor.exclusions} onChange={(e) => setEditor({ ...editor, exclusions: e.target.value })} /></Field>
            </div>
          </Section>

          <Section title="Drawings, specifications and evidence" help={`Select governed files already linked to this ${recordLabel}. Their title, kind and current revision are frozen into this study revision.`}>
            <form onSubmit={(event) => void uploadEvidence(event)} style={st.uploadBox}>
              <div style={st.grid3}>
                <Field label="Evidence type"><select style={st.input} value={evidenceCategory} onChange={(event) => setEvidenceCategory(event.target.value)}><option value="drawing">Client drawing</option><option value="client_specification">Client specification</option><option value="client_requirement">Client requirement</option><option value="authority_requirement">Government / authority requirement</option><option value="site_survey">Site survey evidence</option><option value="technical_reference">Technical reference</option></select></Field>
                <Field label="Evidence title"><input style={st.input} required maxLength={240} value={evidenceTitle} onChange={(event) => setEvidenceTitle(event.target.value)} placeholder="CCTV layout · Rev A" /></Field>
                <Field label="Source file · up to 25 MB"><input ref={evidenceInput} style={st.input} type="file" required onChange={(event) => { const selected = event.target.files?.[0] ?? null; setEvidenceFile(selected); if (selected && !evidenceTitle) setEvidenceTitle(selected.name); }} /></Field>
              </div>
              <button type="submit" style={st.secondary} disabled={busy}>{busy ? 'Uploading…' : 'Upload study evidence'}</button>
            </form>
            {documents.length === 0 ? <p style={st.muted}>No study evidence is linked yet. Upload the client drawings, specifications, requirements or survey evidence above.</p> : (
              <div style={st.docGrid}>{documents.map((doc) => <div key={doc.id} style={st.doc}><input aria-label={`Use ${doc.title} in this study revision`} type="checkbox" checked={editor.evidence.some((item) => item.documentId === doc.id)} onChange={() => toggleDocument(doc)} /><span><b>{doc.title}</b><br /><small>{doc.kind.replaceAll('_', ' ')} · revision {doc.currentVersion ?? '—'}{doc.source === 'sales-intake' ? ' · from Sales enquiry' : ' · technical study'}</small><br /><DocumentFileLink documentId={doc.id} title={doc.title} /> {doc.source === 'sales-intake' ? <small style={st.sourceNote}>Sales maintains revisions</small> : <label style={st.revisionUpload}>Add revision<input aria-label={`Upload a new revision for ${doc.title}`} type="file" disabled={busy} onChange={(event) => { void uploadEvidenceRevision(doc, event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /></label>}</span></div>)}</div>
            )}
          </Section>

          <div style={st.actions}>
            <button style={st.primary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : startingRevision ? 'Start next revision' : current ? 'Save study draft' : 'Create study draft'}</button>
            {current && !startingRevision && (current.status === 'draft' || current.status === 'changes_requested') && <button style={st.secondary} disabled={busy} onClick={() => void command(`${base}/${current.id}/submit`, 'POST', undefined, 'Study submitted to the assigned reviewer.')}>Submit for technical review</button>}
          </div>
        </>
      ) : (
        <ReadOnlyStudy study={current!} />
      )}

      {current?.status === 'in_review' && (
        <div style={st.reviewBox}>
          <h3 style={st.h3}>Technical Manager decision</h3>
          {current.readiness.ready ? <p style={st.notice}>The study has no unresolved technical blockers.</p> : <ul style={st.blockers}>{current.readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}
          {!users.some((user) => user.username === current.reviewerId) ? <p role="alert" style={st.error}>The assigned reviewer no longer has technical approval authority for this opportunity. An administrator must restore the grant or return the study through a governed reassignment.</p> : actorId === current.reviewerId ? <>
            <textarea style={st.textarea} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Review comment / decision basis" />
            <div style={st.actions}>
              <button style={st.primary} disabled={busy || !current.readiness.ready} onClick={() => void command(`${base}/${current.id}/approve`, 'POST', { comment: reviewComment }, 'Technical basis approved for quantity take-off and estimating.')}>Approve technical basis</button>
              <button style={st.danger} disabled={busy || !reviewComment.trim()} onClick={() => void command(`${base}/${current.id}/request-changes`, 'POST', { comment: reviewComment }, 'Study returned to the assigned author.')}>Request changes</button>
            </div>
          </> : <p style={st.callout}>Waiting for <b>{current.reviewerId}</b>. Only the assigned independent reviewer can approve or return this study.</p>}
        </div>
      )}
    </section>
  );
}

function ReadOnlyStudy({ study }: { study: Study }) {
  return <div style={st.readOnly}>
    <h3 style={st.h3}>{study.title}</h3><p style={st.muted}>Input {study.inputRevision} · author {study.authorId} · reviewer {study.reviewerId}</p>
    <p>{study.scopeSummary}</p>
    <div style={st.summaryGrid}><b>{study.systems.length}<small> systems</small></b><b>{study.requirements.length}<small> requirements</small></b><b>{study.surveyFindings.length}<small> survey findings</small></b><b>{study.clarifications.length}<small> clarifications</small></b><b>{study.deviations.length}<small> deviations</small></b><b>{study.evidence.length}<small> evidence files</small></b></div>
    {study.evidence.length > 0 && <div style={st.docGrid}>{study.evidence.map((document) => <div key={`${document.documentId}:${document.revision}`} style={st.doc}><span><b>{document.title}</b><br /><small>{document.kind.replaceAll('_', ' ')} · frozen revision {document.revision}</small><br /><DocumentFileLink documentId={document.documentId} title={document.title} version={Number(document.revision)} label="Open frozen revision" /></span></div>)}</div>}
    {study.requirements.length > 0 && <table style={st.table}><thead><tr><th>Requirement</th><th>Source</th><th>Assessment</th><th>Response</th></tr></thead><tbody>{study.requirements.map((row) => <tr key={row.id}><td>{row.statement}</td><td>{row.sourceRef || '—'}</td><td>{row.compliance.replace('_', ' ')}</td><td>{row.response || '—'}</td></tr>)}</tbody></table>}
  </div>;
}
function Section({ title, help, children }: { title: string; help: string; children: React.ReactNode }) { return <div style={st.section}><h3 style={st.h3}>{title}</h3><p style={st.help}>{help}</p>{children}</div>; }
function dataLabel(value: string | null | undefined): string | null { return value?.trim() || null; }
function IntakeFact({ label, value }: { label: string; value: string | null | undefined }) { return <span style={st.intakeFact}><small>{label}</small><b>{dataLabel(value) ?? 'Not captured'}</b></span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={st.field}><span>{label}</span>{children}</label>; }
function Step({ label, done }: { label: string; done: boolean }) { return <span style={{ ...st.step, ...(done ? st.stepDone : {}) }}>{done ? '✓ ' : ''}{label}</span>; }
function Status({ status, revisionNo }: { status: StudyStatus; revisionNo: number }) { return <span style={st.status}>S-{String(revisionNo).padStart(3, '0')} · {status.replace('_', ' ')}</span>; }

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: 18 } as CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' } as CSSProperties,
  eyebrow: { margin: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 800, letterSpacing: 1 } as CSSProperties,
  h2: { margin: '3px 0', fontSize: 22 } as CSSProperties,
  h3: { margin: '0 0 5px', fontSize: 14 } as CSSProperties,
  lead: { margin: 0, color: 'var(--muted)', fontSize: 13, maxWidth: 760 } as CSSProperties,
  status: { border: '1px solid var(--border)', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' } as CSSProperties,
  path: { display: 'flex', flexWrap: 'wrap', gap: 7, padding: '14px 0', marginTop: 12, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' } as CSSProperties,
  step: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 9px', color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  stepDone: { color: 'var(--good)', borderColor: 'color-mix(in srgb, var(--good) 45%, var(--border))' } as CSSProperties,
  error: { background: 'color-mix(in srgb, var(--bad) 10%, transparent)', border: '1px solid var(--bad)', borderRadius: 8, padding: 10, color: 'var(--bad)', fontSize: 12.5 } as CSSProperties,
  notice: { background: 'color-mix(in srgb, var(--good) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--good) 45%, var(--border))', borderRadius: 8, padding: 10, color: 'var(--good)', fontSize: 12.5 } as CSSProperties,
  callout: { background: 'var(--panel-2)', border: '1px solid var(--accent)', borderRadius: 8, padding: 10, fontSize: 12.5 } as CSSProperties,
  intakeBox: { marginTop: 14, padding: 12, border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--border))', borderRadius: 10, background: 'var(--panel-2)' } as CSSProperties,
  intakeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 } as CSSProperties,
  intakeFact: { display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--border)', paddingTop: 7, fontSize: 11.5, overflowWrap: 'anywhere' } as CSSProperties,
  section: { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' } as CSSProperties,
  help: { color: 'var(--muted)', fontSize: 12, margin: '0 0 10px' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--panel-2)', color: 'var(--text)', padding: '8px 9px', fontSize: 12.5 } as CSSProperties,
  textarea: { width: '100%', minHeight: 76, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--panel-2)', color: 'var(--text)', padding: '8px 9px', fontSize: 12.5, resize: 'vertical' } as CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, marginTop: 8 } as CSSProperties,
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginBottom: 8 } as CSSProperties,
  rowGrid: { display: 'grid', gridTemplateColumns: 'minmax(140px, .8fr) minmax(120px, .6fr) minmax(200px, 1.4fr) minmax(180px, 1fr) auto', gap: 7, marginBottom: 7, alignItems: 'center' } as CSSProperties,
  stackRow: { border: '1px solid var(--border)', background: 'var(--panel-2)', borderRadius: 8, padding: 9, marginBottom: 8 } as CSSProperties,
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 } as CSSProperties,
  primary: { border: '1px solid var(--accent)', background: 'var(--accent)', color: '#111', borderRadius: 8, padding: '8px 13px', fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  secondary: { border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)', borderRadius: 8, padding: '7px 11px', fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  danger: { border: '1px solid var(--bad)', background: 'transparent', color: 'var(--bad)', borderRadius: 8, padding: '8px 13px', fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  remove: { border: 0, background: 'transparent', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11.5 } as CSSProperties,
  docGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 } as CSSProperties,
  doc: { display: 'flex', alignItems: 'flex-start', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 9, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  uploadBox: { border: '1px dashed var(--border)', borderRadius: 8, padding: 10, marginBottom: 10, background: 'var(--panel-2)' } as CSSProperties,
  revisionUpload: { display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--accent)', fontSize: 11, cursor: 'pointer' } as CSSProperties,
  sourceNote: { display: 'inline-block', marginLeft: 5, color: 'var(--muted)', fontSize: 11 } as CSSProperties,
  history: { border: '1px solid var(--border)', borderRadius: 8, padding: 9, marginTop: 12, fontSize: 12 } as CSSProperties,
  historyRow: { padding: '5px 0', borderTop: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  reviewBox: { marginTop: 14, border: '1px solid var(--accent)', borderRadius: 9, padding: 12 } as CSSProperties,
  blockers: { color: 'var(--bad)', fontSize: 12.5 } as CSSProperties,
  readOnly: { borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 } as CSSProperties,
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, margin: '12px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  link: { color: 'var(--accent)' } as CSSProperties,
  linked: { color: 'var(--good)', fontSize: 11, margin: '2px 0 6px', fontWeight: 700 } as CSSProperties,
  routeCard: { marginTop: 16, border: '1px solid var(--accent)', borderRadius: 9, padding: 14, background: 'var(--panel-2)' } as CSSProperties,
  primaryLink: { display: 'inline-block', borderRadius: 8, padding: '8px 13px', background: 'var(--accent)', color: '#111', fontWeight: 700, textDecoration: 'none' } as CSSProperties,
};
