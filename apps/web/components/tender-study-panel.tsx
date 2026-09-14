'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DocumentFileLink from './document-file-link';
import styles from './tender-study-panel.module.css';

const categories = {
  drawing: 'Drawings', client_specification: 'Client specifications', client_requirement: 'Client requirements',
  scope_summary: 'Scope summary', system_identification: 'System identification', government_requirement: 'Government & authority requirements',
  site_information: 'Site information', study_note: 'Study notes & assumptions',
};
const prompts: Record<string, string> = {
  scope_summary: 'Describe the work, deliverables, inclusions, exclusions and interfaces with other trades.',
  system_identification: 'List the systems to study, their purpose, locations, interfaces and required performance.',
  government_requirement: 'Record the jurisdiction, authority, applicable requirement, source/reference, approval needed and any point awaiting verification.',
  client_requirement: 'Record the client’s functional requirements, acceptance criteria, priorities and open questions.',
};
type StudyFile = { id: string; title: string; kind: string };

export default function TenderStudyPanel({ tenderId }: { tenderId: string }) {
  const [documents, setDocuments] = useState<StudyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [category, setCategory] = useState('drawing');
  const [mode, setMode] = useState('file');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const endpoint = `/api/tendering/tenders/${encodeURIComponent(tenderId)}/study-files`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Could not load study files');
      setDocuments(data);
    } finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null); setNotice('');
    if (mode === 'file' && (!file || file.size > 25 * 1024 * 1024)) { setError('Choose a file up to 25 MB.'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.set('category', category); body.set('title', title.trim());
      if (mode === 'file') body.set('file', file!); else body.set('notes', notes.trim());
      const response = await fetch(endpoint, { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Could not save study entry');
      setTitle(''); setNotes(''); setFile(null); if (input.current) input.current.value = '';
      setNotice('Saved to this tender’s study register.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save study entry'); }
    finally { setBusy(false); }
  }

  return <section id="scope" className={styles.panel} aria-labelledby="tender-study-heading">
    <h2 id="tender-study-heading">Tender scope &amp; specifications</h2>
    <p>Build the study case: collect source files, identify systems, define the scope and record client and authority requirements.</p>
    <div className={styles.categories}>{Object.entries(categories).map(([key, label]) => <span key={key}>{label} <b>{documents.filter(d => d.kind === key).length}</b></span>)}</div>
    <form onSubmit={save} className={styles.form}>
      <fieldset disabled={busy}>
        <div className={styles.row}>
          <label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Add<select value={mode} onChange={e => setMode(e.target.value)}><option value="file">Upload a file</option><option value="note">Write a study note</option></select></label>
        </div>
        <label>Title<input required maxLength={240} value={title} onChange={e => setTitle(e.target.value)} placeholder="For example: ELV systems — client requirements, revision A" /></label>
        {mode === 'file' ? <label>Source file · up to 25 MB<input ref={input} type="file" required onChange={e => { const selected = e.target.files?.[0] ?? null; setFile(selected); if (selected && !title) setTitle(selected.name); }} /><small>Drawings, PDFs, specifications, spreadsheets, images and supporting documents.</small></label>
          : <label>Study notes<textarea required maxLength={100000} rows={6} value={notes} onChange={e => setNotes(e.target.value)} placeholder={prompts[category] ?? 'Record findings, source references, assumptions and questions to resolve.'} /></label>}
        <button type="submit">{busy ? 'Saving…' : mode === 'file' ? 'Upload to tender study' : 'Save study note'}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => { setError(null); void load().catch((e: Error) => setError(e.message)); }}>Retry loading</button></p>}
    {notice && <p role="status">{notice}</p>}
    <h3>Study file register</h3>
    {loading ? <p>Loading study files…</p> : documents.length === 0 ? <p>No accessible study files recorded yet.</p> : <ul className={styles.files}>{documents.map(document => <li key={document.id}><span><strong>{document.title}</strong><small>{categories[document.kind as keyof typeof categories] ?? document.kind}</small></span><DocumentFileLink documentId={document.id} title={document.title} /></li>)}</ul>}
    <p className={styles.note}>Files and notes remain linked to this tender in Document Management. Record the source of government requirements and verify applicability during the study.</p>
  </section>;
}
