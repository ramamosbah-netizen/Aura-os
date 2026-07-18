'use client';

// FormDrawer — the slide-over shell around FormRenderer. Owns open/close,
// submit (POST create / PATCH edit), rule warnings + blocking errors, toast,
// and plugin toolbar actions. Pure metadata in: pass a FormSchema and it does
// the rest. The legacy CreateDrawer delegates here.

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyFormOverrides, buildFormPayload, hasOverrides, type FormOverrides, type FormSchema } from '@aura/shared';
import FormRenderer, { useFormEngine } from './FormRenderer';
import { formToolbarActions, type FormApi, type FormMode } from './field-registry';

export type FormDrawerMode = FormMode;

export interface FormDrawerProps {
  schema: FormSchema;
  /** create = POST; edit = PATCH + prefill; clone = POST + prefill; view = read-only */
  mode?: FormDrawerMode;
  /** record id — appended to schema.endpoint for edit-mode PATCH */
  recordId?: string;
  initialValues?: Record<string, string>;
  /** prefill for lines fields (edit/clone/view of records with line items) */
  initialLines?: Record<string, import('@aura/shared').FormLineItem[]>;
  buttonLabel?: string;
  /** permission keys of the current session (gates permission-bound fields) */
  permissions?: string[];
  /** called after a successful save, before router.refresh() */
  onSaved?: (payload: Record<string, unknown>) => void;
}

// Module-level cache: each schema's Form Designer patch fetches once per page
// life, not once per drawer (list pages mount one edit-drawer per row).
const overridesCache = new Map<string, Promise<FormOverrides | null>>();

function fetchOverrides(schemaId: string): Promise<FormOverrides | null> {
  let p = overridesCache.get(schemaId);
  if (!p) {
    p = fetch(`/api/forms/${encodeURIComponent(schemaId)}/overrides`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<FormOverrides>) : null))
      .catch(() => null);
    overridesCache.set(schemaId, p);
  }
  return p;
}

/**
 * Public wrapper: resolve the tenant's Form Designer overrides (Vol 15 §2.4)
 * and remount the drawer on the merged schema — users see exactly what the
 * admin configured, and assertFormValid enforces the same merge server-side.
 * Falls back to the code schema when the read fails; the drawer starts closed,
 * so the pre-open remount is invisible.
 */
export default function FormDrawer(props: FormDrawerProps) {
  const [effective, setEffective] = useState<FormSchema | null>(null);

  useEffect(() => {
    let live = true;
    void fetchOverrides(props.schema.id).then((o) => {
      if (live) setEffective(hasOverrides(o) ? applyFormOverrides(props.schema, o) : props.schema);
    });
    return () => {
      live = false;
    };
  }, [props.schema]);

  // key flips once the merged schema lands → useFormEngine re-initializes on it
  return <FormDrawerImpl key={effective ? 'fx' : 'base'} {...props} schema={effective ?? props.schema} />;
}

function FormDrawerImpl({
  schema,
  mode = 'create',
  recordId,
  initialValues,
  initialLines,
  buttonLabel,
  permissions,
  onSaved,
}: FormDrawerProps) {
  const router = useRouter();
  const isEdit = mode === 'edit';
  const isView = mode === 'view';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const engine = useFormEngine(schema, { initialValues, initialLines, permissions });

  // not memoized: engine.reset closes over the current render's schema and
  // initialValues, so a fresh callback keeps edit-mode prefills up to date
  const openDrawer = () => {
    engine.reset();
    setErr(null);
    setOpen(true);
  };

  const close = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || isView) return;
    engine.setTouched(true);
    const evaluation = engine.evaluateForSubmit();
    if (Object.keys(evaluation.fieldErrors).length > 0 || evaluation.errors.length > 0) return;

    setBusy(true);
    setErr(null);
    try {
      const payload = buildFormPayload(schema.fields, evaluation.values, engine.lines, evaluation.state);
      const endpoint = isEdit && recordId ? `${schema.endpoint}/${recordId}` : schema.endpoint;
      const res = await fetch(endpoint, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setErr(d.error ?? d.message ?? `Error ${res.status}`);
      } else {
        setOpen(false);
        setToast(`${schema.entity} ${isEdit ? 'updated' : 'created'}`);
        onSaved?.(payload);
        // A create can hand straight off to the next step (e.g. a new quotation → its
        // pricing sheet). Substitute the created record's id into the template.
        if (!isEdit && schema.createdRedirect) {
          const created = (await res.json().catch(() => null)) as { id?: string } | null;
          if (created?.id) { router.push(schema.createdRedirect.replace(':id', created.id)); return; }
        }
        router.refresh();
      }
    } catch {
      setErr('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  const { evaluation } = engine;
  const blocked = engine.touched && (Object.keys(evaluation.fieldErrors).length > 0 || evaluation.errors.length > 0);
  const toolbar = formToolbarActions(schema);
  const formApi: FormApi = {
    schema,
    mode,
    values: engine.values,
    setValues: engine.setValues,
    lines: engine.lines,
    setLines: engine.setLines,
  };

  return (
    <>
      {mode === 'create' ? (
        <button type="button" className="btn btn-primary" onClick={openDrawer}>
          <span aria-hidden>＋</span> {buttonLabel ?? `New ${schema.entity}`}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={openDrawer}>
          {buttonLabel ?? (isEdit ? 'Edit' : mode === 'clone' ? 'Clone' : 'View')}
        </button>
      )}

      {toast ? (
        <div className="toast" role="status">
          <span className="dot" /> {toast}
        </div>
      ) : null}

      {open ? (
        <>
          <div className="drawer-overlay" onClick={close} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label={`${isEdit ? 'Edit' : 'New'} ${schema.entity}`}>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-head">
                <div>
                  <h2 className="drawer-title">
                    {isEdit ? `Edit ${schema.entity}`
                      : isView ? schema.entity
                      : mode === 'clone' ? `New ${schema.entity} (copy)`
                      : `New ${schema.entity}`}
                  </h2>
                  {schema.subtitle && !isView ? <p className="drawer-sub">{schema.subtitle}</p> : null}
                </div>
                {toolbar.length > 0 && !isView ? (
                  <div className="fe-toolbar">{toolbar.map((a) => <span key={a.id}>{a.render(formApi)}</span>)}</div>
                ) : null}
                <button type="button" className="btn btn-ghost" onClick={close} aria-label="Close">
                  ✕
                </button>
              </div>

              <div className="drawer-body">
                {err ? <div className="drawer-error">{err}</div> : null}
                {evaluation.errors.map((m, i) => (
                  <div key={`e${i}`} className="drawer-error">
                    {m}
                  </div>
                ))}
                {evaluation.warnings.map((m, i) => (
                  <div key={`w${i}`} className="fe-warning">
                    {m}
                  </div>
                ))}

                <FormRenderer engine={engine} busy={busy || isView} />
              </div>

              <div className="drawer-foot">
                {blocked ? (
                  <span style={{ color: 'var(--bad)', fontSize: 13, marginRight: 'auto' }}>
                    {evaluation.errors[0] ??
                      Object.values(evaluation.fieldErrors)[0] ??
                      'Fix the highlighted fields.'}
                  </span>
                ) : null}
                <button type="button" className="btn" onClick={close} disabled={busy}>
                  {isView ? 'Close' : 'Cancel'}
                </button>
                {!isView ? (
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : isEdit ? 'Save changes' : `Create ${schema.entity}`}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
