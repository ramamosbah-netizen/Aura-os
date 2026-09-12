import { type Id, newId } from '@aura/shared';
import { type ControlledDocumentFact, AS_BUILT_STATUS, referenceIsSound, resolveDocumentReference } from './document-reference';
import { OM_DELIVERABLE_LABELS, type OmDeliverable } from './om-package';

/**
 * The handover dossier (TC-GATE-7) — everything the client receives, in one place.
 *
 * AGGREGATE EVIDENCE, DO NOT DUPLICATE IT. Every line here belongs to a domain that already owns
 * it: the commissioning evidence pack per system (Testing & Commissioning), the O&M deliverables
 * and the client training record (Handover's own, TC-GATE-5), and the as-built drawings in the
 * controlled register (Document control, through the port added in TC-GATE-6). The VIEW is derived
 * on every read and stores nothing, which is how it stays true — there is no copy here to fall out
 * of step with the domains it reports.
 *
 * WHAT IT DOES NOT DO: gate the submission. Handover readiness already decides whether a package
 * may be sent, from the same authorities. A dossier that refused on its own terms would be a second
 * opinion on one question, and the two would eventually disagree.
 *
 * NOT-INCLUDED LINES ARE STILL SHOWN. A deliverable that exists but is not accepted, a system that
 * is registered but not commissioned — each appears with the reason it is not in the pack. A dossier
 * that listed only what was ready would hide the work remaining, which is the question the person
 * looking at it actually has.
 */

export type DossierKind = 'commissioning_certificate' | 'om_deliverable' | 'training_session' | 'as_built_document';

export const DOSSIER_KINDS: readonly DossierKind[] = [
  'commissioning_certificate',
  'om_deliverable',
  'training_session',
  'as_built_document',
];

/**
 * One captured citation — a row of an ISSUED manifest (migration 0300).
 *
 * It holds a reference plus the label and state the thing carried AT ISSUE, and nothing else. No
 * document, no test result. Keeping the label is the minimal duplication the table exists for: "rev
 * B, accepted" is what the client was handed, and re-reading the register next year may truthfully
 * say "rev C, superseded" — a fact about today, not about the handover.
 */
export interface DossierItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  handoverId: Id;
  projectId: Id;
  issueNo: number;
  kind: DossierKind;
  /** The row in the owning domain. */
  sourceId: string;
  /** How a human finds it — a document number, a system code. */
  reference: string | null;
  label: string;
  state: string | null;
  issuedAt: string;
  issuedBy: string | null;
  createdAt: string;
}

/** One line of the dossier as it stands NOW. Derived; never stored. */
export interface DossierEntry {
  kind: DossierKind;
  sourceId: string;
  reference: string | null;
  label: string;
  state: string | null;
  /** In the pack as it would go out today. */
  included: boolean;
  /** Why it is not, in words a reader can act on. Null when it is included. */
  note: string | null;
}

export interface DossierSection {
  kind: DossierKind;
  title: string;
  /** Which domain owns these lines — said out loud, because the dossier owns none of them. */
  source: string;
  entries: DossierEntry[];
  included: number;
}

export interface DossierView {
  sections: DossierSection[];
  /** Lines that would go to the client today. */
  includedTotal: number;
  /** What is present but not fit to send, and why. */
  outstanding: string[];
}

export interface DossierFacts {
  systems: {
    id: string;
    code: string;
    title: string;
    commissioned: boolean;
    witnessedBy: string | null;
    pointsPassed: number;
    pointsTotal: number;
    /**
     * The controlled document this system's evidence pack is registered as (TC-GATE-10), already
     * resolved against the register. Null when nobody has registered one — which is not a failure:
     * the evidence pack still exists and still goes in the dossier, it simply has no document number.
     */
    certificate: { documentNumber: string | null; revision: string | null; current: boolean; note: string | null } | null;
  }[];
  omItems: {
    id: string;
    commissioningId: string;
    deliverable: string;
    required: boolean;
    state: string;
    documentId: string | null;
  }[];
  trainingSessions: { id: string; title: string; state: string; acknowledgedBy: string | null }[];
  /** Which controlled drawing documents which system (TC-GATE-8). */
  asBuiltLinks: { id: string; commissioningId: string; documentId: string }[];
  /** The project register, or null when document control could not be read. */
  documents: ControlledDocumentFact[] | null;
  /** System code by id, for labelling an O&M line with the system it belongs to. */
  systemCodeById?: Record<string, string>;
}

