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

export const ELV_EQUIPMENT = Symbol('ELV_EQUIPMENT');
export const QUALITY_EVIDENCE = Symbol('QUALITY_EVIDENCE');
export const ENGINEERING_RELEASE = Symbol('ENGINEERING_RELEASE');
