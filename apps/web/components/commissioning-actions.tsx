'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import SignatureCanvas from './ui/signature-canvas';

interface OpenPunch { id: string; description: string; severity: string }

/** Whose witness. The engineer signs for the contractor by definition and is not asked. */
type WitnessAuthority = 'consultant' | 'client' | 'authority';

/**
 * Commissioning 360 actions (G-34+). Close outstanding punch items (the retest gate) and record the
 * witnessed sign-off. The backend enforces "no open defects" before commissioning — the button
 * surfaces that 409 rather than hiding it.
 */
export default function CommissioningActions({
  id, status, openPunch, allPassed, onChanged,
}: {
  id: string;
  status: string;
  openPunch: OpenPunch[];
  allPassed: boolean;
  /** Reconciliation hook — see CommissioningTestSheet. Defaults to refreshing the server page. */
  onChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Controls stay inert until React attaches — see `useHydrated`. A click or a keystroke
  // landing on the server-rendered markup is otherwise swallowed without trace.
  const hydrated = useHydrated();
  const locked = busy || !hydrated;
  const [error, setError] = useState<string | null>(null);
  const [by, setBy] = useState('');
  const [witness, setWitness] = useState('');
  /**
   * THE SIGNATURES THE SCREEN COULD NOT TAKE.
   *
   * The API, the store and the evidence pack have carried a witnessed sign-off's signatures since
   * XOP-12 step 3 — and no screen offered a pad, so the only way to sign one was to call the API
   * directly. The pack printed "Recorded for … with no signature on file" for every sign-off made
   * through the product, truthfully and uselessly.
   *
   * `by` and `witness` are the SIGNATORIES' names: `commissionedBy` and `witnessedBy` are labels
   * for the people who sign, not AURA accounts, so each pad is paired with the name already being
   * captured beside it rather than asking for it twice.
   */
  const [engineerInk, setEngineerInk] = useState<string | null>(null);
  const [witnessInk, setWitnessInk] = useState<string | null>(null);
  /**
   * WHOSE WITNESS. `party` says which side signed; this says whose standing it was, and on a UAE
   * ELV project a consultant's witness, the client's own representative and an authority
   * inspector are three different things on a certificate. The engineer signs for the contractor
   * by definition, so only the witness is asked.
   */
  const [witnessAuthority, setWitnessAuthority] = useState<WitnessAuthority>('consultant');
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState<string[]>([]);

  async function call(path: string, body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${id}/${path}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Command failed (${res.status})`);
      }
      if (onChanged) await onChanged();
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Send one attachment to storage and record it against the system, in one call.
   *
   * Not batched with the sign-off: attachments accumulate WHILE the test is run and the signature
   * is given when it is decided, so folding them into one act would make an engineer sign before
   * they had finished testing.
   */
  async function attach(file: File): Promise<void> {
    setAttaching(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('category', /pdf$/i.test(file.name) ? 'certificate' : 'photo');
      form.append('description', file.name);
      const res = await fetch(`/api/commissioning/records/${id}/attachments`, { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.message || body.error || `attachment failed (${res.status})`);
      setAttached((prev) => [...prev, file.name]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Attachment failed');
    } finally {
      setAttaching(false);
    }
  }

  /**
   * SIGN OFF, with whatever was actually signed.
   *
   * The names are REQUIRED rather than defaulted. This used to send `by || 'Engineer'` and
   * `witness || 'Consultant'`, so a sign-off made without typing anything recorded two people
   * called "Engineer" and "Consultant" as having signed it — a record asserting names nobody
   * gave, which is the same defect as the pad that discarded the stroke.
   *
   * A pad with ink on it must have a name beside it, because the signature is filed AGAINST that
   * name; the domain refuses it too, and this is the message that can point at the field.
   */
  async function commission(): Promise<void> {
    if (!by.trim() || !witness.trim()) {
      setError('Name the engineer signing off and the witness. A sign-off records who signed it.');
      return;
    }
    const evidence: Array<{ party: string; signedBy: string; method: string; evidence: string; authority?: string }> = [];
    if (engineerInk) evidence.push({ party: 'commissioning_engineer', signedBy: by.trim(), method: 'electronic', evidence: engineerInk });
    if (witnessInk) evidence.push({ party: 'witness', signedBy: witness.trim(), method: 'electronic', evidence: witnessInk, authority: witnessAuthority });

    await call('commission', {
      commissionedBy: by.trim(),
      witnessedBy: witness.trim(),
      // Omitted entirely when nothing was signed, so the record carries no empty evidence.
      ...(evidence.length ? { signoffEvidence: evidence } : {}),
    });
  }

  if (status === 'commissioned') {
    return <div style={st.wrap} data-testid="cx-actions" data-status={status}><span style={st.locked} data-testid="cx-locked">🔒 Commissioned &amp; witnessed — immutable.</span></div>;
  }

  return (
    <div style={st.wrap} data-testid="cx-actions" data-status={status}>
      {openPunch.length > 0 && (
        <div style={st.punchGate} data-testid="punch-gate">
          <strong>{openPunch.length} open punch item(s)</strong> must be closed before sign-off:
          {openPunch.map((p) => (
            <button key={p.id} style={st.closeBtn} disabled={locked} data-testid={`close-punch-${p.id}`}
              onClick={() => call(`punch/${p.id}/close`, { resolution: `Rectified: ${p.description}` })}>
              Close “{p.description}” →
            </button>
          ))}
        </div>
      )}

      <div style={st.group}>
        <input style={st.input} placeholder="Commissioned by" value={by} onChange={(e) => setBy(e.target.value)} disabled={locked} />
        <input style={st.input} placeholder="Witnessed by (consultant/client)" value={witness} onChange={(e) => setWitness(e.target.value)} disabled={locked} />
        <button
          style={{ ...st.primary, ...(allPassed && openPunch.length === 0 ? {} : st.primaryDim) }}
          disabled={locked}
          data-testid="btn-commission"
          onClick={() => void commission()}
        >
          Commission (sign off)
        </button>
      </div>

      {/* A PAD PER PARTY. Each signs beside their own name, and a sign-off with neither is still
          valid — the evidence pack then says exactly that instead of printing a ruled line under
          a note claiming the sign-off was witnessed. */}
      {/* WHAT THE TEST PRODUCED. Commissioning had no door for a file at all, so an instrument
          printout or a photograph of the installed device had nowhere to go. */}
      <label style={st.attachRow} data-testid="cx-attachments">
        <span style={st.hint}>Test evidence (photo, instrument output, calibration certificate)</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          disabled={locked || attaching}
          data-testid="cx-attachment-file"
          onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void attach(f); }}
        />
        {attached.length > 0 && (
          <span style={st.hint} data-testid="cx-attached-count">{attached.length} attached: {attached.join(', ')}</span>
        )}
      </label>

      <div style={st.signGrid} data-testid="cx-signatures">
        <SignatureCanvas
          label="Commissioning Engineer signature"
          value={engineerInk}
          onChange={setEngineerInk}
          height={100}
        />
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
            The witness signs{' '}
            <select
              value={witnessAuthority}
              onChange={(e) => setWitnessAuthority(e.target.value as WitnessAuthority)}
              disabled={locked}
              data-testid="cx-witness-authority"
              style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'var(--bg, #fff)', color: 'inherit', fontSize: 13 }}
            >
              <option value="consultant">for the consultant</option>
              <option value="client">for the client</option>
              <option value="authority">for the authority having jurisdiction</option>
            </select>
          </label>
          <SignatureCanvas
            label="Witness signature (consultant / client)"
            value={witnessInk}
            onChange={setWitnessInk}
            height={100}
          />
        </div>
      </div>
      {!allPassed && <span style={st.hint}>All test points must pass before sign-off.</span>}
      {error && <span style={st.error} data-testid="cx-error">{error}</span>}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'var(--surface, var(--panel-2))' } as CSSProperties,
  group: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 180 } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--good)', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  primaryDim: { background: 'var(--muted)' } as CSSProperties,
  attachRow: { display: 'grid', gap: 6 } as CSSProperties,
  signGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 } as CSSProperties,
  punchGate: { fontSize: 13, color: 'var(--warn)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  closeBtn: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'var(--bg, #fff)', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  locked: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600 } as CSSProperties,
};
