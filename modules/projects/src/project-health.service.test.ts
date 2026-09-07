import { describe, expect, it, vi } from 'vitest';
import type { HealthSignal } from '@aura/shared';
import { ProjectHealthService, EXPECTED_HEALTH_PROVIDERS } from './project-health.service';
import { HEALTH_SIGNALS } from './domain/health-signals';

/**
 * §24 assembly — what the service reports once every domain has answered, or failed to.
 *
 * The rules have their own exhaustive invariants. These prove the SHAPE OF REALITY the rules will
 * actually be handed: six signals that can be judged today, three whose owning domains have not
 * declared what their facts mean, and every way a provider can fail to answer.
 *
 * The point being defended throughout: a project may not read as clear on evidence nobody supplied.
 */

const tenantId = 't1';
const projectId = 'p1';

type Node = { plannedValue: number; earnedValue?: number; actualCost?: number };

function build(over: {
  nodes?: Node[];
  variations?: { status: string }[];
  delays?: { status: string }[];
  eots?: { status: string }[];
  quality?: HealthSignal | Error | null;
  commissioning?: HealthSignal | Error | null;
  wbsThrows?: boolean;
} = {}) {
  const answer = (v: HealthSignal | Error | null | undefined, fallback: HealthSignal) =>
    v === null ? null : v instanceof Error ? { read: () => Promise.reject(v) } : { read: () => Promise.resolve(v ?? fallback) };

  const q = answer(over.quality, { id: 'quality-ncr', domain: 'quality', state: 'CLEAR' });
  const c = answer(over.commissioning, { id: 'commissioning-readiness', domain: 'commissioning', state: 'CLEAR' });

  return new ProjectHealthService(
    {
      list: async () => {
        if (over.wbsThrows) throw new Error('wbs store unavailable');
        return (over.nodes ?? [{ plannedValue: 100, earnedValue: 100, actualCost: 100 }]) as never;
      },
    } as never,
    { list: async () => (over.variations ?? []) as never } as never,
    { list: async () => (over.delays ?? []) as never } as never,
    { list: async () => (over.eots ?? []) as never } as never,
    q ? ({ readProjectQualityHealth: q.read } as never) : null,
    c ? ({ readProjectCommissioningHealth: c.read } as never) : null,
  );
}

const byId = (v: { signals: HealthSignal[] }, id: string) => v.signals.find((s) => s.id === id);

