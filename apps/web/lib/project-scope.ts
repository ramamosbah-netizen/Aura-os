// project-scope — the pure, URL-derived project context.
//
// PR-05. The single source of truth for "which project / area / discipline is the engineer (and
// therefore the AI) looking at" is the URL, never a separate React state. This module derives the
// structured scope from the URL and builds the URLs the setters navigate to. Because BOTH the UI
// provider (lib/project-context.tsx) and the global AI dock read scope through `readProjectScope`,
// the AI can never end up reasoning about a different project than the one on screen — the failure
// mode PR-05 exists to prevent. No React, no side effects; unit-tested in project-scope.test.ts.
//
// SECURITY BOUNDARY: this is UX/AI convenience only. It is NOT authorization. A user editing the
// projectId in the URL changes only what the UI *asks* for; the BFF → API → Postgres RLS remain the
// sole enforcement (see the RLS runtime: API runs as a NOBYPASSRLS role, tenant/row isolation live).
// Nothing here may be used to decide whether data is allowed — only which data is requested.

/** ELV disciplines (mirror the ELV device `system` field — not an invented backend entity). */
export const ELV_DISCIPLINES = [
  { id: 'cctv', label: 'CCTV' },
  { id: 'access-control', label: 'Access Control' },
  { id: 'anpr', label: 'ANPR' },
  { id: 'gate-barriers', label: 'Gate Barriers' },
  { id: 'intercom', label: 'Intercom' },
  { id: 'structured-cabling', label: 'Structured Cabling' },
  { id: 'fiber', label: 'Fiber' },
  { id: 'bms', label: 'BMS / KNX' },
] as const;

export type DisciplineId = (typeof ELV_DISCIPLINES)[number]['id'];

export interface ProjectScope {
  /** From the route: /project/:projectId. Null when not inside a project. */
  projectId: string | null;
  /** From the route: /project/:projectId/:section (the delivery module — engineering, site…). */
  section: string | null;
  /** From ?area= — a zone within the project (persists across module navigation). */
  areaId: string | null;
  /** From ?discipline= — the ELV discipline lens. */
  disciplineId: string | null;
}

export const EMPTY_SCOPE: ProjectScope = { projectId: null, section: null, areaId: null, disciplineId: null };

/** The path segments that are NOT delivery sections (so they don't leak into `section`). */
const NON_SECTIONS = new Set(['team']);

/**
 * Derive the structured scope from a pathname + query. Deterministic: same URL → same scope, on
 * both server prerender and client, so there is no hydration divergence and no place for a second
 * copy of the truth to drift from.
 */
export function readProjectScope(pathname: string, search: URLSearchParams): ProjectScope {
  const m = pathname.match(/^\/project\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (!m) return EMPTY_SCOPE;
  const projectId = decodeURIComponent(m[1]);
  const rawSection = m[2] ? decodeURIComponent(m[2]) : null;
  const section = rawSection && !NON_SECTIONS.has(rawSection) ? rawSection : null;
  return {
    projectId,
    section,
    areaId: search.get('area') || null,
    disciplineId: search.get('discipline') || null,
  };
}

/**
 * Build the URL for a scope change. Patches only `area`/`discipline` (the cross-cutting lenses) on
 * the CURRENT path — a `null`/'' value clears the param. Project and section are changed by
 * navigation (a different path), never by patching, which is why switching project cannot leave a
 * stale area/discipline behind: the new path simply has no such query.
 */
export function buildScopeUrl(
  pathname: string,
  search: URLSearchParams,
  patch: { area?: string | null; discipline?: string | null },
): string {
  const next = new URLSearchParams(search.toString());
  const put = (key: string, val: string | null | undefined) => {
    if (val) next.set(key, val);
    else next.delete(key);
  };
  if ('area' in patch) put('area', patch.area);
  if ('discipline' in patch) put('discipline', patch.discipline);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** The structured payload handed to the AI — IDs and scope, never display text. */
export interface ProjectAIContext {
  projectId: string | null;
  section: string | null;
  areaId: string | null;
  disciplineId: string | null;
  /** Non-identifying head fields, useful to the model but still not authorization. */
  projectRef: string | null;
  projectStatus: string | null;
}

export function toAIContext(scope: ProjectScope, head?: { reference?: string | null; status?: string | null } | null): ProjectAIContext {
  return {
    projectId: scope.projectId,
    section: scope.section,
    areaId: scope.areaId,
    disciplineId: scope.disciplineId,
    projectRef: head?.reference ?? null,
    projectStatus: head?.status ?? null,
  };
}
