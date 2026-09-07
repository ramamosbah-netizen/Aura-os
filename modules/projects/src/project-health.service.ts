import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assessProjectHealth, type HealthSignal, type Id, type ProjectHealth } from '@aura/shared';
import { HEALTH_SIGNALS, unknownSignal, type HealthSignalDeclaration } from './domain/health-signals';
import { WBS_STORE, type WbsStore } from './wbs-store';
import { VARIATION_STORE, type VariationStore } from './variation-store';
import { DELAY_STORE, EOT_STORE, type DelayStore, type EotStore } from './delay-eot-store';

/**
 * Cross-domain project health — assembly.
 *
 * The rules in `domain/project-health.ts` combine signals; this asks for them. It holds no
 * interpretation of any domain's facts, including, as far as possible, its own: the four
 * Projects-owned signals below restate rules that already exist in the §23 assessment rather than
 * inventing parallel thresholds.
 *
 * READ-ONLY, AND STRUCTURALLY SO. There is no write path here and no caller that could produce
 * one. §2 authorises transitions, §27 authorises closeout, and this authorises nothing — asking a
 * project for its health must leave that project exactly as it was.
 */

/** What Quality reports about a project, in Quality's own terms and with Quality's own verdict. */
export interface QualityHealthPort {
  readProjectQualityHealth(tenantId: Id, projectId: Id): Promise<HealthSignal>;
}
/** What Commissioning reports, likewise judged by Commissioning. */
export interface CommissioningHealthPort {
  readProjectCommissioningHealth(tenantId: Id, projectId: Id): Promise<HealthSignal>;
}

/** What HSE reports, judged by HSE — see `readProjectHseHealth` for the thresholds and their reasons. */
export interface HseHealthPort {
  readProjectHseHealth(tenantId: Id, projectId: Id): Promise<HealthSignal>;
}

export const QUALITY_HEALTH = Symbol('QUALITY_HEALTH');
export const COMMISSIONING_HEALTH = Symbol('COMMISSIONING_HEALTH');
export const HSE_HEALTH = Symbol('HSE_HEALTH');

/** Every signal a provider is expected for, and the token that must be bound to answer it. */
export const EXPECTED_HEALTH_PROVIDERS: ReadonlyArray<{ signalId: string; token: symbol }> = [
  { signalId: 'quality-ncr', token: QUALITY_HEALTH },
  { signalId: 'commissioning-readiness', token: COMMISSIONING_HEALTH },
  { signalId: 'hse-exposure', token: HSE_HEALTH },
];

const decl = (id: string): HealthSignalDeclaration =>
  HEALTH_SIGNALS.find((s) => s.id === id) as HealthSignalDeclaration;

@Injectable()
export class ProjectHealthService {
  private readonly logger = new Logger('ProjectHealth');

  constructor(
    @Inject(WBS_STORE) private readonly wbs: WbsStore,
    @Inject(VARIATION_STORE) private readonly variations: VariationStore,
    @Inject(DELAY_STORE) private readonly delays: DelayStore,
    @Inject(EOT_STORE) private readonly eots: EotStore,
    // @Optional() @Inject(TOKEN) explicitly, for the reason this codebase has now hit twice: a
    // union-typed ctor param emits `Object` for design:paramtypes, Nest resolves nothing and
    // injects null in silence, and the gate that depended on it is inert on a system that has the
    // data. Here the failure would be quieter still — an unbound provider reports UNKNOWN, which
    // looks exactly like a domain that has not declared its semantics.
    @Optional() @Inject(QUALITY_HEALTH) private readonly quality: QualityHealthPort | null = null,
    @Optional() @Inject(COMMISSIONING_HEALTH) private readonly commissioning: CommissioningHealthPort | null = null,
    @Optional() @Inject(HSE_HEALTH) private readonly hse: HseHealthPort | null = null,
  ) {}