const entry = (
  kind: DossierKind,
  sourceId: string,
  reference: string | null,
  label: string,
  state: string | null,
  included: boolean,
  note: string | null = null,
): DossierEntry => ({ kind, sourceId, reference, label, state, included, note });

export function assembleDossier(facts: DossierFacts): DossierView {
  const codeById = facts.systemCodeById ?? Object.fromEntries(facts.systems.map((s) => [s.id, s.code]));

  const certificates = facts.systems.map((s) => {
    // TC-GATE-10: cite the controlled document when one has been registered. The pack is issuable
    // either way — an unregistered pack is still the evidence — so a missing certificate is said
    // plainly on the line rather than dropping it from the dossier.
    const cert = s.certificate;
    const registered = cert !== null && cert.current;
    return entry(
      'commissioning_certificate',
      s.id,
      registered ? cert!.documentNumber : s.code,
      `${s.code} — ${s.title}`,
      s.commissioned
        ? registered
          ? `commissioned · ${cert!.documentNumber} rev ${cert!.revision}`
          : 'commissioned · evidence pack only'
        : 'not commissioned',
      s.commissioned,
      s.commissioned
        ? cert === null
          ? 'Issued as an evidence pack; no controlled certificate is registered for it.'
          : cert.current
            ? null
            : cert.note
        : `${s.pointsPassed} of ${s.pointsTotal} test points passed; the system has not been signed off, so there is no evidence pack to issue.`,
    );
  });

  const om = facts.omItems
    .filter((i) => i.required)
    .map((i) => {
      const resolved = resolveDocumentReference(i.documentId, facts.documents);
      const sound = referenceIsSound(resolved);
      const accepted = i.state === 'accepted';
      const label = `${codeById[i.commissioningId] ?? i.commissioningId} — ${OM_DELIVERABLE_LABELS[i.deliverable as OmDeliverable] ?? i.deliverable}`;
      const reference = resolved?.document?.documentNumber ?? i.documentId;
      return entry(
        'om_deliverable',
        i.id,
        reference,
        label,
        // The register's revision, not ours — read now, kept only if this is issued.
        resolved?.document ? `${i.state} · rev ${resolved.document.revision}` : i.state,
        accepted && sound,
        !accepted
          ? `The deliverable is ${i.state}, not accepted.`
          : sound
            ? null
            : facts.documents === null
              ? 'Document control could not be read, so the reference behind it is unverified.'
              : resolved === null
                ? 'Accepted with no document reference at all.'
                : resolved.missing
                  ? `No document "${resolved.reference}" is in the project register.`
                  : 'The register has superseded the revision this points at.',
      );
    });

  const training = facts.trainingSessions.map((s) =>
    entry(
      'training_session',
      s.id,
      null,
      s.title,
      s.state,
      s.state === 'acknowledged',
      s.state === 'acknowledged' ? null : `Recorded as ${s.state}; the client has not acknowledged it.`,
    ),
  );

  // Per system since TC-GATE-8, because that is the question the client asks: not "does an as-built
  // exist on this project" but "where is the as-built for THIS system". A system with nothing linked
  // gets a line saying so, rather than being silently absent from the pack.
  const asBuilts = facts.systems.flatMap((s) => {
    const links = facts.asBuiltLinks.filter((l) => l.commissioningId === s.id);
    if (links.length === 0) {
      return [entry('as_built_document', s.id, null, `${s.code} — as-built drawing`, null, false,
        'No controlled drawing has been linked as this system’s as-built.')];
    }
    return links.map((l) => {
      const resolved = resolveDocumentReference(l.documentId, facts.documents);
      const doc = resolved?.document ?? null;
      const current = referenceIsSound(resolved) && doc!.status === AS_BUILT_STATUS;
      return entry(
        'as_built_document',
        l.id,
        doc?.documentNumber ?? l.documentId,
        `${s.code} — ${doc?.title ?? 'linked drawing'}`,
        doc ? `rev ${doc.revision}` : null,
        current,
        current
          ? null
          : facts.documents === null
            ? 'Document control could not be read, so the linked drawing is unverified.'
            : resolved === null || resolved.missing
              ? `No document "${l.documentId}" is in the project register.`
              : resolved.superseded
                ? 'The register has superseded the revision this points at.'
                : `The linked drawing is '${doc!.status}', not an as-built.`,
      );
    });
  });

  const sections: DossierSection[] = [
    section('commissioning_certificate', 'Commissioning evidence packs', 'Testing & commissioning', certificates),
    section('as_built_document', 'As-built records', 'Document control', asBuilts),
    section('om_deliverable', 'O&M deliverables', 'Handover — O&M pack', om),
    section('training_session', 'Training & demonstration', 'Handover — client training', training),
  ];

  return {
    sections,
    includedTotal: sections.reduce((n, s) => n + s.included, 0),
    outstanding: sections.flatMap((s) => s.entries.filter((e) => !e.included).map((e) => `${e.label}: ${e.note}`)),
  };
}

