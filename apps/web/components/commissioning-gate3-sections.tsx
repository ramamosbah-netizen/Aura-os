'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import EmptyState from '@/components/ui/empty-state';
import Pager, { usePaged } from './ui/pager';
import type { PunchRow, SystemView } from './commissioning-workspace-client';

/**
 * The four surfaces TC-GATE-3 adds: Inspection & Test Plans, Pre-Commissioning, Certificates &
 * Records, and Readiness & Handover.
 *
 * What they have in common is that most of what they show is NOT T&C's. The ITP and its results are
 * Quality's; the device schedule is the ELV register's; the drawings are Engineering's; formal
 * document issue is DocControl's. Each surface reads those domains, names them on the page, and
 * offers no writer for any of them. The one thing T&C writes here is the LINK that says a Quality
 * requirement applies to one of its systems — a sentence about its own scope, not about the plan.
 */

export interface ItpFact {
  id: string;
  reference: string;
  title: string;
  discipline: string;
  status: string;
  points: { activity: string; pointType: string; acceptanceCriteria: string; result: string }[];
}
export interface NcrFact { id: string; ncrNumber: string; system: string | null; severity: string; status: string }
export interface QualityEvidence { ncrs: NcrFact[]; itps: ItpFact[] }
export interface DeviceRow {
  id: string; tag: string; system: string; model?: string | null; location?: string | null;
  status: string; commissioningRecordId: string | null;
}

// ── Inspection & Test Plans ─────────────────────────────────────────────────────────────────────

