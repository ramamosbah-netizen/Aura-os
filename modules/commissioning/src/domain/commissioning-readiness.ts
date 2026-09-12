/**
 * Is this system ready to be handed over? (TC-GATE-3)
 *
 * TWO DIFFERENT QUESTIONS, KEPT APART ON PURPOSE.
 *
 *   "May I sign this system off?"  — T&C's own evidence: every test point passed, no open defect,
 *                                    a signer and a witness. That is `eligible`, built in TC-GATE-2,
 *                                    and it is unchanged here.
 *   "Is this system COMMISSIONING READY?" — the wider chain below, which also asks the ELV register,
 *                                    Engineering and Quality. This is what Handover reads.
 *
 * A system can be legitimately commissioned and still not be commissioning-ready — because its
 * drawings were never released, or a non-conformance is open against it. Collapsing the two would
 * make one of them a lie.
 *
 * UNKNOWN IS NEVER A PASS. A gate whose owning domain cannot be read, or which has nothing to judge,
 * reports UNKNOWN and blocks. That is the safety property the whole chain rests on: an unwired port
 * must not silently declare systems ready.
 */

export type GateState = 'READY' | 'BLOCKED' | 'UNKNOWN' | 'NOT_APPLICABLE';

export type GateId =
  | 'equipment'
  | 'installation'
  | 'engineering'
  | 'quality'
  | 'tests'
  | 'defects'
  | 'retests'
  | 'signoff'
  | 'certificates';

export interface ReadinessGate {
  id: GateId;
  label: string;
  state: GateState;
  /** What the state is based on, in words a reader can act on. Never a bare status. */
  reason: string;
  /** The domain that owns the answer, so a reader knows where to go and change it. */
  source: 'ELV device register' | 'Engineering' | 'Quality' | 'Testing & commissioning';
}

export interface SystemReadiness {
  gates: ReadinessGate[];
  /** Every gate READY or NOT_APPLICABLE. One BLOCKED or UNKNOWN gate is enough to say no. */
  commissioningReady: boolean;
  /** The gates standing in the way, in chain order — the sentence the Overview shows. */
  blocking: GateId[];
}

/**
 * Which Engineering disciplines count as "the drawings for this system".
 *
 * The two sides use different canonical vocabularies — `ElvSystem` here, the shared `Discipline`
 * dimension in Engineering — and only some values coincide. Where a system has a specific
 * discipline, that one counts; `elv` counts for every system, because a project that tags its whole
 * ELV package `elv` is not wrong, it is just coarser. A system with neither cannot be judged and
 * the gate says UNKNOWN rather than inventing a match.
 */
const ENGINEERING_DISCIPLINES: Record<string, readonly string[]> = {
  cctv: ['cctv', 'elv', 'security'],
  access_control: ['access_control', 'elv', 'security'],
  intrusion_alarm: ['security', 'elv'],
  fire_alarm: ['fire_alarm', 'elv'],
  public_address: ['elv'],
  structured_cabling: ['ict', 'elv'],
  network: ['ict', 'elv'],
  bms: ['bms', 'elv'],
  audio_visual: ['elv'],
  intercom: ['elv'],
  nurse_call: ['elv'],
  gate_barrier: ['security', 'elv'],
  parking_management: ['security', 'elv'],
  other: ['elv'],
};

/** A device counts as installed once it is physically in and terminated, or further along. */
const INSTALLED_STATUSES = new Set(['installed', 'terminated', 'tested', 'commissioned']);
const APPROVED_DRAWING_STATUSES = new Set(['approved', 'issued_for_construction', 'as_built']);
const OPEN_NCR_STATUSES = new Set(['raised', 'action_planned', 'corrected']);

export interface ReadinessFacts {
  system: string;
  /** T&C's own evidence, already derived by the workspace projection. */
  pointsTotal: number;
  pointsPassed: number;
  pointsFailing: number;
  pointsUntested: number;
  pointsEverFailed: number;
  openPunch: number;
  commissioned: boolean;
  signedOffBy: string | null;
  witnessedBy: string | null;
  /** Null when the owning domain could not be read — never an empty array standing in for it. */
  equipment: { tag: string; system: string; status: string; linked: boolean }[] | null;
  drawings: { discipline: string; status: string }[] | null;
  ncrs: { ncrNumber: string; system: string | null; status: string }[] | null;
  /** ITP requirements a person has linked to this system, with Quality's own result for each. */
  itpRequirements: { reference: string; activity: string; pointType: string; result: string }[];
}