function section(kind: DossierKind, title: string, source: string, entries: DossierEntry[]): DossierSection {
  return { kind, title, source, entries, included: entries.filter((e) => e.included).length };
}

/**
 * Capture what is going to the client, as an issued manifest.
 *
 * Only INCLUDED lines are captured: the manifest is a record of what was sent, and a line that was
 * not fit to send was not sent. What is outstanding at that moment is not lost — it is visible in
 * the derived view, which is where a question about remaining work belongs.
 */
export function captureDossier(
  view: DossierView,
  pkg: { id: Id; tenantId: Id; companyId: Id | null; projectId: Id },
  issueNo: number,
  issuedBy?: Id | null,
): DossierItem[] {
  // Worded with "must": the API error taxonomy classifies by message SHAPE, and a guard that reads
  // as prose escapes to 500 — which the taxonomy fitness test catches, and did catch this one.
  if (issueNo < 1) throw new Error('validation: a dossier issue number must be 1 or greater');
  const issuedAt = new Date().toISOString();
  return view.sections.flatMap((s) =>
    s.entries
      .filter((e) => e.included)
      .map((e) => ({
        id: newId(),
        tenantId: pkg.tenantId,
        companyId: pkg.companyId,
        handoverId: pkg.id,
        projectId: pkg.projectId,
        issueNo,
        kind: e.kind,
        sourceId: e.sourceId,
        reference: e.reference,
        label: e.label,
        state: e.state,
        issuedAt,
        issuedBy: issuedBy ?? null,
      })),
  ).map((item) => ({ ...item, createdAt: issuedAt }));
}

/** The issues of a package, newest first, each with its own captured lines. */
export function groupIssues(items: DossierItem[]): { issueNo: number; issuedAt: string; issuedBy: string | null; items: DossierItem[] }[] {
  const byIssue = new Map<number, DossierItem[]>();
  for (const item of items) {
    const list = byIssue.get(item.issueNo) ?? [];
    list.push(item);
    byIssue.set(item.issueNo, list);
  }
  return [...byIssue.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([issueNo, list]) => ({
      issueNo,
      issuedAt: list[0].issuedAt,
      issuedBy: list[0].issuedBy,
      items: [...list].sort((a, b) => DOSSIER_KINDS.indexOf(a.kind) - DOSSIER_KINDS.indexOf(b.kind) || a.label.localeCompare(b.label)),
    }));
}
