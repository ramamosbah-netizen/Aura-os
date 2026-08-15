'use client';

import { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  readProjectScope, buildScopeUrl, toAIContext,
  type ProjectScope, type ProjectAIContext,
} from './project-scope';

// project-context — the React face of the URL-derived project scope (PR-05).
//
// The provider holds NO state of its own: every render it RE-DERIVES the scope from the current URL
// via the pure readProjectScope. Setters do not setState — they navigate (router.replace to a URL
// built by buildScopeUrl). This makes the classic bug impossible: there is no second copy of
// projectId/areaId/disciplineId that could drift from the address bar, so the AI (which reads the
// same URL) and the engineer (who reads the UI) are always looking at the same project.

export interface ProjectHead {
  id: string;
  title: string;
  reference: string | null;
  status: string;
}

export interface ProjectContextValue extends ProjectScope {
  /** Server-loaded head for the project in the URL (for display); null off a project route. */
  project: ProjectHead | null;
  /** Navigate the area (zone) lens. Pass null to clear. */
  setArea: (areaId: string | null) => void;
  /** Navigate the discipline lens. Pass null to clear. */
  setDiscipline: (disciplineId: string | null) => void;
  /** The structured payload for the AI — IDs, never UI text. */
  ai: ProjectAIContext;
}

const Ctx = createContext<ProjectContextValue | null>(null);

export function ProjectContextProvider({ project, children }: { project: ProjectHead | null; children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Re-derived from the URL every render — the single source of truth.
  const scope = useMemo(
    () => readProjectScope(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams],
  );

  // Divergence guard: the server-loaded project head and the URL both come from the same route
  // param, so they must agree. If they ever don't, the UI and AI could point at different projects —
  // shout in dev so it's caught at the source, never shipped silently.
  if (process.env.NODE_ENV !== 'production' && project && scope.projectId && project.id !== scope.projectId) {
    console.error(`[ProjectContext] divergence: server project "${project.id}" ≠ URL project "${scope.projectId}"`);
  }

  const navigate = useCallback(
    (patch: { area?: string | null; discipline?: string | null }) => {
      router.replace(buildScopeUrl(pathname, new URLSearchParams(searchParams.toString()), patch), { scroll: false });
    },
    [pathname, searchParams, router],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      ...scope,
      project,
      setArea: (areaId) => navigate({ area: areaId }),
      setDiscipline: (disciplineId) => navigate({ discipline: disciplineId }),
      ai: toAIContext(scope, project),
    }),
    [scope, project, navigate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the project context. Throws if used outside a ProjectContextProvider. */
export function useProjectContext(): ProjectContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useProjectContext must be used within a ProjectContextProvider');
  return c;
}

/** Read the project context if present, else null — for global chrome (e.g. the AI dock) that
 *  lives outside the project routes. */
export function useOptionalProjectContext(): ProjectContextValue | null {
  return useContext(Ctx);
}
