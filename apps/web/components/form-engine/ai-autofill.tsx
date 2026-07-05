'use client';

// AI Auto-Fill — a form-engine TOOLBAR PLUGIN, not engine core. Paste (or
// upload) document text — invoice, PO, contract, BOQ — and the kernel AI seam
// extracts the schema's fields into the open form for review before saving.
// Registered via registerFormToolbarAction in lib/form-plugins.tsx.

import { useRef, useState } from 'react';
import { buildExtractionPrompt, parseExtraction, type ExtractionResult } from '@aura/shared';
import type { FormApi } from './field-registry';

export default function AiAutofill({ api }: { api: FormApi }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const labelFor = (name: string) => api.schema.fields.find((f) => f.name === name)?.label ?? name;

  async function extract() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { system, prompt } = buildExtractionPrompt(api.schema, text);
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ system, prompt }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `AI service error ${res.status}`);
        return;
      }
      const parsed = parseExtraction(api.schema, data.text ?? '');
      if (!parsed) {
        setError('No form fields could be extracted from this document.');
        return;
      }
      setResult(parsed);
    } catch {
      setError('AI service unreachable.');
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!result) return;
    api.setValues(result.values);
    for (const [field, rows] of Object.entries(result.lines)) api.setLines(field, rows);
    setOpen(false);
    setResult(null);
    setText('');
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setOpen((o) => !o)}>
        ✨ AI Fill
      </button>

      {open ? (
        <div className="fe-ai-panel">
          <div className="fe-ai-title">Fill from document</div>
          <p className="field-hint" style={{ margin: '0 0 8px' }}>
            Paste the text of an invoice, PO, contract, or BOQ — the extracted fields are shown for review before anything is applied.
          </p>
          <textarea
            className="textarea"
            style={{ minHeight: 110, fontSize: 13 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste document text here…"
            disabled={busy}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept=".txt,.md,.csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
            <button type="button" className="btn" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => fileRef.current?.click()} disabled={busy}>
              Upload .txt
            </button>
            <button type="button" className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12.5, marginLeft: 'auto' }} onClick={extract} disabled={busy || !text.trim()}>
              {busy ? 'Extracting…' : 'Extract fields'}
            </button>
          </div>

          {error ? <div className="drawer-error" style={{ marginTop: 8 }}>{error}</div> : null}

          {result ? (
            <div style={{ marginTop: 10 }}>
              <div className="fe-ai-title">Review extracted fields</div>
              <ul className="fe-ai-preview">
                {Object.entries(result.values).map(([k, v]) => (
                  <li key={k}>
                    <span>{labelFor(k)}</span>
                    <strong>{v}</strong>
                  </li>
                ))}
                {Object.entries(result.lines).map(([k, rows]) => (
                  <li key={k}>
                    <span>{labelFor(k)}</span>
                    <strong>{rows.length} line item{rows.length === 1 ? '' : 's'}</strong>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12.5, width: '100%' }} onClick={apply}>
                Apply to form
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
