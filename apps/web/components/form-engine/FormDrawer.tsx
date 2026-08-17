'use client';

// FormDrawer — the slide-over shell around FormRenderer. Owns open/close,
// submit (POST create / PATCH edit), rule warnings + blocking errors, toast,
// and plugin toolbar actions. Pure metadata in: pass a FormSchema and it does
// the rest. The legacy CreateDrawer delegates here.

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
 *
 * Everything here keys on the STABLE `schema.id`, never on props.schema's object identity.
 * The legacy CreateDrawer rebuilds its FormSchema object on every render (its `fields` prop is
 * a fresh array literal at the call site), so an identity-based effect dep or remount key would
 * refire and flip on *every* parent re-render — remounting FormDrawerImpl, and with it the open
 * drawer's `open`/`values` state and even the trigger button. That is the regression that broke
 * the spine E2E: the `create-opportunity` button lives in the impl, so a churning key detached
 * it mid-click ("element is not stable"). We store only the override *outcome* (sticky per id)
 * and re-apply it to the live props.schema each render, so schema content stays fresh while the
 * key transitions base→patched at most once.
 */
export default function FormDrawer(props: FormDrawerProps) {
  const schemaId = props.schema.id;
  const [resolvedOverrides, setResolvedOverrides] = useState<{ id: string; overrides: FormOverrides | null } | null>(null);

  useEffect(() => {
    let live = true;
    void fetchOverrides(schemaId).then((o) => {
      if (live) setResolvedOverrides({ id: schemaId, overrides: hasOverrides(o) ? o : null });
    });
    return () => {
      live = false;
    };
    // Deps are exhaustive: the effect reads only schemaId (props.schema's stable identity — the
    // overridesCache is keyed by it too). The merge against props.schema happens in render, below,
    // deliberately keeping this off props.schema's object identity so it can't refire per render.
  }, [schemaId]);

  // `patched` is a sticky boolean, decided once when the overrides resolve for this id — not a
  // live object comparison — so the remount key cannot oscillate under a churning schema prop.
  // The merge runs against the *current* props.schema so live enrichment (e.g. a select whose
  // options grow as records are added) still flows through without a remount.
  const ready = resolvedOverrides !== null && resolvedOverrides.id === schemaId;
  const patched = ready && resolvedOverrides.overrides !== null;
  const schema = patched ? applyFormOverrides(props.schema, resolvedOverrides.overrides!) : props.schema;
  return <FormDrawerImpl key={patched ? `${schemaId}:fx` : `${schemaId}:base`} {...props} schema={schema} />;
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

  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Escape to close + focus trap (WCAG 2.1.2 No Keyboard Trap / 2.4.3 Focus Order).
  // The drawer is aria-modal, so focus must not be able to Tab out into the page
  // behind it — previously Tab escaped straight into the background content.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // move focus into the drawer on open
    focusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // wrap at both ends, and pull focus back in if it has already escaped
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // return focus to whatever opened the drawer
      restoreFocusRef.current?.focus?.();
    };
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
  // Stable E2E hooks, keyed by entity so a page hosting several drawers stays unambiguous
  // (e.g. Projects renders both a create and a per-row edit drawer). Every create flow in the
  // app routes through here, so these four testids cover the whole surface — G-03.
  const slug = schema.entity.toLowerCase().replace(/\s+/g, '-');
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
        <button type="button" data-testid={`create-${slug}`} className="btn btn-primary" onClick={openDrawer}>
          <span aria-hidden>＋</span> {buttonLabel ?? `New ${schema.entity}`}
        </button>
      ) : (
        <button type="button" data-testid={`${mode}-${slug}`} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={openDrawer}>
          {buttonLabel ?? (isEdit ? 'Edit' : mode === 'clone' ? 'Clone' : 'View')}
        </button>
      )}

      {toast ? (
        <div className="toast" role="status" data-testid="form-toast">
          <span className="dot" /> {toast}
        </div>
      ) : null}

      {open ? (
        <>
          <div className="drawer-overlay" onClick={close} />
          <div ref={panelRef} data-testid={`drawer-${slug}`} className="drawer" role="dialog" aria-modal="true" aria-labelledby={`drawer-title-${slug}`}>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-head">
                <div>
                  <h2 id={`drawer-title-${slug}`} className="drawer-title">
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
                {err ? <div className="drawer-error" role="alert" data-testid={`drawer-error-${slug}`}>{err}</div> : null}
                {evaluation.errors.map((m, i) => (
                  <div key={`e${i}`} className="drawer-error" role="alert">
                    {m}
                  </div>
                ))}
                {evaluation.warnings.map((m, i) => (
                  <div key={`w${i}`} className="fe-warning" role="status">
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
                  <button type="submit" data-testid={`submit-${slug}`} className="btn btn-primary" disabled={busy}>
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