describe('project health assembly', () => {
  it('1. six readable and clear, three undeclared → CLEAR · PARTIAL, and not reassuring', async () => {
    // The state the two axes were designed for. Nothing is wrong in anything we could judge, and
    // three domains have not said what their facts mean — so the project is NOT given a clean bill
    // of health it has not earned.
    const v = await build().assess(tenantId, projectId);

    expect(v.severity).toBe('CLEAR');
    expect(v.coverage).toBe('PARTIAL');
    expect(v.reassuring).toBe(false);

    expect(v.unknown.map((s) => s.domain).sort()).toEqual(['engineering', 'hse', 'procurement']);
    // And each says WHY, in terms of the owning domain — not "no data".
    for (const s of v.unknown) {
      expect(s.cause, s.domain).toBe('SEMANTICS_UNDECLARED');
      expect(s.reason, s.domain).toMatch(/has not declared/);
    }
  });

  it('2. a major Quality condition + three undeclared → Quality severity · PARTIAL', async () => {
    const v = await build({
      quality: { id: 'quality-ncr', domain: 'quality', state: 'CRITICAL', reason: '2 major non-conformances still open.', href: '/project/p1/workspace/quality' },
    }).assess(tenantId, projectId);

    // The severity is Quality's, passed through — Projects did not re-derive it from a count.
    expect(v.severity).toBe('CRITICAL');
    expect(v.coverage).toBe('PARTIAL');
    expect(v.concerns[0]).toMatchObject({ domain: 'quality', reason: '2 major non-conformances still open.' });
    // The known critical does not erase the three unknowns.
    expect(v.unknown).toHaveLength(3);
  });

  it('3. a Commissioning critical + Quality clear + three undeclared → CRITICAL · PARTIAL', async () => {
    const v = await build({
      quality: { id: 'quality-ncr', domain: 'quality', state: 'CLEAR' },
      commissioning: { id: 'commissioning-readiness', domain: 'commissioning', state: 'CRITICAL', reason: '1 system failed testing.', href: '/project/p1/workspace/testing' },
    }).assess(tenantId, projectId);

    expect(v.severity).toBe('CRITICAL');
    expect(v.coverage).toBe('PARTIAL');
    expect(v.concerns.map((c) => c.domain)).toEqual(['commissioning']);
    expect(v.unknown).toHaveLength(3);
  });

  it('4. a provider that fails at runtime keeps the severity already known and degrades coverage', async () => {
    // The case that separates the two axes in production rather than in theory: something is
    // genuinely wrong, and something else could not be checked. Neither cancels the other.
    const v = await build({
      quality: { id: 'quality-ncr', domain: 'quality', state: 'CRITICAL', reason: '2 major non-conformances still open.' },
      commissioning: new Error('commissioning database unreachable'),
    }).assess(tenantId, projectId);

    expect(v.severity).toBe('CRITICAL');
    expect(v.coverage).toBe('PARTIAL');
    // Four unknowns now: the three undeclared plus the one that broke — and they are
    // DISTINGUISHABLE, because a failed provider is an incident and an undeclared domain is a
    // conversation.
    expect(v.unknown).toHaveLength(4);
    expect(byId(v, 'commissioning-readiness')).toMatchObject({ state: 'UNKNOWN', cause: 'PROVIDER_UNAVAILABLE' });
    expect(byId(v, 'commissioning-readiness')?.reason).toMatch(/commissioning database unreachable/);
  });
});

describe('composition completeness', () => {
  it('reports an expected-but-unbound provider as a wiring defect, not a domain gap', async () => {
    // The failure this codebase has now hit twice: an optional port nobody bound, resolving to
    // null in silence. Here it would be quieter still — an unbound provider reports UNKNOWN, which
    // looks identical to a domain that has not declared its semantics. So it says which.
    const v = await build({ quality: null }).assess(tenantId, projectId);

    expect(byId(v, 'quality-ncr')).toMatchObject({ state: 'UNKNOWN', cause: 'PROVIDER_UNBOUND' });
    expect(byId(v, 'quality-ncr')?.reason).toMatch(/wiring defect, not a missing record/);
    expect(v.coverage).toBe('PARTIAL');
  });

  it('declares a provider token for every signal that expects one, and none for those that do not', () => {
    // Guards the registry against the two ways it can rot: a signal marked answerable with nothing
    // able to answer it, and a token left behind for a signal that no longer expects one.
    const expectsProvider = HEALTH_SIGNALS.filter((s) => s.providerExpected).map((s) => s.id);
    const ownedByProjects = ['schedule-performance', 'delay-entitlement', 'cost-performance', 'commercial-exposure'];
    const needsPort = expectsProvider.filter((id) => !ownedByProjects.includes(id));

    expect(EXPECTED_HEALTH_PROVIDERS.map((p) => p.signalId).sort()).toEqual(needsPort.sort());
  });

  it('gives every undeclared signal a reason in the owning domain\'s terms', () => {
    // An undeclared signal with no explanation would read as an oversight rather than a decision.
    for (const s of HEALTH_SIGNALS.filter((d) => !d.providerExpected)) {
      expect(s.undeclaredReason, s.id).toBeTruthy();
      expect(s.undeclaredReason, s.id).toMatch(/declare/i);
    }
  });
});

