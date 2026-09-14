'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

interface CreatedDrawing { id?: string; message?: string; error?: string }

/** Registers a drawing without making the engineer leave the project that owns it. */
export default function ProjectDrawingRegisterForm({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('elv');
  const [fileUrl, setFileUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!code.trim() || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/engineering/drawings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName,
          code: code.trim(),
          title: title.trim(),
          discipline,
          fileUrl: fileUrl.trim() || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CreatedDrawing;
      if (!response.ok || !data.id) throw new Error(data.message || data.error || `Registration failed (${response.status})`);
      router.push(`/project/${projectId}/drawings/${data.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={st.card} data-testid="project-drawing-register">
      <div>
        <h2 style={st.h2}>Register a shop drawing</h2>
        <p style={st.copy}>The project is fixed to <strong>{projectName}</strong>. Add the drawing reference, then submit it through review and controlled release.</p>
      </div>
      <form style={st.form} onSubmit={submit}>
        <label style={st.label}>Drawing number
          <input required value={code} onChange={(event) => setCode(event.target.value)} style={st.input} placeholder="ELV-CCTV-SD-001" data-testid="project-drawing-code" disabled={busy || !hydrated} />
        </label>
        <label style={st.label}>Title
          <input required value={title} onChange={(event) => setTitle(event.target.value)} style={st.input} placeholder="CCTV layout — Ground floor" data-testid="project-drawing-title" disabled={busy || !hydrated} />
        </label>
        <label style={st.label}>Discipline
          <select value={discipline} onChange={(event) => setDiscipline(event.target.value)} style={st.input} data-testid="project-drawing-discipline" disabled={busy || !hydrated}>
            <option value="elv">ELV</option>
            <option value="electrical">Electrical</option>
            <option value="mechanical">Mechanical</option>
            <option value="plumbing">Plumbing</option>
            <option value="hvac">HVAC</option>
            <option value="fire_fighting">Fire fighting</option>
            <option value="fire_alarm">Fire alarm</option>
            <option value="civil">Civil</option>
            <option value="architectural">Architectural</option>
            <option value="structural">Structural</option>
            <option value="ict">ICT &amp; networks</option>
            <option value="security">Security</option>
            <option value="cctv">CCTV</option>
            <option value="access_control">Access control</option>
            <option value="bms">BMS</option>
            <option value="mep">MEP coordinated</option>
            <option value="coordination">Coordination</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label style={st.label}>File link <span style={st.optional}>(optional)</span>
          <input type="url" value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} style={st.input} placeholder="https://…" data-testid="project-drawing-file" disabled={busy || !hydrated} />
        </label>
        <button type="submit" style={st.button} disabled={busy || !hydrated || !code.trim() || !title.trim()} data-testid="project-drawing-create">
          {busy ? 'Registering…' : 'Register drawing'}
        </button>
        {error && <p style={st.error} role="alert" data-testid="project-drawing-error">{error}</p>}
      </form>
    </section>
  );
}

const st = {
  card: { display: 'grid', gap: 14, border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 18, background: 'var(--panel-2)' } as CSSProperties,
  h2: { margin: '0 0 4px', fontSize: 16 } as CSSProperties,
  copy: { margin: 0, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.45 } as CSSProperties,
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' } as CSSProperties,
  label: { display: 'grid', gap: 5, color: 'var(--muted)', fontSize: 11.5, fontWeight: 600 } as CSSProperties,
  optional: { fontWeight: 400 } as CSSProperties,
  input: { minWidth: 0, width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', background: 'var(--bg)', color: 'var(--text)', font: 'inherit', fontSize: 13 } as CSSProperties,
  button: { border: 0, borderRadius: 8, padding: '10px 14px', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  error: { gridColumn: '1 / -1', color: 'var(--bad)', margin: 0, fontSize: 12.5 } as CSSProperties,
};
