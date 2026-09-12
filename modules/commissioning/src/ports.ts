/**
 * The evidence T&C READS but does not own (TC-GATE-3).
 *
 * Pre-commissioning readiness is a question about four other domains: is the equipment registered
 * and installed, has Engineering released the technical truth, is Quality clear, and does the system
 * have a test sheet at all. Only the last is T&C's. The other three must come from the domains that
 * own them, or the answer is a guess.
 *
 * Same shape as `CloseoutReadinessPort` in Projects, for the same reason (ADR-0004: a business
 * module never imports another). The CONSUMER declares the interface; the owning module implements
 * the method about itself; the composition root binds them in `apps/api/src/wiring/gates.module.ts`.
 *
 * Every port is `@Optional()`. An absent or throwing port yields `null`, which the readiness chain
 * renders as **UNKNOWN — never as a pass**. That distinction is the whole safety property: a gate
 * nobody can answer must not read as satisfied, or an unwired port silently commissions systems.
 */

import type { ControlledDocumentFact } from './domain/document-reference';

export type { ControlledDocumentFact };

/** One device, as the ELV register describes it. T&C copies none of this; it reads and counts. */
export interface EquipmentFact {
  id: string;
  tag: string;
  /** Canonical `ElvSystem` — the ELV register and commissioning share this vocabulary. */
  system: string;
  /** planned | installed | terminated | tested | commissioned | faulty | removed */
  status: string;
  /** Set when the device has been tied to a commissioning record. */
  commissioningRecordId: string | null;
}

export interface ElvEquipmentPort {
  /** Every device on a project. One call, not one per system — a project has one device schedule. */
  readProjectEquipment(tenantId: string, projectId: string): Promise<EquipmentFact[]>;
}

/** A non-conformance, as Quality describes it. `system` is nullable and, when null, project-wide. */
export interface NcrFact {
  id: string;
  ncrNumber: string;
  system: string | null;
  severity: string;
  status: string;
}

/**
 * A snag, as QUALITY describes it (TC-GATE-9).
 *
 * Quality owns snags: `aura_quality_snags`, project-scoped, with its own severity scale
 * (low | medium | high) and its own three-state lifecycle (open | resolved | closed). T&C owns a
 * DIFFERENT defect record — the punch item, system-scoped, minor | major | critical, open | closed,
 * with provenance back to the failing test run.
 *
 * They are not merged here and must not be. Two authorities describing overlapping facts is a real
 * problem in this repository, but the fix for it is convergence, not a consumer quietly deciding
 * which one wins. What this port does is let Handover SEE the one it was blind to.
 *
 * `status` is carried through as Quality's own word. Handover counts what Quality calls open and
 * adds no severity threshold of its own — restating a threshold in the consumer is exactly the drift
 * these ports exist to prevent.
 */
export interface SnagFact {
  id: string;
  description: string;
  locationDetail: string;
  /** low | medium | high — Quality's scale, not T&C's. */
  severity: string;
  /** open | resolved | closed */
  status: string;
  assignedTo: string | null;
}

/**
 * An inspection request, as Quality describes it (TC-GATE-13).
 *
 * Quality owns the IR: its lifecycle (requested → in_progress → approved | rejected), who inspected
 * and what they said. T&C reads it to answer one question — has the installation for this system
 * been inspected and signed off before commissioning starts.
 *
 * `discipline` became the canonical platform vocabulary in TC-GATE-12. Before that it was four
 * values, none of which could describe an ELV system, which is why inspection requests contributed
 * nothing to readiness for ten gates: there was no value on them that could name the system.
 */
export interface IrFact {
  id: string;
  irNumber: string;
  /** Canonical `Discipline` — matched to a system through ELV_SYSTEM_DISCIPLINES. */
  discipline: string;
  /** requested | in_progress | approved | rejected */
  status: string;
  locationDetail: string;
}

/** An Inspection & Test Plan and its points, owned by Quality. Results are Quality's, not T&C's. */
export interface ItpFact {
  id: string;
  reference: string;
  title: string;
  discipline: string;
  status: string;
  points: { activity: string; pointType: string; acceptanceCriteria: string; result: string }[];
}

export interface QualityEvidencePort {
  readProjectQualityEvidence(
    tenantId: string,
    projectId: string,
  ): Promise<{ ncrs: NcrFact[]; itps: ItpFact[]; snags: SnagFact[]; irs: IrFact[] }>;
}

/** A drawing's release state, as Engineering describes it. Discipline is the shared dimension. */
export interface DrawingReleaseFact {
  discipline: string;
  status: string;
}

export interface EngineeringReleasePort {
  readProjectDrawingRelease(tenantId: string, projectId: string): Promise<DrawingReleaseFact[]>;
}

/**
 * The project's controlled document register, owned by Document Control (TC-GATE-6).
 *
 * Handover points at documents it does not own — an O&M manual, a warranty certificate, an as-built
 * drawing. Until this port existed those pointers were unchecked text. DocControl is the only domain
 * that can say whether a reference is real, what revision it is at, and whether it has been
 * superseded, so it is the only domain that should be asked.
 *
 * It is also the authority for AS-BUILTS, which Handover previously asked Engineering for. Engineering
 * cannot answer: its `DrawingStatus` has no as-built value, so the question came back "no" forever.
 * `RegisterStatus` does have one, and Projects' closeout gate has always read it from here.
 *
 * One call per project, like every other port here: a project has ONE register.
 */
