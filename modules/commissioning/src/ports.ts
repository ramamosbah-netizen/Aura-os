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
  readProjectQualityEvidence(tenantId: string, projectId: string): Promise<{ ncrs: NcrFact[]; itps: ItpFact[] }>;
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