const gate = (id: GateId, label: string, source: ReadinessGate['source'], state: GateState, reason: string): ReadinessGate =>
  ({ id, label, state, reason, source });

export function assessSystemReadiness(facts: ReadinessFacts): SystemReadiness {
  const gates: ReadinessGate[] = [
    equipmentGate(facts),
    installationGate(facts),
    engineeringGate(facts),
    qualityGate(facts),
    testsGate(facts),
    defectsGate(facts),
    retestsGate(facts),
    signoffGate(facts),
    certificatesGate(facts),
  ];

  const blocking = gates.filter((g) => g.state === 'BLOCKED' || g.state === 'UNKNOWN').map((g) => g.id);
  return { gates, blocking, commissioningReady: blocking.length === 0 };
}

function equipmentGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'equipment';
  const label = 'Equipment registered';
  const src = 'ELV device register' as const;
  if (f.equipment === null) return gate(id, label, src, 'UNKNOWN', 'The ELV device register could not be read.');
  const mine = f.equipment.filter((d) => d.linked || d.system === f.system);
  if (mine.length === 0) {
    return gate(id, label, src, 'UNKNOWN', 'No equipment is registered for this system, so there is nothing to say it is ready.');
  }
  const linked = mine.filter((d) => d.linked).length;
  return gate(id, label, src, 'READY', `${mine.length} device${mine.length === 1 ? '' : 's'} registered${linked > 0 ? `, ${linked} tied to this commissioning record` : ''}.`);
}

function installationGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'installation';
  const label = 'Installation complete';
  const src = 'ELV device register' as const;
  if (f.equipment === null) return gate(id, label, src, 'UNKNOWN', 'The ELV device register could not be read.');
  const mine = f.equipment.filter((d) => (d.linked || d.system === f.system) && d.status !== 'removed');
  if (mine.length === 0) return gate(id, label, src, 'UNKNOWN', 'No equipment is registered for this system.');
  const faulty = mine.filter((d) => d.status === 'faulty');
  const outstanding = mine.filter((d) => !INSTALLED_STATUSES.has(d.status) && d.status !== 'faulty');
  if (faulty.length > 0 || outstanding.length > 0) {
    const parts = [
      ...(outstanding.length > 0 ? [`${outstanding.length} not yet installed (${outstanding.slice(0, 3).map((d) => d.tag).join(', ')}${outstanding.length > 3 ? '…' : ''})`] : []),
      ...(faulty.length > 0 ? [`${faulty.length} faulty`] : []),
    ];
    return gate(id, label, src, 'BLOCKED', `${parts.join('; ')}.`);
  }
  return gate(id, label, src, 'READY', `All ${mine.length} device${mine.length === 1 ? '' : 's'} installed and terminated.`);
}

function engineeringGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'engineering';
  const label = 'Engineering released';
  const src = 'Engineering' as const;
  if (f.drawings === null) return gate(id, label, src, 'UNKNOWN', 'Engineering could not be read.');
  const accepted = ENGINEERING_DISCIPLINES[f.system] ?? ENGINEERING_DISCIPLINES.other;
  const mine = f.drawings.filter((d) => accepted.includes(d.discipline));
  if (mine.length === 0) {
    return gate(id, label, src, 'UNKNOWN', `No drawings on this project carry a discipline this system recognises (${accepted.join(', ')}).`);
  }
  const approved = mine.filter((d) => APPROVED_DRAWING_STATUSES.has(d.status));
  if (approved.length === 0) {
    return gate(id, label, src, 'BLOCKED', `${mine.length} drawing${mine.length === 1 ? '' : 's'} for this discipline, none approved for construction.`);
  }
  const pending = mine.length - approved.length;
  return gate(id, label, src, 'READY', `${approved.length} approved drawing${approved.length === 1 ? '' : 's'}${pending > 0 ? `, ${pending} still in review` : ''}.`);
}

function qualityGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'quality';
  const label = 'Quality clear';
  const src = 'Quality' as const;
  if (f.ncrs === null) return gate(id, label, src, 'UNKNOWN', 'Quality could not be read.');
  // A non-conformance with no system recorded is project-wide — Quality's own model says so — and a
  // project-wide NCR blocks every system rather than none.
  const mine = f.ncrs.filter((n) => OPEN_NCR_STATUSES.has(n.status) && (n.system === null || normalise(n.system) === f.system));
  const unresolvedItp = f.itpRequirements.filter((r) => r.result !== 'passed');
  if (mine.length > 0 || unresolvedItp.length > 0) {
    const parts = [
      ...(mine.length > 0 ? [`${mine.length} open NCR (${mine.slice(0, 3).map((n) => n.ncrNumber).join(', ')}${mine.length > 3 ? '…' : ''})`] : []),
      ...(unresolvedItp.length > 0 ? [`${unresolvedItp.length} linked ITP point${unresolvedItp.length === 1 ? '' : 's'} not passed`] : []),
    ];
    return gate(id, label, src, 'BLOCKED', `${parts.join('; ')}.`);
  }
  const linked = f.itpRequirements.length;
  return gate(id, label, src, 'READY', linked > 0
    ? `No open non-conformance, and all ${linked} linked ITP point${linked === 1 ? '' : 's'} passed.`
    : 'No open non-conformance against this system. No ITP is linked to it.');
}

function testsGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'tests';
  const label = 'Tests complete';
  const src = 'Testing & commissioning' as const;
  if (f.pointsTotal === 0) return gate(id, label, src, 'BLOCKED', 'No test points are defined, so nothing has been proven.');
  if (f.pointsUntested > 0 || f.pointsFailing > 0) {
    const parts = [
      ...(f.pointsUntested > 0 ? [`${f.pointsUntested} never executed`] : []),
      ...(f.pointsFailing > 0 ? [`${f.pointsFailing} failing`] : []),
    ];
    return gate(id, label, src, 'BLOCKED', `${parts.join(', ')} of ${f.pointsTotal} test points.`);
  }
  return gate(id, label, src, 'READY', `All ${f.pointsTotal} test point${f.pointsTotal === 1 ? '' : 's'} passed.`);
}

function defectsGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'defects';
  const label = 'Defects closed';
  const src = 'Testing & commissioning' as const;
  return f.openPunch > 0
    ? gate(id, label, src, 'BLOCKED', `${f.openPunch} punch item${f.openPunch === 1 ? '' : 's'} still open.`)
    : gate(id, label, src, 'READY', 'No open punch item.');
}

function retestsGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'retests';
  const label = 'Retests passed';
  const src = 'Testing & commissioning' as const;
  if (f.pointsEverFailed === 0) return gate(id, label, src, 'NOT_APPLICABLE', 'No test point has ever failed, so no retest was owed.');
  if (f.pointsFailing > 0) return gate(id, label, src, 'BLOCKED', `${f.pointsFailing} of ${f.pointsEverFailed} previously failed point${f.pointsEverFailed === 1 ? '' : 's'} still failing.`);
  return gate(id, label, src, 'READY', `${f.pointsEverFailed} point${f.pointsEverFailed === 1 ? '' : 's'} failed and passed on retest; the failures remain on record.`);
}

function signoffGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'signoff';
  const label = 'Witnessed sign-off';
  const src = 'Testing & commissioning' as const;
  if (!f.commissioned) return gate(id, label, src, 'BLOCKED', 'The system has not been commissioned.');
  if (!f.signedOffBy?.trim() || !f.witnessedBy?.trim()) {
    return gate(id, label, src, 'BLOCKED', 'Commissioned without both a signer and a witness on record.');
  }
  return gate(id, label, src, 'READY', `Signed off by ${f.signedOffBy}, witnessed by ${f.witnessedBy}.`);
}

/**
 * The evidence pack, NOT a formal certificate.
 *
 * T&C generates technical evidence: the test sheet, the run lineage behind every point, and the
 * witnessed sign-off. Issuing a controlled certificate is DocControl's authority, and nothing links
 * the two yet — so this gate reports the pack, and its reason says plainly what it does not cover.
 * Calling it "certificate issued" would be the second document authority this architecture forbids.
 */
function certificatesGate(f: ReadinessFacts): ReadinessGate {
  const id: GateId = 'certificates';
  const label = 'Evidence pack complete';
  const src = 'Testing & commissioning' as const;
  if (f.pointsTotal === 0) return gate(id, label, src, 'BLOCKED', 'No test sheet, so there is no evidence to pack.');
  if (!f.commissioned) return gate(id, label, src, 'BLOCKED', 'The pack is complete only once the system is signed off.');
  return gate(id, label, src, 'READY', `${f.pointsTotal} test point${f.pointsTotal === 1 ? '' : 's'} with their full run history, and a witnessed sign-off. Formal controlled issue is DocControl's and is not linked from here.`);
}

/** Quality records a system as free text; compare it the way a reader would, not byte for byte. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}
