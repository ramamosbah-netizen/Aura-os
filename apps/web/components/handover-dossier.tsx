'use client';

import { useState, type CSSProperties } from 'react';

/**
 * The handover dossier (TC-GATE-7).
 *
 * Two things on one surface, and the difference between them is the point:
 *
 *   TODAY  — derived on every read from the four domains that own the evidence. Nothing is stored,
 *            so nothing can drift. This is what would go to the client if it went now.
 *   ISSUED — the manifests actually SENT, captured at submission and never rewritten. A package
 *            submitted in March still lists what March contained, whatever has moved since.
 *
 * Showing only the first would answer a question nobody asked after a dispute starts. Showing only
 * the second would hide the work still outstanding. So both, side by side, labelled.
 *
 * Lines that are NOT ready are shown too, with the reason. A dossier that listed only what was
 * complete would hide exactly the part a reader is looking for.
 */

export interface DossierEntryRow {
  kind: string;
  sourceId: string;
  reference: string | null;
  label: string;
  state: string | null;
  included: boolean;
  note: string | null;
}

export interface DossierSectionRow {
  kind: string;
  title: string;
  source: string;
  entries: DossierEntryRow[];
  included: number;
}

export interface DossierIssueRow {
  issueNo: number;
  issuedAt: string;
  issuedBy: string | null;
  /** The document-control transmittal that conveyed this issue (TC-GATE-14), or null. */
  transmittalId: string | null;
  /**
   * What became of it, read from document control (TC-GATE-15). Null when none was opened, or when
   * document control could not be read — the two are shown apart, because one is a decision and the
   * other is an outage.
   */
  transmittal: {
    code: string; status: string; recipient: string | null;
    sentAt: string | null; acknowledgedAt: string | null; acknowledgedBy: string | null;
  } | null;
  items: { id: string; kind: string; reference: string | null; label: string; state: string | null }[];
}

export interface DossierData {
  package: { id: string; code: string; title: string; status: string };
  view: { sections: DossierSectionRow[]; includedTotal: number; outstanding: string[] };
  issues: DossierIssueRow[];
}

export function DossierSection({ dossiers }: { dossiers: DossierData[] | null }) {
  if (dossiers === null) {
    return (
      <section aria-label="Handover dossier" style={st.section}>
        <div style={st.unavailable} role="alert">The dossier could not be read.</div>
      </section>
    );
  }

  return (
    <section aria-label="Handover dossier" style={st.section}>
      <p style={st.authorityNote} data-testid="dossier-authority">
        The dossier <strong>owns nothing</strong>. Every line belongs to the domain that produced it — Testing &amp;
        Commissioning for the evidence packs, document control for the as-builts, and this workspace&rsquo;s own O&amp;M
        and training records — and is assembled here on every read, never copied. The one thing kept is the{' '}
        <strong>manifest of what was actually sent</strong>, captured when a package is submitted and never rewritten,
        because &ldquo;what would we hand over today&rdquo; and &ldquo;what did the client receive&rdquo; stop being the
        same answer the moment anything moves. Each issue also asks document control to open a{' '}
        <strong>transmittal</strong> for the controlled documents it carries — the manifest is our record of what was
        sent, and the transmittal is theirs of it being received.
      </p>

      {dossiers.length === 0 ? (
        <div style={st.unavailable}>No handover package on this project yet — a dossier is assembled for a package.</div>
      ) : (
        dossiers.map((d) => <DossierCard key={d.package.id} data={d} />)
      )}
    </section>
  );
}

