// G4 — the ELV commercial context.
//
// A lead with a name, an email and a source is a CRM record. A lead an ELV contractor can actually
// act on says WHAT is needed, WHERE, for WHICH project, and WHO else is on it. Without that you
// cannot route it to the right estimator, score its fit, or recognise that two inquiries are the
// same job arriving through a consultant and a main contractor.
//
// This is the data G3's `fit`, `timingReadiness` and `commercialPotential` were being rated
// WITHOUT — the reason G4 follows G3 immediately rather than someday.

/**
 * The ELV systems this business installs. A canonical list (not free text) because it is the
 * routing and matching key: "CCTV" typed six different ways cannot be grouped, reported on, or
 * matched to an estimator's speciality.
 *
 * Deliberately open-ended via `other` — a real inquiry must never be un-recordable because the
 * list is incomplete. `other` plus the free-text requirement is the escape hatch.
 */
export const ELV_SYSTEMS = [
  'cctv',
  'access_control',
  'intrusion_alarm',
  'fire_alarm',
  'public_address',
  'structured_cabling',
  'bms',
  'audio_visual',
  'intercom',
  'nurse_call',
  'gate_barrier',
  'parking_management',
  'other',
] as const;

export type ElvSystem = (typeof ELV_SYSTEMS)[number];

/** One source for labels, so API, UI and reports never drift apart. */
export const ELV_SYSTEM_LABELS: Record<ElvSystem, string> = {
  cctv: 'CCTV',
  access_control: 'Access Control',
  intrusion_alarm: 'Intrusion Alarm',
  fire_alarm: 'Fire Alarm',
  public_address: 'Public Address / Voice Alarm',
  structured_cabling: 'Structured Cabling',
  bms: 'BMS',
  audio_visual: 'Audio Visual',
  intercom: 'Intercom',
  nurse_call: 'Nurse Call',
  gate_barrier: 'Gate & Barrier',
  parking_management: 'Parking Management',
  other: 'Other',
};

/** The market segment — drives fit, and is how win-rate by sector becomes answerable. */
export const ELV_SECTORS = [
  'residential',
  'commercial',
  'hospitality',
  'healthcare',
  'education',
  'retail',
  'industrial',
  'logistics',
  'government',
  'infrastructure',
  'other',
] as const;

export type ElvSector = (typeof ELV_SECTORS)[number];

/**
 * Where the work sits in the project's life. Timing readiness is not a date — an inquiry for a
 * building at design stage is real but a year out, while one at fit-out is now. Conflating the two
 * into "expected close date" is how pipelines fill with deals that were never close.
 */
export const PROJECT_STAGES = ['design', 'tender', 'award', 'construction', 'fit_out', 'handover', 'operational', 'unknown'] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

/**
 * The commercial context of an ELV inquiry.
 *
 * `consultant` and `mainContractor` are free text on purpose, for now: at lead stage you often
 * have a name before you have a relationship, and forcing an Account link would either block
 * capture or spawn junk accounts. G6 (Account party types + relationship graph) is where these
 * become real links — the names recorded here are what that slice will resolve against.
 */
export interface ElvCommercialContext {
  /** What they actually asked for, in their words. */
  requirement: string | null;
  /** Which systems are in scope — the routing/matching key. */
  systems: ElvSystem[] | null;
  sector: ElvSector | null;
  projectName: string | null;
  projectLocation: string | null;
  /** Who is specifying (often the real influence on an ELV job). */
  consultant: string | null;
  /** Who holds the main contract, when we are a subcontractor. */
  mainContractor: string | null;
  /** Rough value at lead stage — an estimate, NOT a committed opportunity value. */
  estimatedValue: number | null;
  projectStage: ProjectStage | null;
  /** When they expect to need it, in their words ("Q3", "after Ramadan") — real inquiries rarely
   * arrive with a date, and forcing one would fabricate precision. */
  expectedTimeline: string | null;
}

/** Label for a system code — falls back to the code so an unknown value is visible, not blank. */
export function elvSystemLabel(s: ElvSystem): string {
  return ELV_SYSTEM_LABELS[s] ?? s;
}

const isElvSystem = (v: unknown): v is ElvSystem => typeof v === 'string' && (ELV_SYSTEMS as readonly string[]).includes(v);

/** Clean an incoming systems list: known values only, de-duplicated, order preserved. */
export function normalizeElvSystems(input: unknown): ElvSystem[] | null {
  if (!Array.isArray(input)) return null;
  const out = [...new Set(input.filter(isElvSystem))];
  return out.length > 0 ? out : null;
}

/** True when the context says enough to route and size the inquiry. */
export function hasWorkableContext(ctx: Partial<ElvCommercialContext>): boolean {
  return Boolean((ctx.requirement && ctx.requirement.trim()) || (ctx.systems && ctx.systems.length > 0));
}

/**
 * How complete the context is, 0–100. This is a FACT about the record, not a judgement of the
 * lead — feed it to G3's `informationQuality` rather than inventing a second quality score.
 */
export function contextCompleteness(ctx: Partial<ElvCommercialContext>): number {
  const checks = [
    Boolean(ctx.requirement?.trim()),
    Boolean(ctx.systems?.length),
    Boolean(ctx.sector),
    Boolean(ctx.projectName?.trim()),
    Boolean(ctx.projectLocation?.trim()),
    Boolean(ctx.consultant?.trim() || ctx.mainContractor?.trim()),
    typeof ctx.estimatedValue === 'number' && ctx.estimatedValue > 0,
    Boolean(ctx.projectStage && ctx.projectStage !== 'unknown'),
    Boolean(ctx.expectedTimeline?.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
