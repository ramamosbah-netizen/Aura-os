// `discipline` was promoted to @aura/shared as a shared platform dimension on its 2nd consumer
// (Procurement) — see shared/src/dimensions/discipline.ts (ADR-0012, Rule of Three). Re-exported
// here so every existing `./discipline` importer in the Engineering module keeps working unchanged.
export { type Discipline, DISCIPLINES, DEFAULT_DISCIPLINE, toDiscipline } from '@aura/shared';