  /**
   * Ask every declared signal, and report what came back — including what did not.
   *
   * Every branch that cannot produce a verdict produces UNKNOWN with its cause, never an omission
   * and never a CLEAR. An omitted signal would quietly improve coverage, which is the one way this
   * module could start lying again.
   */
  async assess(tenantId: Id, projectId: Id): Promise<ProjectHealth> {
    const [owned, quality, commissioning, hse] = await Promise.all([
      this.ownSignals(tenantId, projectId),
      this.fromProvider(decl('quality-ncr'), this.quality
        ? () => (this.quality as QualityHealthPort).readProjectQualityHealth(tenantId, projectId)
        : null),
      this.fromProvider(decl('commissioning-readiness'), this.commissioning
        ? () => (this.commissioning as CommissioningHealthPort).readProjectCommissioningHealth(tenantId, projectId)
        : null),
      this.fromProvider(decl('hse-exposure'), this.hse
        ? () => (this.hse as HseHealthPort).readProjectHseHealth(tenantId, projectId)
        : null),
    ]);

    // The domains that have facts but no declared meaning for them. Reported, never omitted: their
    // absence is the difference between PARTIAL and a clean bill of health nobody earned.
    const undeclared = HEALTH_SIGNALS
      .filter((s) => !s.providerExpected)
      .map((s) => unknownSignal(s, 'SEMANTICS_UNDECLARED'));

    return assessProjectHealth([...owned, quality, commissioning, hse, ...undeclared]);
  }

