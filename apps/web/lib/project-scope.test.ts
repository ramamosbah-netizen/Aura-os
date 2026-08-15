import { describe, it, expect } from 'vitest';
import { readProjectScope, buildScopeUrl, toAIContext, EMPTY_SCOPE, ELV_DISCIPLINES } from './project-scope';

const sp = (q = '') => new URLSearchParams(q);

describe('readProjectScope — initialization', () => {
  it('returns empty scope off a project route', () => {
    expect(readProjectScope('/finance/invoices', sp())).toEqual(EMPTY_SCOPE);
    expect(readProjectScope('/', sp())).toEqual(EMPTY_SCOPE);
  });
  it('reads projectId from /project/:id with no section', () => {
    expect(readProjectScope('/project/P-100', sp())).toMatchObject({ projectId: 'P-100', section: null });
  });
  it('reads the delivery section from /project/:id/:section', () => {
    expect(readProjectScope('/project/P-100/engineering', sp())).toMatchObject({ projectId: 'P-100', section: 'engineering' });
    expect(readProjectScope('/project/P-100/quality', sp())).toMatchObject({ section: 'quality' });
  });
  it('excludes non-delivery segments (team) from section', () => {
    expect(readProjectScope('/project/P-100/team', sp())).toMatchObject({ projectId: 'P-100', section: null });
  });
  it('reads area and discipline from the query', () => {
    const s = readProjectScope('/project/P-100/site', sp('area=cluster-3&discipline=cctv'));
    expect(s).toEqual({ projectId: 'P-100', section: 'site', areaId: 'cluster-3', disciplineId: 'cctv' });
  });
  it('is deterministic — same URL yields an equal scope (no drift)', () => {
    const a = readProjectScope('/project/P/engineering', sp('area=z&discipline=fiber'));
    const b = readProjectScope('/project/P/engineering', sp('area=z&discipline=fiber'));
    expect(a).toEqual(b);
  });
});

describe('buildScopeUrl — setters', () => {
  it('sets area/discipline as query params on the current path', () => {
    expect(buildScopeUrl('/project/P/site', sp(), { area: 'cluster-3' })).toBe('/project/P/site?area=cluster-3');
    expect(buildScopeUrl('/project/P/site', sp('area=cluster-3'), { discipline: 'cctv' })).toBe('/project/P/site?area=cluster-3&discipline=cctv');
  });
  it('clears a param when the value is null/empty', () => {
    expect(buildScopeUrl('/project/P/site', sp('area=x&discipline=cctv'), { discipline: null })).toBe('/project/P/site?area=x');
    expect(buildScopeUrl('/project/P/site', sp('discipline=cctv'), { discipline: '' })).toBe('/project/P/site');
  });
  it('patches only the keys provided, leaving others intact', () => {
    expect(buildScopeUrl('/project/P/site', sp('area=x&discipline=cctv&tab=history'), { area: 'y' }))
      .toBe('/project/P/site?area=y&discipline=cctv&tab=history');
  });
  it('round-trips through readProjectScope', () => {
    const url = buildScopeUrl('/project/P/site', sp(), { area: 'cluster-3', discipline: 'anpr' });
    const [path, query] = url.split('?');
    expect(readProjectScope(path, sp(query))).toEqual({ projectId: 'P', section: 'site', areaId: 'cluster-3', disciplineId: 'anpr' });
  });
});

describe('scope isolation — no leakage between projects', () => {
  it('switching project (a new path) carries NO stale area/discipline', () => {
    // Engineer was deep in project A with a zone + discipline lens…
    const onA = readProjectScope('/project/A/quality', sp('area=zoneA&discipline=cctv'));
    expect(onA.areaId).toBe('zoneA');
    // …navigating to project B is a different path; its URL has no query, so the lens is gone.
    const onB = readProjectScope('/project/B/quality', sp());
    expect(onB).toEqual({ projectId: 'B', section: 'quality', areaId: null, disciplineId: null });
  });
  it('changing area does not touch discipline and vice versa', () => {
    const afterAreaChange = buildScopeUrl('/project/P/site', sp('area=old&discipline=cctv'), { area: 'new' });
    expect(afterAreaChange).toContain('discipline=cctv');
    expect(afterAreaChange).toContain('area=new');
  });
});

describe('toAIContext — structured AI boundary (IDs, not UI text)', () => {
  it('projects the scope + non-identifying head into a flat id payload', () => {
    const scope = readProjectScope('/project/P-9/engineering', sp('area=z3&discipline=fiber'));
    expect(toAIContext(scope, { reference: 'TSC-2026', status: 'active' })).toEqual({
      projectId: 'P-9', section: 'engineering', areaId: 'z3', disciplineId: 'fiber',
      projectRef: 'TSC-2026', projectStatus: 'active',
    });
  });
  it('tolerates a missing head', () => {
    expect(toAIContext(EMPTY_SCOPE)).toMatchObject({ projectId: null, projectRef: null, projectStatus: null });
  });
});

describe('ELV_DISCIPLINES', () => {
  it('exposes the known ELV systems as {id,label}', () => {
    expect(ELV_DISCIPLINES.map((d) => d.id)).toContain('cctv');
    expect(ELV_DISCIPLINES.every((d) => d.id && d.label)).toBe(true);
  });
});
