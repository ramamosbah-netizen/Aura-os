import { type Discipline } from './discipline';
import { ELV_SYSTEMS, type ElvSystem } from '../domain/elv-context';

/**
 * Which DISCIPLINES a given ELV SYSTEM's drawings are filed under (TC-GATE-11).
 *
 * TWO AXES, NOT ONE VOCABULARY BADLY SPELLED. A discipline is a TRADE — who draws it, who reviews
 * it, which consultant signs it. An ELV system is a SYSTEM WITHIN a trade — what it does, who
 * commissions it, what it is handed over as. `cctv` appears in both sets and means different things
 * in each: in `Discipline` it is "the CCTV drawing package"; in `ElvSystem` it is "the CCTV system
 * on this project". Collapsing them into one enum would not converge anything — it would erase the
 * distinction between what a drawing is filed as and what a system is.
 *
 * So this is a MAP, not a merge, and it is here because both sides already live in @aura/shared and
 * neither owns the relationship. It moved out of `modules/commissioning/domain/commissioning-
 * readiness.ts`, where it was a private `Record<string, readonly string[]>` that no other module
 * could see, that nothing checked, and that silently decided which drawings counted for which
 * system's readiness.
 *
 * THE TYPE IS THE ENFORCEMENT. `Record<ElvSystem, readonly Discipline[]>` means a new ELV system
 * fails to compile until it is mapped, and an invented discipline fails to compile at all. The
 * private version was strings on both sides, which is how `issued_for_construction` — a value no
 * domain has ever produced — survived in a sibling set for as long as it did.
 *
 * DELIBERATELY GENEROUS. Every system includes `elv`, because a project that files one coarse
 * "ELV" drawing package is the common case and its drawings genuinely do cover each system. The map
 * decides what a system RECOGNISES, not what proves it: a matched drawing still has to be approved
 * for the readiness gate to pass, and the gate says UNKNOWN — never READY — when nothing matches.
 */
export const ELV_SYSTEM_DISCIPLINES: Record<ElvSystem, readonly Discipline[]> = {
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

/**
 * The disciplines that cover a system, for an UNTRUSTED system value.
 *
 * Falls back to `other`'s mapping rather than to an empty list: a system this map has not heard of
 * still has ELV drawings, and returning nothing would make its readiness gate read "no drawings
 * recognised" — which is a statement about this map, not about the project.
 */
export function disciplinesForElvSystem(system: string | null | undefined): readonly Discipline[] {
  const key = (system ?? '').trim().toLowerCase();
  return (ELV_SYSTEMS as readonly string[]).includes(key)
    ? ELV_SYSTEM_DISCIPLINES[key as ElvSystem]
    : ELV_SYSTEM_DISCIPLINES.other;
}
