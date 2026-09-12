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
export interface DocControlPort {
  readProjectDocuments(tenantId: string, projectId: string): Promise<ControlledDocumentFact[]>;
}

export const ELV_EQUIPMENT = Symbol('ELV_EQUIPMENT');
export const QUALITY_EVIDENCE = Symbol('QUALITY_EVIDENCE');
export const ENGINEERING_RELEASE = Symbol('ENGINEERING_RELEASE');
export const DOC_CONTROL = Symbol('DOC_CONTROL');