describe('the four signals Projects owns', () => {
  it('reports no baseline as UNKNOWN, never as clear', async () => {
    // A project with nothing planned has not achieved an index of one; it has no index. Reporting
    // CLEAR here would give a reassuring reading to the exact condition §2 refuses to start
    // execution over.
    const v = await build({ nodes: [{ plannedValue: 0 }] }).assess(tenantId, projectId);
    expect(byId(v, 'schedule-performance')).toMatchObject({ state: 'UNKNOWN' });
    expect(byId(v, 'cost-performance')).toMatchObject({ state: 'UNKNOWN' });
    expect(v.severity).toBe('CLEAR');
    expect(v.coverage).toBe('PARTIAL');
  });

  it('grades schedule and cost by how far behind, not merely whether', async () => {
    const slight = await build({ nodes: [{ plannedValue: 100, earnedValue: 95, actualCost: 95 }] }).assess(tenantId, projectId);
    expect(byId(slight, 'schedule-performance')).toMatchObject({ state: 'WATCH' });

    const material = await build({ nodes: [{ plannedValue: 100, earnedValue: 50, actualCost: 100 }] }).assess(tenantId, projectId);
    expect(byId(material, 'schedule-performance')).toMatchObject({ state: 'AT_RISK' });
    expect(byId(material, 'cost-performance')).toMatchObject({ state: 'AT_RISK' });
    expect(material.severity).toBe('AT_RISK');
  });

  it('reads the same variations as the canonical change check rather than counting them again', async () => {
    // §23's CHANGE_PENDING_DECISION stays canonical. This restates it; it does not add a second
    // commercial signal that would make one problem look like two.
    const v = await build({ variations: [{ status: 'draft' }, { status: 'submitted' }, { status: 'approved' }] }).assess(tenantId, projectId);
    expect(byId(v, 'commercial-exposure')).toMatchObject({ state: 'WATCH', measure: { value: 2 } });
  });

  it('keeps delay entitlement separate from schedule performance', async () => {
    // Both survive, and neither derives from the other: one is a measurement, the other a
    // contractual right that lapses with the notice period.
    const v = await build({
      nodes: [{ plannedValue: 100, earnedValue: 100, actualCost: 100 }],
      delays: [{ status: 'identified' }],
    }).assess(tenantId, projectId);

    expect(byId(v, 'schedule-performance')).toMatchObject({ state: 'CLEAR' });
    expect(byId(v, 'delay-entitlement')).toMatchObject({ state: 'AT_RISK' });
  });

  it('reports its own unreadable facts as UNKNOWN, holding Projects to the same rule as everyone else', async () => {
    const v = await build({ wbsThrows: true }).assess(tenantId, projectId);
    expect(byId(v, 'schedule-performance')).toMatchObject({ state: 'UNKNOWN', cause: 'PROVIDER_UNAVAILABLE' });
    expect(byId(v, 'cost-performance')).toMatchObject({ state: 'UNKNOWN', cause: 'PROVIDER_UNAVAILABLE' });
  });
});

describe('health decides nothing', () => {
  it('exposes no method that could change a project', () => {
    // §2 authorises transitions, §27 authorises closeout, §24 authorises nothing. Asserted on the
    // surface rather than trusted: a `finalize`, `set` or `change` appearing here later is the
    // moment this quietly becomes a third gate.
    //
    // Matched by verb rather than by an exact list, because `private` is erased at runtime — an
    // exact list would just enumerate the internal helpers and would have to be edited every time
    // one was added, which is how a guard stops guarding.
    const surface = Object.getOwnPropertyNames(ProjectHealthService.prototype).filter((n) => n !== 'constructor');
    expect(surface).toContain('assess');
    for (const name of surface) {
      expect(name, `${name} reads like a write`).not.toMatch(/^(set|update|change|finalize|approve|reject|cancel|delete|create|post|write|save)/i);
    }
  });

  it('leaves every collaborator read-only', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const service = new ProjectHealthService(
      { list } as never, { list } as never, { list } as never, { list } as never, null, null,
    );
    await service.assess(tenantId, projectId);
    // Nothing but reads happened. A write would need a method these stubs do not have, and the
    // absence of one is the proof.
    expect(list).toHaveBeenCalled();
  });
});