export function ItpSection({
  systems, evidence,
}: { systems: SystemView[]; evidence: QualityEvidence | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});

  async function link(system: SystemView, itpId: string): Promise<void> {
    if (busy || !itpId) return;
    setBusy(system.record.id);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${system.record.id}/itp-links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itpId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not link the ITP (${res.status})`);
      }
      setChoice({ ...choice, [system.record.id]: '' });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link the ITP');
    } finally {
      setBusy(null);
    }
  }

  async function unlink(system: SystemView, linkId: string): Promise<void> {
    if (busy) return;
    setBusy(linkId);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${system.record.id}/itp-links/${linkId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Could not remove the link (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the link');
    } finally {
      setBusy(null);
    }
  }

  const itpPage = usePaged(systems);

  return (
    <section aria-label="Inspection and test plans" style={st.section}>
      {error && <p style={st.error} role="alert" data-testid="itp-error">{error}</p>}

      <p style={st.authorityNote} data-testid="itp-authority">
        Inspection &amp; Test Plans are owned by <strong>Quality</strong> — the plan, its acceptance criteria and every
        point&rsquo;s result are set there and only read here. T&amp;C records one thing of its own: which plan applies to
        which system. That link is explicit because the two sides do not share a vocabulary — an ITP carries a free-text
        discipline, a commissioning record carries a canonical ELV system — and guessing the match would put the wrong
        acceptance criteria in front of an engineer.
      </p>

      {evidence === null ? (
        <div style={st.unavailable} role="alert" data-testid="itp-unavailable">
          Quality could not be read, so no plans are shown. An empty list here would look like &ldquo;no requirements&rdquo;.
        </div>
      ) : systems.length === 0 ? (
        <EmptyState compact title="No systems in commissioning scope" description="Register a system first; requirements are linked to a system, not to a project." />
      ) : (
        <>
        <ul style={st.list} data-testid="itp-systems">
          {itpPage.slice.map((s) => {
            const available = evidence.itps.filter((itp) => !s.itpRequirements.some((r) => r.itpId === itp.id));
            return (
              <li key={s.record.id} style={st.card} data-testid={`itp-system-${s.record.code}`}>
                <div style={st.cardHead}>
                  <a href={`/commissioning/${s.record.id}`} style={st.code}>{s.record.code}</a>
                  <strong style={st.grow} title={s.record.title}>{s.record.title}</strong>
                  <span style={st.muted}>{s.itpRequirements.length} linked requirement{s.itpRequirements.length === 1 ? '' : 's'}</span>
                </div>

                {s.itpRequirements.length === 0 ? (
                  <p style={st.muted}>No ITP is linked to this system. Its Quality gate will say so rather than pass by default.</p>
                ) : (
                  <table style={st.table}>
                    <thead><tr>{['Plan', 'Activity', 'Point', 'Acceptance criteria', 'Quality result', 'Proven by', ''].map((h) => <th key={h} scope="col" style={st.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {s.itpRequirements.map((r) => (
                        <tr key={`${r.linkId}-${r.pointIndex}`} data-testid={`itp-req-${r.reference}-${r.pointIndex}`}>
                          <th scope="row" style={st.tdCode}>{r.reference}</th>
                          <td style={st.td}>{r.activity}</td>
                          <td style={st.tdMuted}>{r.pointType}</td>
                          <td style={st.tdMuted}>{r.acceptanceCriteria || '—'}</td>
                          <td style={{ ...st.td, ...resultStyle(r.result) }}>{r.result}</td>
                          <td style={st.tdMuted}>{r.testPointNo ?? 'not nominated'}</td>
                          <td style={st.tdMuted}>
                            <button style={st.smallBtn} disabled={busy !== null || !hydrated} onClick={() => unlink(s, r.linkId)} data-testid={`itp-unlink-${r.reference}`}>Unlink</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div style={st.row}>
                  <label style={st.field}>
                    <span>Link a plan from Quality</span>
                    <select
                      value={choice[s.record.id] ?? ''}
                      onChange={(e) => setChoice({ ...choice, [s.record.id]: e.target.value })}
                      disabled={busy !== null || available.length === 0}
                      style={st.select}
                      data-testid={`itp-select-${s.record.code}`}
                    >
                      <option value="">{available.length === 0 ? 'No unlinked plans on this project' : 'Choose an ITP…'}</option>
                      {available.map((itp) => <option key={itp.id} value={itp.id}>{itp.reference} — {itp.title} ({itp.discipline})</option>)}
                    </select>
                  </label>
                  <button
                    style={st.primary}
                    disabled={busy !== null || !hydrated || !choice[s.record.id]}
                    onClick={() => link(s, choice[s.record.id] ?? '')}
                    data-testid={`itp-link-${s.record.code}`}
                  >
                    {busy === s.record.id ? 'Linking…' : 'Link ITP'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <Pager state={itpPage} label="systems" testId="itp-systems-pager" />
        </>
      )}
    </section>
  );
}

// ── Pre-Commissioning ───────────────────────────────────────────────────────────────────────────

const PRE_GATES = ['equipment', 'installation', 'engineering', 'quality'] as const;

export function PreCommissioningSection({ systems }: { systems: SystemView[] }) {
  const prePage = usePaged(systems);

  return (
    <section aria-label="Pre-commissioning" style={st.section}>
      <p style={st.authorityNote} data-testid="pre-authority">
        Every gate below is <strong>derived from the domain that owns it</strong> — the ELV device register for equipment
        and installation, Engineering for released drawings, Quality for non-conformances and linked ITP points. There is
        no checkbox here to tick: a gate nobody can answer reads <strong>UNKNOWN</strong> and blocks, because a gate that
        passed for want of evidence is worse than one that fails.
      </p>

      {systems.length === 0 ? (
        <EmptyState compact title="No systems in commissioning scope" description="Register a system to see what stands between it and testing." />
      ) : (
        <>
        <ul style={st.list} data-testid="pre-systems">
          {prePage.slice.map((s) => {
            const gates = s.readiness.gates.filter((g) => (PRE_GATES as readonly string[]).includes(g.id));
            const clear = gates.every((g) => g.state === 'READY' || g.state === 'NOT_APPLICABLE');
            return (
              <li key={s.record.id} style={st.card} data-testid={`pre-system-${s.record.code}`}>
                <div style={st.cardHead}>
                  <a href={`/commissioning/${s.record.id}`} style={st.code}>{s.record.code}</a>
                  <strong style={st.grow} title={s.record.title}>{s.record.title}</strong>
                  <span style={clear ? st.tagGood : st.tagWarn} data-testid={`pre-state-${s.record.code}`}>
                    {clear ? 'ready to test' : 'prerequisites outstanding'}
                  </span>
                </div>
                <GateList gates={gates} testIdPrefix={`pre-gate-${s.record.code}`} />
              </li>
            );
          })}
        </ul>
        <Pager state={prePage} label="systems" testId="pre-systems-pager" />
        </>
      )}
    </section>
  );
}

// ── Certificates & Records ──────────────────────────────────────────────────────────────────────

export function CertificatesSection({ systems }: { systems: SystemView[] }) {
  const commissioned = systems.filter((s) => s.commissioned);
  const certPage = usePaged(commissioned);

  return (
    <section aria-label="Certificates and records" style={st.section}>
      <p style={st.authorityNote} data-testid="certificates-authority">
        T&amp;C generates <strong>technical evidence</strong>: the test sheet, the full run history behind every point
        including the failures, and the witnessed sign-off. Issuing a <strong>controlled certificate</strong> is still
        DocControl&rsquo;s authority — T&amp;C never creates a register entry, assigns a number or issues anything.
        What T&amp;C owns are the two <strong>links</strong> below: that a particular controlled document is this
        system&rsquo;s <strong>certificate</strong>, and that a particular controlled drawing is its <strong>as-built</strong>.
        Neither could be joined automatically — every ELV system on a project shares one discipline — so each is a
        sentence a person writes, and everything shown about the document is read from the register as it stands now.
      </p>

      <AsBuiltLinks systems={systems} />

      {commissioned.length === 0 ? (
        <EmptyState compact title="No system has been signed off yet" description="An evidence pack is assembled once a system is commissioned with a witness on record." />
      ) : (
        <>
        <ul style={st.list} data-testid="certificate-list">
          {certPage.slice.map((s) => (
            <li key={s.record.id} style={st.card} data-testid={`certificate-${s.record.code}`}>
              <div style={st.cardHead}>
                <a href={`/commissioning/${s.record.id}`} style={st.code}>{s.record.code}</a>
                <strong style={st.grow} title={s.record.title}>{s.record.title}</strong>
                <a href={`/commissioning/${s.record.id}/certificate`} style={st.printLink} data-testid={`certificate-open-${s.record.code}`}>
                  Open evidence pack →
                </a>
              </div>
              <dl style={st.factGrid}>
                <div><dt>Test points</dt><dd>{s.pointsTotal}</dd></div>
                <div><dt>Passed on retest</dt><dd>{s.pointsEverFailed}</dd></div>
                <div><dt>Signed off by</dt><dd>{s.record.status === 'commissioned' ? 'recorded' : '—'}</dd></div>
                <div>
                  <dt>Formal issue</dt>
                  <dd data-testid={`certificate-issue-${s.record.code}`}>
                    {s.certificate === null ? (
                      <span style={st.mutedInline}>evidence pack only</span>
                    ) : s.certificate.current ? (
                      <span style={st.ref}>{s.certificate.documentNumber} rev {s.certificate.revision}</span>
                    ) : (
                      <span style={st.note}>{s.certificate.documentNumber ?? s.certificate.documentId} · {s.certificate.note}</span>
                    )}
                  </dd>
                </div>
              </dl>
              <CertificateLinkRow system={s} />
            </li>
          ))}
        </ul>
        <Pager state={certPage} label="systems" testId="certificate-list-pager" />
        </>
      )}
    </section>
  );
}

/**
 * Registering the evidence pack as a controlled document (TC-GATE-10).
 *
 * Until now the Certificates surface said "Formal issue — DocControl — not linked", and meant it:
 * T&C could produce the evidence and print it, but the result was a screen with no number, no
 * revision and no place in the register a client is handed.
 *
 * T&C still does not create the document. A person registers it in document control, where documents
 * are registered, and says here that the entry IS this system's certificate. One per system: a
 * re-issue is a new revision of the same entry, which document control already models.
 */
function CertificateLinkRow({ system }: { system: SystemView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState('');

  async function call(url: string, init: RequestInit): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }
      setReference('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.row} data-testid={`certificate-link-${system.record.code}`}>
      {error && <p style={st.errorInline} role="alert" data-testid={`certificate-error-${system.record.code}`}>{error}</p>}
      {system.certificate === null ? (
        <>
          <input
            style={st.input}
            placeholder="Certificate document number"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            // Disabled until hydrated, like the button beside it. Typing into a server-rendered
            // input before React attaches means hydration resets it to its initial state and the
            // value silently disappears — the field forgets what was typed, and the control it
            // gates never enables. A field that is briefly disabled is honest; one that forgets is
            // not. (Found by the e2e suite under load, where hydration loses the race.)
            disabled={busy || !hydrated}
            data-testid={`certificate-ref-${system.record.code}`}
          />
          <button
            style={st.smallBtn}
            disabled={busy || !hydrated || !reference.trim()}
            onClick={() => call(`/api/commissioning/records/${system.record.id}/certificate-link`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ documentId: reference.trim() }),
            })}
            data-testid={`certificate-link-btn-${system.record.code}`}
          >
            {busy ? 'Registering…' : 'Register certificate'}
          </button>
        </>
      ) : (
        <button
          style={st.smallBtn}
          disabled={busy || !hydrated}
          onClick={() => call(
            `/api/commissioning/records/${system.record.id}/certificate-link/${system.certificate!.linkId}`,
            { method: 'DELETE' },
          )}
          data-testid={`certificate-unlink-${system.record.code}`}
        >
          {busy ? '…' : 'Withdraw registration'}
        </button>
      )}
    </div>
  );
}

/**
 * As-built drawings, per system (TC-GATE-8).
 *
 * Handover's as-built gate used to ask one question of the whole project — "is there an entry marked
 * as_built?" — and one drawing answered it for every system. It is asked per system now, which it
 * could not be until somebody could SAY which drawing documents which system. That sentence is what
 * this writes; document control still owns the drawing, and every number, title, revision and status
 * below is read from the register at the moment it is shown.
 *
 * Every system is listed, not only the commissioned ones: the as-built is a document about the
 * installation, and waiting for sign-off to record it would just move the work later.
 */
function AsBuiltLinks({ systems }: { systems: SystemView[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<Record<string, string>>({});

  async function call(url: string, init: RequestInit, key: string): Promise<void> {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }
      setReference((r) => ({ ...r, [key]: '' }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  if (systems.length === 0) return null;

  const abPage = usePaged(systems);

  return (
    <div style={st.section} data-testid="asbuilt-links">
      <h4 style={st.subHeading}>As-built drawings</h4>
      {error && <p style={st.error} role="alert" data-testid="asbuilt-error">{error}</p>}
      <ul style={st.list}>
        {abPage.slice.map((s) => (
          <li key={s.record.id} style={st.card} data-testid={`asbuilt-${s.record.code}`}>
            <div style={st.cardHead}>
              <span style={st.code}>{s.record.code}</span>
              <strong style={st.grow} title={s.record.title}>{s.record.title}</strong>
              <span
                style={s.asBuiltRecords.some((a) => a.current) ? st.tagGood : st.tagWarn}
                data-testid={`asbuilt-state-${s.record.code}`}
              >
                {s.asBuiltRecords.some((a) => a.current)
                  ? 'as-built linked'
                  : s.asBuiltRecords.length === 0
                    ? 'none linked'
                    : 'not current'}
              </span>
            </div>

            {s.asBuiltRecords.length > 0 && (
              <ul style={st.linkList}>
                {s.asBuiltRecords.map((a) => (
                  <li key={a.linkId} style={st.linkRow} data-testid={`asbuilt-link-${a.linkId}`}>
                    <span aria-hidden style={a.current ? st.markGood : st.markWarn}>{a.current ? '✓' : '—'}</span>
                    <span style={st.grow}>
                      <strong style={st.ref}>{a.documentNumber ?? a.documentId}</strong>
                      {a.revision ? ` rev ${a.revision}` : ''} {a.title ?? ''}
                      {a.note && <small style={st.note}> {a.note}</small>}
                    </span>
                    <button
                      style={st.smallBtn}
                      disabled={busy !== null || !hydrated}
                      onClick={() => call(
                        `/api/commissioning/records/${s.record.id}/asbuilt-links/${a.linkId}`,
                        { method: 'DELETE' },
                        a.linkId,
                      )}
                      data-testid={`asbuilt-unlink-${a.linkId}`}
                    >
                      {busy === a.linkId ? '…' : 'Unlink'}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div style={st.row}>
              <input
                style={st.input}
                placeholder="As-built document number"
                value={reference[s.record.id] ?? ''}
                onChange={(e) => setReference({ ...reference, [s.record.id]: e.target.value })}
                // See the certificate input above: disabled until hydrated, so the field cannot
                // forget what was typed into it.
                disabled={busy !== null || !hydrated}
                data-testid={`asbuilt-ref-${s.record.code}`}
              />
              <button
                style={st.smallBtn}
                disabled={busy !== null || !hydrated || !(reference[s.record.id] ?? '').trim()}
                onClick={() => call(
                  `/api/commissioning/records/${s.record.id}/asbuilt-links`,
                  {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ documentId: (reference[s.record.id] ?? '').trim() }),
                  },
                  s.record.id,
                )}
                data-testid={`asbuilt-link-btn-${s.record.code}`}
              >
                {busy === s.record.id ? 'Linking…' : 'Link as-built'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Pager state={abPage} label="systems" testId="asbuilt-pager" />
    </div>
  );
}

// ── Readiness & Handover ────────────────────────────────────────────────────────────────────────

export function ReadinessSection({ systems }: { systems: SystemView[] }) {
  const ready = systems.filter((s) => s.readiness.commissioningReady);
  const readyPage = usePaged(systems);

  return (
    <section aria-label="Readiness and handover" style={st.section}>
      <p style={st.authorityNote} data-testid="readiness-authority">
        T&amp;C owns <strong>&ldquo;commissioned / technically ready&rdquo;</strong>. Handover owns &ldquo;ready to transfer and
        accepted by the client&rdquo;. This chain is the first of those two, per system, and is what Handover reads — it does
        not perform the handover, and it does not assert anything about O&amp;M manuals, training or client acceptance.
        A system can be legitimately commissioned and still not be COMMISSIONING READY.
      </p>

      <div style={st.summary} data-testid="readiness-summary">
        <b>{ready.length}</b> of {systems.length} system{systems.length === 1 ? '' : 's'} COMMISSIONING READY
      </div>

      {systems.length === 0 ? (
        <EmptyState compact title="No systems in commissioning scope" description="Readiness is per system; register one to see its chain." />
      ) : (
        <>
        <ul style={st.list} data-testid="readiness-systems">
          {readyPage.slice.map((s) => (
            <li key={s.record.id} style={st.card} data-testid={`readiness-${s.record.code}`}>
              <div style={st.cardHead}>
                <a href={`/commissioning/${s.record.id}`} style={st.code}>{s.record.code}</a>
                <strong style={st.grow} title={s.record.title}>{s.record.title}</strong>
                <span
                  style={s.readiness.commissioningReady ? st.tagGood : st.tagWarn}
                  data-testid={`readiness-state-${s.record.code}`}
                >
                  {s.readiness.commissioningReady ? 'COMMISSIONING READY' : `${s.readiness.blocking.length} gate${s.readiness.blocking.length === 1 ? '' : 's'} outstanding`}
                </span>
              </div>
              <GateList gates={s.readiness.gates} testIdPrefix={`readiness-gate-${s.record.code}`} />
            </li>
          ))}
        </ul>
        <Pager state={readyPage} label="systems" testId="readiness-systems-pager" />
        </>
      )}
    </section>
  );
}

// ── shared ──────────────────────────────────────────────────────────────────────────────────────

interface Gate { id: string; label: string; state: string; reason: string; source: string }

function GateList({ gates, testIdPrefix }: { gates: Gate[]; testIdPrefix: string }) {
  return (
    <ol style={st.gates}>
      {gates.map((g) => (
        <li key={g.id} style={st.gate} data-testid={`${testIdPrefix}-${g.id}`}>
          <span style={gateStyle(g.state)} data-testid={`${testIdPrefix}-${g.id}-state`}>{g.state.replace('_', ' ')}</span>
          <span style={st.gateCopy}>
            <strong>{g.label}</strong>
            {/* The reason, not just the state: "2 not yet installed (CAM-014, CAM-022)" is actionable;
                "BLOCKED" is a colour. */}
            <small>{g.reason}</small>
          </span>
          <span style={st.gateSource}>{g.source}</span>
        </li>
      ))}
    </ol>
  );
}

/** Escalation controls for the Defects surface — recorded by T&C, raised in Quality. */
export function QualityEscalation({
  item, ncrs, onDone,
}: { item: PunchRow; ncrs: NcrFact[] | null; onDone: () => void }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ncrId, setNcrId] = useState('');

  async function escalate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${item.commissioningId}/punch/${item.id}/escalate`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ qualityNcrId: ncrId || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not record the escalation (${res.status})`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the escalation');
    } finally {
      setBusy(false);
    }
  }

  if (item.qualityNcrId) {
    return <span style={st.tagGood} data-testid={`escalated-${item.id}`}>Quality NCR {item.qualityNcrId}</span>;
  }

  return (
    <span style={st.escalate}>
      {error && <small style={st.errorInline} role="alert">{error}</small>}
      <select value={ncrId} onChange={(e) => setNcrId(e.target.value)} disabled={busy || ncrs === null} style={st.selectSm} data-testid={`ncr-select-${item.id}`}>
        <option value="">{ncrs === null ? 'Quality unavailable' : 'Link a Quality NCR…'}</option>
        {(ncrs ?? []).map((n) => <option key={n.id} value={n.ncrNumber}>{n.ncrNumber} · {n.status}</option>)}
      </select>
      <button style={st.smallBtn} onClick={escalate} disabled={busy || !hydrated} data-testid={`escalate-${item.id}`}>
        {busy ? 'Recording…' : item.escalationRequestedAt ? 'Update' : 'Escalate'}
      </button>
    </span>
  );
}

const resultStyle = (r: string): CSSProperties => ({
  fontWeight: 700,
  color: r === 'passed' ? 'var(--good)' : r === 'failed' ? 'var(--bad)' : 'var(--muted)',
});

const gateBase: CSSProperties = {
  padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center', minWidth: 96,
};
const gateStyle = (state: string): CSSProperties => {
  if (state === 'READY') return { ...gateBase, background: 'var(--good-soft, rgba(34,197,94,.15))', color: 'var(--good)' };
  if (state === 'BLOCKED') return { ...gateBase, background: 'var(--bad-soft, rgba(239,68,68,.15))', color: 'var(--bad)' };
  if (state === 'UNKNOWN') return { ...gateBase, background: 'var(--warn-soft, rgba(234,179,8,.15))', color: 'var(--warn)' };
  return { ...gateBase, background: 'var(--panel-2)', color: 'var(--muted)' };
};

const st = {
  section: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  authorityNote: { margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 } as CSSProperties,
  unavailable: { padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  summary: { padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', fontSize: 14 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  card: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  cardHead: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 } as CSSProperties,
  code: { fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  // `flex: 1` lets it take the room, `minWidth: 0` lets it give it back — without the second a
  // long system title cannot shrink and pushes the tags off the end of the card. The ellipsis
  // keeps the head one line; the `title` attribute keeps the whole string reachable.
  grow: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  mutedInline: { color: 'var(--muted)' } as CSSProperties,
  gates: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  gate: { display: 'grid', gridTemplateColumns: '110px 1fr 170px', gap: 10, alignItems: 'center', fontSize: 12 } as CSSProperties,
  gateCopy: { display: 'flex', flexDirection: 'column', minWidth: 0 } as CSSProperties,
  gateSource: { color: 'var(--muted)', fontSize: 11, textAlign: 'right' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' } as CSSProperties,
  td: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, textAlign: 'left' } as CSSProperties,
  tdMuted: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', minWidth: 260 } as CSSProperties,
  select: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit' } as CSSProperties,
  selectSm: { padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 11, background: 'var(--bg, #fff)', color: 'inherit', maxWidth: 170 } as CSSProperties,
  primary: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smallBtn: { padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 11, cursor: 'pointer' } as CSSProperties,
  printLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12, fontWeight: 700 } as CSSProperties,
  factGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: 0, fontSize: 12 } as CSSProperties,
  tagGood: { padding: '3px 9px', borderRadius: 999, background: 'var(--good-soft, rgba(34,197,94,.15))', color: 'var(--good)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  tagWarn: { padding: '3px 9px', borderRadius: 999, background: 'var(--warn-soft, rgba(234,179,8,.15))', color: 'var(--warn)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  escalate: { display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' } as CSSProperties,
  // ── As-built links (TC-GATE-8) ───────────────────────────────────────────────────────────────
  subHeading: { margin: '4px 0 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' } as CSSProperties,
  linkList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  linkRow: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 } as CSSProperties,
  markGood: { color: 'var(--good)', fontWeight: 700 } as CSSProperties,
  markWarn: { color: 'var(--warn)', fontWeight: 700 } as CSSProperties,
  ref: { fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  note: { color: 'var(--warn)', fontSize: 11 } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 12, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 200 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, margin: 0 } as CSSProperties,
  errorInline: { color: 'var(--bad)', fontSize: 11 } as CSSProperties,
};