  /**
   * Ask one provider, and turn every way it can fail into a distinguishable UNKNOWN.
   *
   * A provider that is expected and absent is a WIRING defect, not a domain gap, and it says so —
   * otherwise a forgotten binding would read identically to Engineering not having decided yet,
   * and nobody would go looking for the one that is actually fixable in an afternoon.
   */
  private async fromProvider(
    declaration: HealthSignalDeclaration,
    read: (() => Promise<HealthSignal>) | null,
  ): Promise<HealthSignal> {
    if (!read) return unknownSignal(declaration, 'PROVIDER_UNBOUND');
    try {
      return await read();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${declaration.domain} health unreadable: ${detail}`);
      return unknownSignal(declaration, 'PROVIDER_UNAVAILABLE', detail);
    }
  }

  /**
   * The four signals Projects genuinely owns.
   *
   * Their thresholds are the §23 assessment's, restated rather than re-decided: CPI and SPI below
   * one, change awaiting a decision, delay entitlement unresolved. Where a fact cannot be read the
   * signal is UNKNOWN, not CLEAR — Projects is held to the same rule as everyone else.
   */
  private async ownSignals(tenantId: Id, projectId: Id): Promise<HealthSignal[]> {
    const base = `/project/${encodeURIComponent(projectId)}`;
    const out: HealthSignal[] = [];

    // ── Schedule and cost, from earned value ──────────────────────────────────────────────────
    let spi: number | null = null;
    let cpi: number | null = null;
    let evmReadable = true;
    try {
      const nodes = await this.wbs.list({ tenantId, projectId });
      const sum = (pick: (n: (typeof nodes)[number]) => number): number => nodes.reduce((t, n) => t + (pick(n) || 0), 0);
      const pv = sum((n) => n.plannedValue);
      const ev = sum((n) => n.earnedValue ?? 0);
      const ac = sum((n) => n.actualCost ?? 0);
      // Null, not 1.0, when there is nothing to divide by. A project with no baseline has not
      // achieved an index of one; it has no index, and saying otherwise would report CLEAR for the
      // one condition §2 refuses to start execution over.
      spi = pv > 0 ? ev / pv : null;
      cpi = ac > 0 ? ev / ac : null;
    } catch (error) {
      evmReadable = false;
      this.logger.warn(`earned value unreadable for ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    out.push(
      !evmReadable
        ? unknownSignal(decl('schedule-performance'), 'PROVIDER_UNAVAILABLE')
        : spi === null
          ? { id: 'schedule-performance', domain: 'schedule', state: 'UNKNOWN', cause: 'PROVIDER_UNAVAILABLE', reason: 'No planned value has been baselined, so schedule performance cannot be measured.', href: `${base}/controls?tab=delivery` }
          : spi < 0.9
            ? { id: 'schedule-performance', domain: 'schedule', state: 'AT_RISK', reason: `SPI ${spi.toFixed(2)} — materially less has been earned than the plan called for.`, href: `${base}/controls?tab=quantities`, measure: { value: Number(spi.toFixed(2)) } }
            : spi < 1
              ? { id: 'schedule-performance', domain: 'schedule', state: 'WATCH', reason: `SPI ${spi.toFixed(2)} — slightly behind the plan.`, href: `${base}/controls?tab=quantities`, measure: { value: Number(spi.toFixed(2)) } }
              : { id: 'schedule-performance', domain: 'schedule', state: 'CLEAR' },
    );

    out.push(
      !evmReadable
        ? unknownSignal(decl('cost-performance'), 'PROVIDER_UNAVAILABLE')
        : cpi === null
          ? { id: 'cost-performance', domain: 'cost', state: 'UNKNOWN', cause: 'PROVIDER_UNAVAILABLE', reason: 'No actual cost has been posted, so cost performance cannot be measured.', href: `${base}/controls?tab=cost` }
          : cpi < 0.9
            ? { id: 'cost-performance', domain: 'cost', state: 'AT_RISK', reason: `CPI ${cpi.toFixed(2)} — spending materially ahead of the value earned.`, href: `${base}/controls?tab=cost`, measure: { value: Number(cpi.toFixed(2)) } }
            : cpi < 1
              ? { id: 'cost-performance', domain: 'cost', state: 'WATCH', reason: `CPI ${cpi.toFixed(2)} — slightly ahead of the value earned.`, href: `${base}/controls?tab=cost`, measure: { value: Number(cpi.toFixed(2)) } }
              : { id: 'cost-performance', domain: 'cost', state: 'CLEAR' },
    );

    // ── Commercial exposure. `CHANGE_PENDING_DECISION` stays canonical: this reads the same
    //    variations rather than counting them a second time under a new name. ───────────────────
    out.push(await this.safe(decl('commercial-exposure'), async () => {
      const rows = await this.variations.list({ tenantId, projectId });
      const undecided = rows.filter((v) => v.status === 'draft' || v.status === 'submitted').length;
      return undecided === 0
        ? { id: 'commercial-exposure', domain: 'commercial', state: 'CLEAR' }
        : {
          id: 'commercial-exposure',
          domain: 'commercial',
          state: 'WATCH',
          reason: `${undecided} variation${undecided === 1 ? '' : 's'} neither approved nor rejected, so the revised value is provisional.`,
          href: `${base}/controls?tab=variations`,
          measure: { value: undecided },
        };
    }));

    // ── Delay entitlement. Separate from schedule performance on purpose: one is measurement,
    //    the other is a contractual right that expires with the notice period. ─────────────────
    out.push(await this.safe(decl('delay-entitlement'), async () => {
      const [delays, eots] = await Promise.all([
        // These two filters are project-scoped only; the store applies the tenant bound itself.
        this.delays.list({ projectId }),
        this.eots.list({ projectId }),
      ]);
      const openDelays = delays.filter((d) => d.status === 'identified' || d.status === 'analysed').length;
      const undecidedEots = eots.filter((e) => e.status === 'submitted' || e.status === 'under_review').length;
      if (openDelays === 0 && undecidedEots === 0) return { id: 'delay-entitlement', domain: 'delay', state: 'CLEAR' };
      const parts = [
        ...(openDelays > 0 ? [`${openDelays} delay event${openDelays === 1 ? '' : 's'} unresolved`] : []),
        ...(undecidedEots > 0 ? [`${undecidedEots} extension claim${undecidedEots === 1 ? '' : 's'} awaiting a decision`] : []),
      ];
      return {
        id: 'delay-entitlement',
        domain: 'delay',
        // Unresolved entitlement is a right that lapses, not merely a note.
        state: openDelays > 0 ? 'AT_RISK' : 'WATCH',
        reason: `${parts.join(', ')} — entitlement expires with the notice period.`,
        href: `${base}/controls?tab=eot`,
        measure: { value: openDelays + undecidedEots },
      };
    }));

    return out;
  }

  /** Run one of Projects' own reads, reporting UNKNOWN rather than CLEAR if it cannot complete. */
  private async safe(declaration: HealthSignalDeclaration, read: () => Promise<HealthSignal>): Promise<HealthSignal> {
    try {
      return await read();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${declaration.domain} health unreadable: ${detail}`);
      return unknownSignal(declaration, 'PROVIDER_UNAVAILABLE', detail);
    }
  }
}
