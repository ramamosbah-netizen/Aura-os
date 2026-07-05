'use client';

// AI Review — a form-engine TOOLBAR PLUGIN. Sends the current draft record
// to the kernel AI seam for a data-quality pass: invalid values, likely
// typos, missing critical information, unusual combinations. Advisory only —
// issues never block the save; per-field suggestions apply in one click.

import { useState } from 'react';
import { buildReviewPrompt, parseReview, type ReviewIssue } from '@aura/shared';
import type { FormApi } from './field-registry';

export default function AiReview({ api }: { api: FormApi }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ReviewIssue[] | null>(null);

  const labelFor = (name?: string) =>
    name ? (api.schema.fields.find((f) => f.name === name)?.label ?? name) : null;

  async function review() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setIssues(null);
    try {
      const { system, prompt } = buildReviewPrompt(api.schema, api.values, api.lines);
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
      const parsed = parseReview(api.schema, data.text ?? '');
      if (parsed === null) {
        setError('The AI review returned no readable result.');
        return;
      }
      setIssues(parsed);
    } catch {
      setError('AI service unreachable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: '4px 10px', fontSize: 12.5 }}
        onClick={() => {
          setOpen((o) => !o);
          if (!open && issues === null && !busy) void review();
        }}
      >
        ✓ AI Review
      </button>

      {open ? (
        <div className="fe-ai-panel">
          <div className="fe-ai-title">Data-quality review</div>
          {busy ? <p className="field-hint" style={{ margin: 0 }}>Reviewing the draft record…</p> : null}
          {error ? <div className="drawer-error" style={{ marginTop: 4 }}>{error}</div> : null}

          {issues !== null && issues.length === 0 ? (
            <p className="field-hint" style={{ margin: 0, color: 'var(--good)' }}>
              ✓ No issues found — the record looks consistent.
            </p>
          ) : null}

          {issues !== null && issues.length > 0 ? (
            <ul className="fe-ai-preview">
              {issues.map((issue, i) => (
                <li key={i} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  {issue.field ? <span>{labelFor(issue.field)}</span> : null}
                  <strong style={{ fontWeight: 500 }}>{issue.message}</strong>
                  {issue.field && issue.suggestion ? (
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '3px 10px', fontSize: 12, alignSelf: 'flex-start' }}
                      onClick={() => api.setValues({ [issue.field as string]: issue.suggestion as string })}
                    >
                      Apply “{issue.suggestion}”
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            className="btn"
            style={{ padding: '5px 12px', fontSize: 12.5, marginTop: 8, width: '100%' }}
            onClick={review}
            disabled={busy}
          >
            {busy ? 'Reviewing…' : 'Re-run review'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