function DossierCard({ data }: { data: DossierData }) {
  const { package: pkg, view, issues } = data;
  return (
    <article style={st.card} data-testid={`dossier-${pkg.code}`}>
      <div style={st.cardHead}>
        <span style={st.code}>{pkg.code}</span>
        <strong style={st.grow}>{pkg.title}</strong>
        <span style={st.tagMuted}>{pkg.status}</span>
        <span style={view.outstanding.length === 0 ? st.tagGood : st.tagWarn} data-testid={`dossier-count-${pkg.code}`}>
          {view.includedTotal} ready{view.outstanding.length > 0 ? ` · ${view.outstanding.length} outstanding` : ''}
        </span>
      </div>

      <h4 style={st.heading}>What would go to the client today</h4>
      {view.sections.map((section) => (
        <div key={section.kind} style={st.block} data-testid={`dossier-section-${section.kind}`}>
          <div style={st.blockHead}>
            <strong>{section.title}</strong>
            <small style={st.muted}>{section.source}</small>
            <span style={st.grow} />
            <small style={st.muted} data-testid={`dossier-included-${section.kind}`}>
              {section.included} of {section.entries.length} in the pack
            </small>
          </div>
          {section.entries.length === 0 ? (
            <p style={st.empty}>Nothing recorded.</p>
          ) : (
            <ul style={st.list}>
              {section.entries.map((e) => (
                <li key={`${e.kind}-${e.sourceId}`} style={st.row} data-testid={`dossier-entry-${e.sourceId}`}>
                  <span aria-hidden style={e.included ? st.markGood : st.markWarn}>{e.included ? '✓' : '—'}</span>
                  <span style={st.grow}>
                    {e.reference && <strong style={st.ref}>{e.reference}</strong>} {e.label}
                    {e.note && <small style={st.note}> {e.note}</small>}
                  </span>
                  {e.state && <small style={st.muted}>{e.state}</small>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <h4 style={st.heading}>Issued to the client</h4>
      {issues.length === 0 ? (
        <p style={st.empty} data-testid={`dossier-no-issue-${pkg.code}`}>
          Nothing has been issued yet. A manifest is captured when the package is submitted.
        </p>
      ) : (
        // Newest first, from the API. The newest is open; older ones fold away.
        issues.map((issue, index) => <Issue key={issue.issueNo} pkgCode={pkg.code} issue={issue} defaultOpen={index === 0} />)
      )}
    </article>
  );
}

/**
 * What the conveyance says, in one line (TC-GATE-15).
 *
 * Four states, and the distinction between the last two is the point: an issue with no transmittal
 * was never conveyed, while an issue whose transmittal cannot be read is conveyed and unverified.
 * Collapsing them into one phrase would report an outage as a decision.
 */
function conveyanceLabel(issue: DossierIssueRow): string {
  if (!issue.transmittalId) return 'not conveyed through document control';
  const t = issue.transmittal;
  if (!t) return 'conveyed, but document control could not be read';
  if (t.acknowledgedAt) {
    return `acknowledged by ${t.acknowledgedBy ?? 'the recipient'} on ${t.acknowledgedAt.slice(0, 10)} (${t.code})`;
  }
  if (t.sentAt) return `sent ${t.sentAt.slice(0, 10)}${t.recipient ? ` to ${t.recipient}` : ''} (${t.code}) — not yet acknowledged`;
  return `${t.code} opened, not yet sent by document control`;
}

function conveyanceStyle(issue: DossierIssueRow): CSSProperties {
  if (!issue.transmittalId) return st.muted;
  if (!issue.transmittal) return st.docWarn;
  return issue.transmittal.acknowledgedAt ? st.conveyed : st.muted;
}

function Issue({ pkgCode, issue, defaultOpen }: { pkgCode: string; issue: DossierIssueRow; defaultOpen: boolean }) {
  // The current pack is what a reader wants first; the history is what they go looking for.
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={st.block} data-testid={`dossier-issue-${pkgCode}-${issue.issueNo}`}>
      <button style={st.issueHead} onClick={() => setOpen(!open)} aria-expanded={open} data-testid={`dossier-issue-toggle-${pkgCode}-${issue.issueNo}`}>
        <strong>Issue {issue.issueNo}</strong>
        <small style={st.muted}>
          {new Date(issue.issuedAt).toISOString().slice(0, 10)}
          {issue.issuedBy ? ` · ${issue.issuedBy}` : ''} · {issue.items.length} item{issue.items.length === 1 ? '' : 's'}
        </small>
{/* TC-GATE-14 opened the conveyance; TC-GATE-15 reads back what became of it. The manifest is
            our record of what was sent; the acknowledgement is the CLIENT's that it arrived, and that
            is the one a dispute turns on. Said plainly in every state, including "not conveyed",
            because that is a fact a reader needs as much as a code. */}
        <small style={conveyanceStyle(issue)} data-testid={`dossier-conveyance-${pkgCode}-${issue.issueNo}`}>
          · {conveyanceLabel(issue)}
        </small>
        <span style={st.grow} />
        <small style={st.muted}>{open ? 'hide' : 'show'}</small>
      </button>
      {open && (
        <ul style={st.list}>
          {issue.items.map((item) => (
            <li key={item.id} style={st.row} data-testid={`dossier-issued-${item.id}`}>
              <span aria-hidden style={st.markGood}>✓</span>
              <span style={st.grow}>
                {item.reference && <strong style={st.ref}>{item.reference}</strong>} {item.label}
              </span>
              {item.state && <small style={st.muted}>{item.state}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const st = {
  section: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  authorityNote: { margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 } as CSSProperties,
  unavailable: { padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  card: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  cardHead: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 } as CSSProperties,
  heading: { margin: '6px 0 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' } as CSSProperties,
  block: { border: '1px solid var(--border, #f1f5f9)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  blockHead: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12 } as CSSProperties,
  issueHead: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  row: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 } as CSSProperties,
  grow: { flex: 1, minWidth: 120 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 11 } as CSSProperties,
  note: { color: 'var(--warn)', fontSize: 11 } as CSSProperties,
  empty: { margin: 0, color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  code: { fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  ref: { fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  markGood: { color: 'var(--good)', fontWeight: 700 } as CSSProperties,
  conveyed: { color: 'var(--good)', fontSize: 11, fontWeight: 600 } as CSSProperties,
  docWarn: { color: 'var(--warn)', fontSize: 11, fontWeight: 600 } as CSSProperties,
  markWarn: { color: 'var(--warn)', fontWeight: 700 } as CSSProperties,
  tagGood: { padding: '3px 9px', borderRadius: 999, background: 'var(--good-soft, rgba(34,197,94,.15))', color: 'var(--good)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  tagWarn: { padding: '3px 9px', borderRadius: 999, background: 'var(--warn-soft, rgba(234,179,8,.15))', color: 'var(--warn)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  tagMuted: { padding: '3px 9px', borderRadius: 999, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 11, fontWeight: 700 } as CSSProperties,
};