/**
 * A transmittal, as document control describes it (TC-GATE-15).
 *
 * TC-GATE-14 asked DocControl to open one and stored its id on the dossier manifest — a reference
 * nothing read back. A stored reference nobody resolves is exactly what TC-GATE-6 removed from the
 * O&M pack: it looks like evidence and proves nothing. This is the other half of that gate.
 *
 * Every field is DocControl's answer, read when it is shown and stored nowhere. 'acknowledgedAt' and
 * 'acknowledgedBy' are the ones that matter: they are the client's word that the documents arrived,
 * which is the fact "we never received the O&M manuals" actually turns on.
 */
export interface TransmittalFact {
  id: string;
  code: string;
  /** draft | sent | received | acknowledged */
  status: string;
  recipient: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  acknowledgedAt: string | null;
  /** Who acknowledged it, from the immutable acknowledgement record DocControl keeps. */
  acknowledgedBy: string | null;
}

export interface DocControlPort {
  readProjectDocuments(tenantId: string, projectId: string): Promise<ControlledDocumentFact[]>;
  /** One call per project, like the register read beside it: a project has few transmittals. */
  readProjectTransmittals(tenantId: string, projectId: string): Promise<TransmittalFact[]>;
}

/**
 * Asking document control to OPEN A TRANSMITTAL for documents Handover is issuing (TC-GATE-14).
 *
 * THE FIRST COMMAND PORT IN THIS SERIES, and worth saying why it is still not a boundary violation.
 * Every port before this one reads. This one asks another domain to WRITE — and the distinction that
 * makes it legitimate is that DocControl performs the write itself: it assigns the code, it applies
 * its own permission check, it emits its own event, and it owns every state the transmittal moves
 * through afterwards. Handover supplies a list of register entries and a title. It does not choose a
 * number, does not send, does not record receipt, and cannot acknowledge on the client's behalf.
 *
 * WHAT IT BUYS. The dossier manifest (TC-GATE-7) records what a package SAID it was sending. Nothing
 * recorded that the client received it. A transmittal is the controlled channel that does — it has a
 * recipient, a sent date, and an acknowledgement with who and when — and that is precisely the
 * evidence a dispute about "we never got the O&M manuals" turns on.
 *
 * IT OPENS A DRAFT, deliberately. Sending is a decision with a recipient attached, and a handover
 * package does not know the client's document controller. DocControl completes and sends it, which
 * is its job. The draft is the handoff point: Handover assembles and asks; DocControl conveys.
 */
export interface TransmittalRequest {
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  /**
   * Register entries only — a transmittal conveys controlled documents, not screens.
   *
   * The id and the revision, and nothing else: document control reads the number and title from its
   * OWN register when it builds the line. Passing them would be this consumer restating facts it does
   * not own, and they would be the ones that went stale.
   */
  items: { registerEntryId: string; revision: string }[];
  actorId?: string | null;
}

export interface DocControlIssuePort {
  openTransmittal(tenantId: string, request: TransmittalRequest): Promise<{ id: string; code: string }>;
}

/**
 * A stock item, as Inventory describes it (TC-GATE-17).
 *
 * TC-GATE-16 gave a spare an optional `stockItemId` and called it "a reference for whoever wants the
 * part's real record". It was free text nobody checked — the same thing TC-GATE-6 removed from the
 * O&M pack, reintroduced one gate later in a smaller place. This is the port that makes the word
 * REFERENCE true again.
 *
 * Inventory keeps ownership of everything that makes a part a part: its code, its unit, what is on
 * hand and what it cost. Handover reads a projection of the first two and nothing else — a consumer
 * that cannot see valuation cannot come to depend on it, and a spares list has no business showing
 * a client what the contractor paid.
 */
export interface StockItemFact {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface InventoryPort {
  /**
   * The parts behind a specific set of references — by code or id (TC-GATE-18).
   *
   * TAKES THE REFERENCES, rather than returning the tenant's stock for the caller to search. The
   * first version of this port did the latter, and Inventory's list read applies a default
   * `LIMIT 200`: a tenant with more than two hundred parts had its two-hundred-and-first silently
   * absent, so a valid reference resolved as "not in inventory" and the WRITE that checks it refused
   * a real part. Invisible at test scale, certain at a real one.
   *
   * Asking for what is wanted designs that out: there is no list to truncate. The owner does the
   * lookup, which is also the only place that can do it tenant-safely.
   */
  readStockItems(tenantId: string, references: string[]): Promise<StockItemFact[]>;
}

export const ELV_EQUIPMENT = Symbol('ELV_EQUIPMENT');
export const QUALITY_EVIDENCE = Symbol('QUALITY_EVIDENCE');
export const ENGINEERING_RELEASE = Symbol('ENGINEERING_RELEASE');
export const DOC_CONTROL = Symbol('DOC_CONTROL');
export const DOC_CONTROL_ISSUE = Symbol('DOC_CONTROL_ISSUE');
export const INVENTORY = Symbol('INVENTORY');
